import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { CREDIT_COSTS, InsufficientCreditsError, deductCredits, getBalance } from "@manim-saas/db/credits";
import { requireAuth } from "../auth/preHandler.js";
import { loadOwnedProject } from "./projects.js";
import { streamSceneEdit } from "../llm/editScene.js";
import { validateSceneCode } from "../validation/astGuard.js";
import { openSSE } from "../lib/sse.js";

const aiEditSchema = z.object({
  code: z.string().min(1),
  instruction: z.string().min(1),
  selection: z.string().optional(),
});

export function registerAiEditRoutes(app: FastifyInstance) {
  app.post<{ Params: { id: string } }>(
    "/api/projects/:id/ai-edit",
    { preHandler: requireAuth },
    async (request, reply) => {
      const project = await loadOwnedProject(request.params.id, request.userId);
      if (!project) return reply.code(404).send({ error: "Project not found" });

      const body = aiEditSchema.parse(request.body);

      const balance = await getBalance(request.userId);
      if (balance < CREDIT_COSTS.AI_EDIT) {
        return reply
          .code(402)
          .send({ error: `Insufficient credits: have ${balance}, need ${CREDIT_COSTS.AI_EDIT}` });
      }

      const sse = openSSE(reply);
      let fullText = "";

      try {
        const result = streamSceneEdit(body.code, body.instruction, body.selection);
        for await (const delta of result.textStream) {
          fullText += delta;
          sse.send("chunk", { delta });
        }
      } catch (err) {
        sse.send("error", { message: err instanceof Error ? err.message : "LLM call failed" });
        sse.close();
        return;
      }

      const validation = await validateSceneCode(fullText);
      if (!validation.ok) {
        sse.send("invalid", { reason: validation.reason });
        sse.close();
        return;
      }

      try {
        await deductCredits(request.userId, CREDIT_COSTS.AI_EDIT, "AI_EDIT");
      } catch (err) {
        if (err instanceof InsufficientCreditsError) {
          sse.send("error", { message: err.message });
          sse.close();
          return;
        }
        throw err;
      }

      sse.send("done", { code: fullText });
      sse.close();
    }
  );
}
