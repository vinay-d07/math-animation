import { generateText } from "ai";
import { llmProvider } from "./provider.js";

const SYSTEM_PROMPT = `You are writing a Manim (Python) scene for one clip of a short math-education video.

Rules:
- Only use the manim, numpy, and math packages. Never reference os, subprocess, socket, sys, ctypes, eval, exec, open, or any networking/filesystem functionality.
- Return ONLY the complete Python source for the scene file — no explanations, no markdown code fences.
- Define exactly one Scene subclass, named exactly as given.
- Use a plain \`Scene\` (2D), not \`ThreeDScene\` or \`MovingCameraScene\`, unless the visual description explicitly requires 3D or camera movement — 2D keeps every mobject facing the viewer by construction, which a 3D camera does not guarantee.
- Keep the animation under ~20 seconds and runnable end-to-end with \`manim render\`.
- make sure the code renders a clean video without any inconsistencies

Math and symbols — this is a math-education video, get this right:
- Any equation, formula, function, or mathematical symbol (=, ×, ÷, ≤, ≥, ≠, √, ∑, ∫, π, ∞, fractions, exponents, subscripts) MUST be rendered with \`MathTex\` or \`Tex\`, never with \`Text\`. \`Text\` renders those characters as plain glyphs (or not at all) — it is only for prose labels/titles.
- Write LaTeX correctly: \`\\frac{a}{b}\`, \`\\sqrt{x}\`, \`x^{2}\`, \`x_{i}\`, \`\\sum_{i=1}^{n}\`, \`\\int_{a}^{b}\`, \`\\cdot\`, \`\\times\`, \`\\leq\`, \`\\geq\`, \`\\neq\`, \`\\pi\`, \`\\infty\`. Always wrap grouped sub/superscripts in \`{}\` (\`x^{10}\` not \`x^10\`).
- Use Python raw strings for every \`MathTex\`/\`Tex\` argument (\`MathTex(r"\\frac{a}{b}")\`) so backslashes reach LaTeX unescaped. Never use a plain (non-raw) string containing a backslash.
- To color part of an equation, pass multiple comma-separated string parts to \`MathTex\` (each becomes a separately-indexable submobject) and color by index, e.g. \`MathTex("x^2", "+", "1")[0].set_color(BLUE)\` — do not try to regex/slice a single MathTex string.
- Double-check every LaTeX snippet is syntactically complete (matched braces, matched \\left/\\right) before finishing — a broken MathTex string fails the whole render.

Framing — every scene will be judged on whether it stays fully on screen, so budget space deliberately:
- The visible frame is ~14.2 units wide and 8 units tall, centered on the origin (x from -7.1 to 7.1, y from -4 to 4). Keep every mobject's bounding box within roughly x in [-6.5, 6.5] and y in [-3.5, 3.5] at all times — that margin is required, not optional.
- Before animating a group of objects, arrange them (\`VGroup(...).arrange(...)\`) and center it (\`.move_to(ORIGIN)\`), then if it's wide, scale it down to fit: \`if group.width > 12: group.scale_to_fit_width(12)\`. Do the same for height with a 7 cap.
- When adding a title/label near an edge, use \`.to_edge(UP, buff=0.5)\` / \`.to_edge(DOWN, buff=0.5)\` etc. rather than hardcoded coordinates, so it can't drift off-frame.
- Never let text grow unbounded: long labels should use \`.scale_to_fit_width(...)\` or be split across lines rather than overflowing the frame width.
- After any \`Transform\`/\`ReplacementTransform\`/\`.animate.shift(...)\`, sanity-check the destination position is still within the margins above before writing the next step.
- All text and equations must be added as normal (non-rotated, non-tilted) mobjects with default orientation, so they read left-to-right facing the viewer exactly like a slide — never rotate a \`Text\`/\`MathTex\`/\`Tex\` mobject about the X or Y axis.

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
