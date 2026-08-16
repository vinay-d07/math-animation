import { createGroq } from "@ai-sdk/groq";
import type { LanguageModel } from "ai";
import { env } from "../env.js";

/** Swappable LLM abstraction — Groq today, could be Claude/OpenAI/etc tomorrow. */
export interface LLMProvider {
  model(): LanguageModel;
}

export const llmProvider: LLMProvider = {
  model: () => createGroq({ apiKey: env.GROQ_API_KEY })(env.GROQ_MODEL),
};
