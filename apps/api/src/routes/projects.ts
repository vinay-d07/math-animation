import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma, VersionAuthor } from "@manim-saas/db";
import { requireAuth } from "../auth/preHandler.js";
import { createVersion } from "../versions.js";

const STARTER_CODE = `from manim import *


class NewScene(Scene):
    def construct(self):
        text = Text("Hello, Manim!")
        self.play(Write(text))
        self.wait()
`;

const createProjectSchema = z.object({
  title: z.string().min(1).max(200).default("Untitled project"),
});

const createVersionSchema = z.object({
  code: z.string().min(1),
  sceneClassName: z.string().min(1),
  createdBy: z.enum(["USER", "AI"]),
});

export function registerProjectRoutes(app: FastifyInstance) {
  app.post("/api/projects", { preHandler: requireAuth }, async (request, reply) => {
    const body = createProjectSchema.parse(request.body ?? {});

    const project = await prisma.project.create({
      data: { userId: request.userId, title: body.title },
    });
    const version = await createVersion(project.id, STARTER_CODE, "NewScene", VersionAuthor.USER);

    reply.code(201).send({ project, currentVersion: version });
  });

  app.get("/api/projects", { preHandler: requireAuth }, async (request) => {
    return prisma.project.findMany({
      where: { userId: request.userId },
      orderBy: { updatedAt: "desc" },
    });
  });

  app.get<{ Params: { id: string } }>(
    "/api/projects/:id",
    { preHandler: requireAuth },
    async (request, reply) => {
      const project = await loadOwnedProject(request.params.id, request.userId);
      if (!project) return reply.code(404).send({ error: "Project not found" });

      const currentVersion = project.currentVersionId
        ? await prisma.version.findUnique({ where: { id: project.currentVersionId } })
        : null;

      return { project, currentVersion };
    }
  );

  app.get<{ Params: { id: string } }>(
    "/api/projects/:id/versions",
    { preHandler: requireAuth },
    async (request, reply) => {
      const project = await loadOwnedProject(request.params.id, request.userId);
      if (!project) return reply.code(404).send({ error: "Project not found" });

      return prisma.version.findMany({
        where: { projectId: project.id },
        orderBy: { createdAt: "desc" },
      });
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/projects/:id/versions",
    { preHandler: requireAuth },
    async (request, reply) => {
      const project = await loadOwnedProject(request.params.id, request.userId);
      if (!project) return reply.code(404).send({ error: "Project not found" });

      const body = createVersionSchema.parse(request.body);
      const version = await createVersion(
        project.id,
        body.code,
        body.sceneClassName,
        VersionAuthor[body.createdBy],
        project.currentVersionId
      );

      reply.code(201).send(version);
    }
  );

  app.post<{ Params: { id: string; versionId: string } }>(
    "/api/projects/:id/versions/:versionId/rollback",
    { preHandler: requireAuth },
    async (request, reply) => {
      const project = await loadOwnedProject(request.params.id, request.userId);
      if (!project) return reply.code(404).send({ error: "Project not found" });

      const target = await prisma.version
        .findUnique({ where: { id: request.params.versionId } })
        .catch(() => null);
      if (!target || target.projectId !== project.id) {
        return reply.code(404).send({ error: "Version not found" });
      }

      const version = await createVersion(
        project.id,
        target.code,
        target.sceneClassName,
        target.createdBy,
        project.currentVersionId
      );

      reply.code(201).send(version);
    }
  );
}

export async function loadOwnedProject(projectId: string, userId: string) {
  try {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project || project.userId !== userId) return null;
    return project;
  } catch {
    // Malformed id (not a valid ObjectId) — treat as not-found rather than 500.
    return null;
  }
}
