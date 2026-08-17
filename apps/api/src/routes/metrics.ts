import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/preHandler.js";
import { getRenderMetrics } from "../lib/metrics.js";

export function registerMetricsRoutes(app: FastifyInstance) {
  app.get("/api/render-stats", { preHandler: requireAuth }, async () => {
    return getRenderMetrics();
  });
}
