import { generateObject } from "ai";
import { z } from "zod";
import { planningLlmProvider } from "./provider.js";
import { withRateLimitRetry } from "./withRateLimitRetry.js";

export const MAX_SCENES_BY_MODE = { SCENES: 4, SHORT: 10 } as const;
export type VideoGenerationMode = keyof typeof MAX_SCENES_BY_MODE;

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

const SHARED_INTRO = `You are a storyboard planner for math-education videos rendered with Manim.

For each scene write:
- narration: voiceover script for that step, in plain spoken language (this is read aloud by TTS)
- visualIntent: a concrete, specific description of what should be drawn/animated (shapes,
  equations, motion, colors) — specific enough for someone else to write Manim code from it alone
- explanation: 2-4 sentences, written for a viewer reading alongside the video (not a voiceover
  script) — explain *why* this step is true or how it works, the way a good textbook caption
  would. This is shown as text next to the clip, so it can go into more depth than the narration
  and may reference the specific equations/shapes on screen.
- sceneClassName: a unique PascalCase Python class name for that scene (e.g. "IntroEquation")`;

const MODE_PROMPTS: Record<VideoGenerationMode, string> = {
  SCENES: `${SHARED_INTRO}

Given a topic, break it into at most ${MAX_SCENES_BY_MODE.SCENES} short, independent scenes that
build on each other, going from the simplest idea to the full picture. Keep scope tight — each
scene should be renderable as under ~20 seconds of animation with a handful of Manim objects, not
a sprawling multi-part sequence. Narration is 1-3 sentences per scene — this mode produces quick,
silent preview clips (no voiceover audio is generated), so narration is used only as pacing
context for the visuals, not spoken.`,

  SHORT: `${SHARED_INTRO}

Given a topic, plan a full narrated explainer video between 2 and 5 minutes long, using
${MAX_SCENES_BY_MODE.SHORT} scenes at most. This is the real deliverable, not a quick preview —
be thorough: build genuine understanding step by step (motivate the question, build intuition,
work a concrete example, state the general result), the way a good educational video would, not a
compressed summary.

Each scene's narration WILL be read aloud by text-to-speech and become that scene's actual audio
track, so pace scenes by narration length, not just visual complexity — narration should be a full
paragraph (roughly 40-90 words, ~20-40 seconds spoken aloud), and the visualIntent for that scene
should describe enough sequential animation beats (not just one static drawing) to occupy roughly
that same span of time, since the animation is padded/frozen to match narration length if it
finishes first — a scene with 40+ seconds of narration and 3 seconds of animation will look static
and unfinished, so favor several small sequential actions over one action.

Budget the total narration across all scenes to land between 2 and 5 minutes of combined spoken
audio (roughly 300-750 words total) — use enough scenes to cover the topic properly rather than
rushing it into ${MAX_SCENES_BY_MODE.SCENES} scenes.`,
};

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
      model: planningLlmProvider.model(),
      schema: storyboardSchema,
      system: MODE_PROMPTS[mode],
      prompt: `Topic: ${prompt}`,
    })
  );
  return result.object;
}

/**
 * Sends the too-short storyboard back to the model with its actual word
 * count and asks for a full revision, not a delta — deepening existing
 * scenes (more worked examples, more intermediate steps) and/or adding
 * scenes, up to the mode's scene cap. Only sceneClassName + narration are
 * echoed back (not visualIntent/explanation/title) — that's all the model
 * needs to avoid repeating itself and extend coherently, and on an 8K
 * TPM free-tier budget the full storyboard JSON is expensive dead weight.
 */
async function expandStoryboard(
  prompt: string,
  storyboard: Storyboard,
  currentWords: number,
  minWords: number,
  targetWords: number
): Promise<Storyboard> {
  const priorNarration = storyboard.scenes
    .map((s, i) => `${i + 1}. [${s.sceneClassName}] ${s.narration}`)
    .join("\n");

  const result = await withRateLimitRetry(() =>
    generateObject({
      model: planningLlmProvider.model(),
      schema: storyboardSchema,
      system: MODE_PROMPTS.SHORT,
      prompt: `Topic: ${prompt}

You already produced a storyboard for this topic with the narration below, but it only totals
about ${currentWords} words — too short. Once read aloud by TTS, this needs at least ${minWords}
words of combined narration across all scenes, and ideally closer to ${targetWords}, to reach a
genuine 2-3+ minute video.

Previous narration, scene by scene:
${priorNarration}

Revise the full storyboard to hit that target: keep the same overall arc, but go deeper — more
motivation and intuition, more worked steps in the example, more of the "why" — and/or add more
scenes, up to ${MAX_SCENES_BY_MODE.SHORT} total. Return the FULL revised storyboard (all fields for
every scene), not a diff.`,
    })
  );
  return result.object;
}
