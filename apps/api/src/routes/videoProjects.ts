import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@manim-saas/db";
import { CREDIT_COSTS, InsufficientCreditsError, deductCredits, getBalance } from "@manim-saas/db/credits";
import { requireAuth } from "../auth/preHandler.js";
import { planStoryboard } from "../llm/planStoryboard.js";
import { runVideoGeneration } from "../videoGeneration.js";

const createSchema = z.object({
  prompt: z.string().min(3).max(500),
});

export function registerVideoProjectRoutes(app: FastifyInstance) {
  app.post(
    "/api/video-projects",
    { preHandler: requireAuth, config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (request, reply) => {
    const body = createSchema.parse(request.body);

    const balance = await getBalance(request.userId);
    if (balance < CREDIT_COSTS.STORYBOARD_PLAN) {
      return reply
        .code(402)
        .send({ error: `Insufficient credits: have ${balance}, need ${CREDIT_COSTS.STORYBOARD_PLAN}` });
    }

    const videoProject = await prisma.videoProject.create({
      data: { userId: request.userId, title: body.prompt.slice(0, 80), prompt: body.prompt, status: "PLANNING" },
    });

    let storyboard;
    try {
      storyboard = await planStoryboard(body.prompt);
    } catch (err) {
      await prisma.videoProject.update({
        where: { id: videoProject.id },
        data: { status: "FAILED", errorMessage: "Failed to plan a storyboard for this prompt" },
      });
      request.log.error(err, "storyboard planning failed");
      return reply.code(502).send({ error: "Failed to plan a storyboard for this prompt" });
    }

    try {
      await deductCredits(request.userId, CREDIT_COSTS.STORYBOARD_PLAN, "STORYBOARD_PLAN");
    } catch (err) {
      await prisma.videoProject.update({
        where: { id: videoProject.id },
        data: { status: "FAILED", errorMessage: "Insufficient credits" },
      });
      if (err instanceof InsufficientCreditsError) {
        return reply.code(402).send({ error: err.message });
      }
      throw err;
    }

    await Promise.all(
      storyboard.scenes.map((s, i) =>
        prisma.scene.create({
          data: {
            videoProjectId: videoProject.id,
            order: i,
            narration: s.narration,
            visualIntent: s.visualIntent,
            explanation: s.explanation,
            sceneClassName: s.sceneClassName,
            status: "QUEUED",
          },
        })
      )
    );

    const updated = await prisma.videoProject.update({
      where: { id: videoProject.id },
      data: { status: "PLANNED", title: storyboard.title },
    });
    const scenes = await prisma.scene.findMany({
      where: { videoProjectId: videoProject.id },
      orderBy: { order: "asc" },
    });

    reply.code(201).send({ videoProject: updated, scenes });
  });

  app.get("/api/video-projects", { preHandler: requireAuth }, async (request) => {
    return prisma.videoProject.findMany({
      where: { userId: request.userId },
      orderBy: { createdAt: "desc" },
    });
  });

  app.get<{ Params: { id: string } }>(
    "/api/video-projects/:id",
    { preHandler: requireAuth },
    async (request, reply) => {
      const videoProject = await loadOwnedVideoProject(request.params.id, request.userId);
      if (!videoProject) return reply.code(404).send({ error: "Video project not found" });

      const scenes = await prisma.scene.findMany({
        where: { videoProjectId: videoProject.id },
        orderBy: { order: "asc" },
      });

      return { videoProject, scenes };
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/video-projects/:id/generate",
    { preHandler: requireAuth, config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const videoProject = await loadOwnedVideoProject(request.params.id, request.userId);
      if (!videoProject) return reply.code(404).send({ error: "Video project not found" });
      if (videoProject.status === "GENERATING") {
        return reply.code(409).send({ error: "Generation is already in progress" });
      }

      await prisma.videoProject.update({
        where: { id: videoProject.id },
        data: { status: "GENERATING", errorMessage: null },
      });

      // Fire-and-forget: this can take minutes across several scenes (LLM
      // codegen + a render each), so the client polls GET /:id instead of
      // holding one long request open.
      runVideoGeneration(videoProject.id, request.userId).catch((err) => {
        request.log.error(err, "video generation pipeline crashed");
      });

      reply.code(202).send({ status: "GENERATING" });
    }
  );
}

export async function loadOwnedVideoProject(id: string, userId: string) {
  try {
    const videoProject = await prisma.videoProject.findUnique({ where: { id } });
    if (!videoProject || videoProject.userId !== userId) return null;
    return videoProject;
  } catch {
    return null;
  }
}
