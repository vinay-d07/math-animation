import { createGroq } from "@ai-sdk/groq";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { env } from "../env.js";

/** Swappable LLM abstraction — Groq today, could be Claude/OpenAI/etc tomorrow. */
export interface LLMProvider {
  model(): LanguageModel;
}

/** Scene codegen (concurrent, frequent, small calls) and AI-edit streaming
 * (latency-sensitive) — stays on Groq, which favors request rate over
 * per-request size on its free tier. */
export const llmProvider: LLMProvider = {
  model: () => createGroq({ apiKey: env.GROQ_API_KEY })(env.GROQ_MODEL),
};

/** Storyboard planning (infrequent, large single calls, tolerates latency)
 * — Cerebras when configured, since its free tier favors exactly that
 * shape (see env.ts). Falls back to Groq so the app works with zero extra
 * setup; this just stops being "a second bucket" once it does. */
export const planningLlmProvider: LLMProvider = {
  model: () =>
    env.CEREBRAS_API_KEY
      ? createOpenAICompatible({
          name: "cerebras",
          apiKey: env.CEREBRAS_API_KEY,
          baseURL: "https://api.cerebras.ai/v1",
        })(env.CEREBRAS_MODEL)
      : llmProvider.model(),
};
