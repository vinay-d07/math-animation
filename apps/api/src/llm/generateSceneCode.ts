import { generateText } from "ai";
import { llmProvider } from "./provider.js";
import type { VideoGenerationMode } from "./planStoryboard.js";
import { withRateLimitRetry } from "./withRateLimitRetry.js";
import { getCodegenSystemPrompt, buildCodegenPrompt, buildCritiquePrompt } from "../prompts/generateSceneCode.js";

export async function generateSceneCode(
  sceneClassName: string,
  narration: string,
  visualIntent: string,
  mode: VideoGenerationMode = "SCENES",
  previousError?: string
): Promise<string> {
  const system = getCodegenSystemPrompt(mode);
  const prompt = buildCodegenPrompt(sceneClassName, narration, visualIntent, mode, previousError);

  const { text } = await withRateLimitRetry(() =>
    generateText({
      model: llmProvider.model(),
      system,
      prompt,
    })
  );

  return stripCodeFences(await critiqueSceneCode(system, stripCodeFences(text)));
}

/**
 * A second pass where the model reviews its own just-written code against
 * the same layout/framing rules and returns a corrected version if it finds
 * an issue — catches overlap/off-frame/distortion mistakes that a single
 * generation pass makes despite the rules already being in the prompt.
 * Costs one extra Groq call per scene.
 */
async function critiqueSceneCode(system: string, code: string): Promise<string> {
  const { text } = await withRateLimitRetry(() =>
    generateText({
      model: llmProvider.model(),
      system,
      prompt: buildCritiquePrompt(code),
    })
  );

  return text;
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:python)?\n([\s\S]*?)\n```$/);
  return fenceMatch ? fenceMatch[1] : trimmed;
}
