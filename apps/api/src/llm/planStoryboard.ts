import { generateObject } from "ai";
import { z } from "zod";
import { llmProvider } from "./provider.js";

export const MAX_SCENES = 4;

const storyboardSchema = z.object({
  title: z.string().min(1).max(120),
  scenes: z
    .array(
      z.object({
        narration: z.string().min(1).max(600),
        visualIntent: z.string().min(1).max(600),
        sceneClassName: z
          .string()
          .regex(/^[A-Z][A-Za-z0-9]*$/, "must be a PascalCase Python class name"),
      })
    )
    .min(1)
    .max(MAX_SCENES),
});

export type Storyboard = z.infer<typeof storyboardSchema>;
export type StoryboardScene = Storyboard["scenes"][number];

const SYSTEM_PROMPT = `You are a storyboard planner for short math-education videos rendered with Manim.

Given a topic, break it into at most ${MAX_SCENES} short scenes that build on each other, going
from the simplest idea to the full picture. For each scene write:
- narration: 1-3 sentences of voiceover script explaining that step, in plain spoken language
- visualIntent: a concrete, specific description of what should be drawn/animated (shapes,
  equations, motion, colors) — specific enough for someone else to write Manim code from it alone
- sceneClassName: a unique PascalCase Python class name for that scene (e.g. "IntroEquation")

Keep scope tight — each scene should be renderable as under ~20 seconds of animation with a
handful of Manim objects, not a sprawling multi-part sequence.`;

export async function planStoryboard(prompt: string): Promise<Storyboard> {
  const result = await generateObject({
    model: llmProvider.model(),
    schema: storyboardSchema,
    system: SYSTEM_PROMPT,
    prompt: `Topic: ${prompt}`,
  });
  return result.object;
}
