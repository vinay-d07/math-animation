import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma, RenderQuality, VersionAuthor } from "@manim-saas/db";
import { CREDIT_COSTS, InsufficientCreditsError, deductCredits } from "@manim-saas/db/credits";
import { requireAuth } from "../auth/preHandler.js";
import { validateSceneCode } from "../validation/astGuard.js";
import { renderQueue } from "../queue/renderQueue.js";
import { ensureVersion } from "../versions.js";
import { openSSE } from "../lib/sse.js";

const renderRequestSchema = z.object({
  code: z.string().min(1),
  sceneClassName: z.string().min(1),
  quality: z.enum(["preview", "final"]),
});

const QUALITY_TO_WORKER = { preview: "low", final: "high" } as const;
const QUALITY_TO_DB = { preview: RenderQuality.PREVIEW, final: RenderQuality.FINAL } as const;
const QUALITY_TO_CREDIT_REASON = {
  preview: "PREVIEW_RENDER",
  final: "FINAL_RENDER",
} as const;

const POLL_INTERVAL_MS = 1000;
const MAX_WAIT_MS = 5 * 60 * 1000;

export function registerRenderRoutes(app: FastifyInstance) {
  app.post<{ Params: { id: string } }>(
    "/api/projects/:id/render",
    { preHandler: requireAuth, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const project = await prisma.project
        .findUnique({ where: { id: request.params.id } })
        .catch(() => null);
      if (!project || project.userId !== request.userId) {
        return reply.code(404).send({ error: "Project not found" });
      }

      const body = renderRequestSchema.parse(request.body);

      const validation = await validateSceneCode(body.code);
      if (!validation.ok) {
        return reply.code(400).send({ error: validation.reason ?? "Invalid scene code" });
      }

      const version = await ensureVersion(project.id, body.code, body.sceneClassName, VersionAuthor.USER);

      const cost = CREDIT_COSTS[QUALITY_TO_CREDIT_REASON[body.quality]];
      const jobId = randomUUID();

      try {
        await deductCredits(request.userId, cost, QUALITY_TO_CREDIT_REASON[body.quality], jobId);
      } catch (err) {
        if (err instanceof InsufficientCreditsError) {
          return reply.code(402).send({ error: err.message });
        }
        throw err;
      }

      const render = await prisma.render.create({
        data: {
          projectId: project.id,
          versionId: version.id,
          quality: QUALITY_TO_DB[body.quality],
          status: "QUEUED",
          jobId,
        },
      });

      await renderQueue.add(
        "render",
        {
          sceneCode: body.code,
          sceneClassName: body.sceneClassName,
          quality: QUALITY_TO_WORKER[body.quality],
          renderId: render.id,
        },
        { jobId }
      );

      reply.code(201).send({ renderId: render.id, jobId, versionId: version.id });
    }
  );

  app.get<{ Params: { id: string } }>(
    "/api/renders/:id/events",
    { preHandler: requireAuth },
    async (request, reply) => {
      const render = await prisma.render.findUnique({ where: { id: request.params.id } }).catch(() => null);
      if (!render) return reply.code(404).send({ error: "Render not found" });

      const project = await prisma.project.findUnique({ where: { id: render.projectId } });
      if (!project || project.userId !== request.userId) {
        return reply.code(404).send({ error: "Render not found" });
      }

      const sse = openSSE(reply);
      const startedAt = Date.now();
      let lastStatus = render.status;

      if (lastStatus === "COMPLETED") {
        sse.send("status", {
          status: "COMPLETED",
          outputUrl: render.outputPath ?? undefined,
          durationMs: render.durationMs,
        });
        sse.close();
        return;
      }
      if (lastStatus === "FAILED") {
        sse.send("status", { status: "FAILED", errorMessage: render.errorMessage });
        sse.close();
        return;
      }

      sse.send("status", { status: lastStatus });

      const interval = setInterval(async () => {
        const latest = await prisma.render.findUnique({ where: { id: render.id } });
        if (!latest) return;

        if (latest.status === "COMPLETED") {
          sse.send("status", {
            status: "COMPLETED",
            outputUrl: latest.outputPath ?? undefined,
            durationMs: latest.durationMs,
          });
          clearInterval(interval);
          sse.close();
          return;
        }

        if (latest.status === "FAILED") {
          sse.send("status", { status: "FAILED", errorMessage: latest.errorMessage });
          clearInterval(interval);
          sse.close();
          return;
        }

        if (latest.status !== lastStatus) {
          lastStatus = latest.status;
          sse.send("status", { status: latest.status });
        }

        if (Date.now() - startedAt > MAX_WAIT_MS) {
          sse.send("status", { status: "TIMEOUT" });
          clearInterval(interval);
          sse.close();
        }
      }, POLL_INTERVAL_MS);

      request.raw.on("close", () => clearInterval(interval));
    }
  );
}
