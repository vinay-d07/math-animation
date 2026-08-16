import type { FastifyInstance } from "fastify";
import { getBalance } from "@manim-saas/db/credits";
import { requireAuth } from "../auth/preHandler.js";

export function registerMeRoutes(app: FastifyInstance) {
  app.get("/api/me", { preHandler: requireAuth }, async (request) => {
    const balance = await getBalance(request.userId);
    return { userId: request.userId, balance };
  });
}
