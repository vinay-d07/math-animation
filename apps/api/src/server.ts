import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";
import { InsufficientCreditsError } from "@manim-saas/db/credits";
import { env } from "./env.js";
import { connection } from "./queue/connection.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerRenderRoutes } from "./routes/render.js";
import { registerAiEditRoutes } from "./routes/aiEdit.js";
import { registerWebhookRoutes } from "./routes/webhooks.js";
import { registerMeRoutes } from "./routes/me.js";
import { registerVideoProjectRoutes } from "./routes/videoProjects.js";
import { registerMetricsRoutes } from "./routes/metrics.js";

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: string;
  }
}

const app = Fastify({ logger: true });

await app.register(cors, { origin: env.FRONTEND_ORIGIN });

// Redis-backed so the limit holds across every API instance, not just one
// process's memory — each render/generation request now spends real E2B
// sandbox time, so an unthrottled endpoint is a direct line to a bill, not
// just a UX problem. This is the generous global backstop; the routes that
// actually trigger a render or an LLM call set their own tighter limits
// (see their `config.rateLimit`).
await app.register(rateLimit, {
  max: 300,
  timeWindow: "1 minute",
  redis: connection,
});

// Capture the raw request body alongside the parsed JSON so webhook signature
// verification (Clerk/svix) has something to check against.
app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
  req.rawBody = body as string;
  try {
    done(null, body ? JSON.parse(body as string) : {});
  } catch (err) {
    done(err as Error, undefined);
  }
});

app.get("/health", async () => ({ status: "ok" }));

registerMeRoutes(app);
registerProjectRoutes(app);
registerRenderRoutes(app);
registerAiEditRoutes(app);
registerWebhookRoutes(app);
registerVideoProjectRoutes(app);
registerMetricsRoutes(app);

app.setErrorHandler((err, request, reply) => {
  if (err instanceof ZodError) {
    return reply.code(400).send({ error: "Invalid request", details: err.issues });
  }
  if (err instanceof InsufficientCreditsError) {
    return reply.code(402).send({ error: err.message });
  }
  
  request.log.error(err);
  reply.code(500).send({ error: "Internal server error" });
});

app.listen({ port: env.PORT, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
