import { streamText } from "ai";
import { llmProvider } from "./provider.js";
import { getEditSystemPrompt, buildEditUserPrompt } from "../prompts/editScene.js";

export function streamSceneEdit(currentCode: string, instruction: string, selection?: string) {
  return streamText({
    model: llmProvider.model(),
    system: getEditSystemPrompt(),
    prompt: buildEditUserPrompt(currentCode, instruction, selection),
  });
}
