import { streamText } from "ai";
import { llmProvider } from "./provider.js";

const SYSTEM_PROMPT = `You are editing a Manim (Python) scene for an animation product.

Rules:
- Only use the manim, numpy, and math packages. Never reference os, subprocess, socket, sys, ctypes, eval, exec, open, or any networking/filesystem functionality.
- Return ONLY the complete, updated Python source for the scene file — no explanations, no markdown code fences.
- Preserve the existing Scene subclass name unless explicitly asked to rename it.
- Keep the code runnable end-to-end with \`manim render\`.`;

export function streamSceneEdit(currentCode: string, instruction: string, selection?: string) {
  const userPrompt = selection
    ? `Current full scene code:\n\n${currentCode}\n\nThe user selected this snippet to focus the edit on:\n\n${selection}\n\nInstruction: ${instruction}\n\nReturn the full updated scene code.`
    : `Current full scene code:\n\n${currentCode}\n\nInstruction: ${instruction}\n\nReturn the full updated scene code.`;

  return streamText({
    model: llmProvider.model(),
    system: SYSTEM_PROMPT,
    prompt: userPrompt,
  });
}
