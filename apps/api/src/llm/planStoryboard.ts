import { generateObject } from "ai";
import { z } from "zod";
import { llmProvider } from "./provider.js";
import { withRateLimitRetry } from "./withRateLimitRetry.js";
import {
  MAX_SCENES_BY_MODE,
  type VideoGenerationMode,
  getPlanningSystemPrompt,
  buildStoryboardPrompt,
  buildExpansionPrompt,
} from "../prompts/planStoryboard.js";

export { MAX_SCENES_BY_MODE };
export type { VideoGenerationMode };

const storyboardSchema = z.object({
  title: z.string().min(1).max(120),
  scenes: z
    .array(
      z.object({
        narration: z.string().min(1).max(900),
        visualIntent: z.string().min(1).max(600),
        explanation: z.string().min(1).max(800),
        sceneClassName: z
          .string()
          .regex(/^[A-Z][A-Za-z0-9]*$/, "must be a PascalCase Python class name"),
      })
    )
    .min(1)
    .max(MAX_SCENES_BY_MODE.SHORT),
});

export type Storyboard = z.infer<typeof storyboardSchema>;
export type StoryboardScene = Storyboard["scenes"][number];

// SHORT mode's prompt *asks* for 300-750 total narration words, but a
// schema-constrained generateObject call routinely undershoots a soft
// aggregate target like that — nothing upstream checks it, so a short
// result silently ships as a short video. 300 words is a hard floor (~2min
// at a ~150wpm spoken pace); anything under it triggers expansion rather
// than being accepted as-is. SCENES mode has no floor — it's a silent,
// intentionally-brief preview.
const MIN_TOTAL_WORDS: Record<VideoGenerationMode, number> = { SCENES: 0, SHORT: 300 };
const EXPANSION_TARGET_WORDS: Record<VideoGenerationMode, number> = { SCENES: 0, SHORT: 450 };
// Kept low: each attempt is a full extra generateObject call competing for
// the same tight per-minute token budget the initial call already drew
// from (see withRateLimitRetry.ts) — more attempts just means more waiting,
// not a better outcome once the model has already had one shot to expand.
const MAX_EXPANSION_ATTEMPTS = 2;

function totalNarrationWords(storyboard: Storyboard): number {
  return storyboard.scenes.reduce((sum, s) => sum + s.narration.trim().split(/\s+/).filter(Boolean).length, 0);
}

export async function planStoryboard(prompt: string, mode: VideoGenerationMode = "SCENES"): Promise<Storyboard> {
  let storyboard = await generateStoryboard(prompt, mode);

  const minWords = MIN_TOTAL_WORDS[mode];
  if (minWords > 0) {
    let attempt = 0;
    while (totalNarrationWords(storyboard) < minWords && attempt < MAX_EXPANSION_ATTEMPTS) {
      attempt++;
      const currentWords = totalNarrationWords(storyboard);
      const expanded = await expandStoryboard(prompt, storyboard, currentWords, minWords, EXPANSION_TARGET_WORDS[mode]);
      // A revision pass can regress instead of improving — keep whichever
      // attempt is longer rather than trusting the latest unconditionally.
      storyboard = totalNarrationWords(expanded) >= currentWords ? expanded : storyboard;
    }

    const finalWords = totalNarrationWords(storyboard);
    if (finalWords < minWords) {
      console.warn(
        `[planStoryboard] storyboard for "${prompt}" only reached ${finalWords} narration words after ` +
          `${attempt} expansion attempt(s) (target: ${minWords}+) — the rendered video will likely run under 2 minutes.`
      );
    }
  }

  return storyboard;
}

async function generateStoryboard(prompt: string, mode: VideoGenerationMode): Promise<Storyboard> {
  const result = await withRateLimitRetry(() =>
    generateObject({
      model: llmProvider.model(),
      schema: storyboardSchema,
      system: getPlanningSystemPrompt(mode),
      prompt: buildStoryboardPrompt(prompt),
    })
  );
  return result.object;
}

/**
 * Sends the too-short storyboard back to the model with its actual word
 * count and asks for a full revision, not a delta — deepening existing
 * scenes (more worked examples, more intermediate steps) and/or adding
 * scenes, up to the mode's scene cap.
 */
async function expandStoryboard(
  prompt: string,
  storyboard: Storyboard,
  currentWords: number,
  minWords: number,
  targetWords: number
): Promise<Storyboard> {
  const result = await withRateLimitRetry(() =>
    generateObject({
      model: llmProvider.model(),
      schema: storyboardSchema,
      system: getPlanningSystemPrompt("SHORT"),
      prompt: buildExpansionPrompt(prompt, storyboard.scenes, currentWords, minWords, targetWords, MAX_SCENES_BY_MODE.SHORT),
    })
  );
  return result.object;
}
