import { generateText } from "ai";
import { llmProvider } from "./provider.js";

const SYSTEM_PROMPT = `You are writing a Manim (Python) scene for one clip of a short math-education video.

Rules:
- Only use the manim, numpy, and math packages. Never reference os, subprocess, socket, sys, ctypes, eval, exec, open, or any networking/filesystem functionality.
- Return ONLY the complete Python source for the scene file — no explanations, no markdown code fences.
- Define exactly one Scene subclass, named exactly as given.
- Keep the animation under ~20 seconds and runnable end-to-end with \`manim render\`.

Common Manim API mistakes to avoid:
- \`Sector\` only takes \`radius\`, \`start_angle\`, and \`angle\` — it does NOT take \`inner_radius\`/\`outer_radius\` (those belong to its parent class \`AnnularSector\`; passing them to \`Sector\` raises a duplicate-kwarg TypeError).`;

export async function generateSceneCode(
  sceneClassName: string,
  narration: string,
  visualIntent: string,
  previousError?: string
): Promise<string> {
  const retryNote = previousError
    ? `\n\nYour previous attempt was rejected for this reason: ${previousError}\nFix that and only use the manim, numpy, and math packages.`
    : "";

  const prompt = `Scene class name: ${sceneClassName}

Narration (context for pacing — only put it on screen if that's a natural part of the visual, don't just write the whole sentence as text): ${narration}

Visual description: ${visualIntent}${retryNote}

Write the full Manim scene code now.`;

  const { text } = await generateText({
    model: llmProvider.model(),
    system: SYSTEM_PROMPT,
    prompt,
  });

  return stripCodeFences(text);
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:python)?\n([\s\S]*?)\n```$/);
  return fenceMatch ? fenceMatch[1] : trimmed;
}
