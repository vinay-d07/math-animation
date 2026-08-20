import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@manim-saas/db";
import { CREDIT_COSTS, InsufficientCreditsError, deductCredits, getBalance } from "@manim-saas/db/credits";
import { requireAuth } from "../auth/preHandler.js";
import { planStoryboard } from "../llm/planStoryboard.js";
import { runVideoGeneration } from "../videoGeneration.js";

const createSchema = z.object({
  prompt: z.string().min(3).max(500),
  mode: z.enum(["SCENES", "SHORT"]).default("SCENES"),
});

const updateSceneSchema = z.object({
  narration: z.string().min(1).max(900).optional(),
  visualIntent: z.string().min(1).max(600).optional(),
});

const reorderSchema = z.object({
  sceneIds: z.array(z.string()).min(1),
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
      data: { userId: request.userId, title: body.prompt.slice(0, 80), prompt: body.prompt, mode: body.mode, status: "PLANNING" },
    });

    let storyboard;
    try {
      storyboard = await planStoryboard(body.prompt, body.mode);
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

  // Storyboard editing — narration/visual-intent edits, deletion, and
  // reordering are only allowed while the project is still PLANNED (i.e.
  // before "Generate" is pressed). Once generation starts, scenes are
  // being actively consumed by the render pipeline and edits would race it.
  app.patch<{ Params: { id: string; sceneId: string } }>(
    "/api/video-projects/:id/scenes/:sceneId",
    { preHandler: requireAuth },
    async (request, reply) => {
      const videoProject = await loadOwnedVideoProject(request.params.id, request.userId);
      if (!videoProject) return reply.code(404).send({ error: "Video project not found" });
      if (videoProject.status !== "PLANNED") {
        return reply.code(409).send({ error: "Scenes can only be edited before generation starts" });
      }

      const scene = await prisma.scene.findUnique({ where: { id: request.params.sceneId } });
      if (!scene || scene.videoProjectId !== videoProject.id) {
        return reply.code(404).send({ error: "Scene not found" });
      }

      const body = updateSceneSchema.parse(request.body);
      const updated = await prisma.scene.update({ where: { id: scene.id }, data: body });
      return updated;
    }
  );

  app.delete<{ Params: { id: string; sceneId: string } }>(
    "/api/video-projects/:id/scenes/:sceneId",
    { preHandler: requireAuth },
    async (request, reply) => {
      const videoProject = await loadOwnedVideoProject(request.params.id, request.userId);
      if (!videoProject) return reply.code(404).send({ error: "Video project not found" });
      if (videoProject.status !== "PLANNED") {
        return reply.code(409).send({ error: "Scenes can only be edited before generation starts" });
      }

      const scene = await prisma.scene.findUnique({ where: { id: request.params.sceneId } });
      if (!scene || scene.videoProjectId !== videoProject.id) {
        return reply.code(404).send({ error: "Scene not found" });
      }

      const remaining = await prisma.scene.findMany({
        where: { videoProjectId: videoProject.id, id: { not: scene.id } },
        orderBy: { order: "asc" },
      });
      if (remaining.length === 0) {
        return reply.code(409).send({ error: "A video needs at least one scene" });
      }

      await prisma.scene.delete({ where: { id: scene.id } });
      // Close the gap left in `order` so scenes stay contiguously 0..N-1 —
      // generation and the final stitch both rely on `order` for sequencing.
      await Promise.all(remaining.map((s, i) => prisma.scene.update({ where: { id: s.id }, data: { order: i } })));

      return { ok: true };
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/video-projects/:id/scenes/reorder",
    { preHandler: requireAuth },
    async (request, reply) => {
      const videoProject = await loadOwnedVideoProject(request.params.id, request.userId);
      if (!videoProject) return reply.code(404).send({ error: "Video project not found" });
      if (videoProject.status !== "PLANNED") {
        return reply.code(409).send({ error: "Scenes can only be reordered before generation starts" });
      }

      const body = reorderSchema.parse(request.body);
      const existing = await prisma.scene.findMany({ where: { videoProjectId: videoProject.id } });
      const existingIds = new Set(existing.map((s) => s.id));

      if (body.sceneIds.length !== existing.length || !body.sceneIds.every((id) => existingIds.has(id))) {
        return reply.code(400).send({ error: "sceneIds must be exactly this project's scene ids" });
      }

      await Promise.all(body.sceneIds.map((sceneId, i) => prisma.scene.update({ where: { id: sceneId }, data: { order: i } })));

      const scenes = await prisma.scene.findMany({ where: { videoProjectId: videoProject.id }, orderBy: { order: "asc" } });
      return scenes;
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
