import type { VideoGenerationMode } from "../llm/planStoryboard.js";

const DURATION_GUIDANCE: Record<VideoGenerationMode, string> = {
  SCENES: "Keep the animation under ~20 seconds and runnable end-to-end with `manim render`.",
  SHORT:
    "This scene's narration will become its actual audio track (roughly 20-40 seconds spoken), " +
    "and the video is padded by freezing the last frame if the animation finishes before the " +
    "narration does — so aim for ~25-40 seconds of animation with several sequential visual " +
    "beats (not one action followed by a long idle `self.wait()`), so the scene stays visually " +
    "active for roughly as long as it's being narrated.",
};

export function getCodegenSystemPrompt(mode: VideoGenerationMode): string {
  return `You are writing a Manim (Python) scene for one clip of a math-education video.

Rules:
- Only use the manim, numpy, and math packages. Never reference os, subprocess, socket, sys, ctypes, eval, exec, open, or any networking/filesystem functionality.
- Return ONLY the complete Python source for the scene file — no explanations, no markdown code fences.
- Define exactly one Scene subclass, named exactly as given.
- Use a plain \`Scene\` (2D), not \`ThreeDScene\` or \`MovingCameraScene\`, unless the visual description explicitly requires 3D or camera movement — 2D keeps every mobject facing the viewer by construction, which a 3D camera does not guarantee.
- ${DURATION_GUIDANCE[mode]}
- make sure the code renders a clean video without any inconsistencies

Avoiding visual distortion — the most common ways generated scenes come out visibly broken:
- Never call \`.stretch()\`, \`.stretch_to_fit_width()\`, \`.stretch_to_fit_height()\`, or set \`.width\`/\`.height\` independently of each other on a mobject that should keep its proportions (circles, squares, icons, images, text). Any of these warps the shape non-uniformly — a circle becomes an oval, a square becomes a rectangle. To resize while preserving proportions, use uniform \`.scale(factor)\` or \`.scale_to_fit_width(...)\`/\`.scale_to_fit_height(...)\` (these two DO preserve aspect ratio, unlike \`stretch_to_fit_*\`).
- Never let two mobjects' bounding boxes overlap unless the overlap is the deliberate point (e.g. a highlight box). Before adding a new object near an existing one, position it with \`.next_to(existing, DIRECTION, buff=0.3)\` or arrange the group with \`VGroup(...).arrange(direction, buff=0.3)\` rather than guessing coordinates — guessed coordinates are the main cause of overlapping/collided text and shapes.
- Double check z-ordering when objects visually cross: use \`.set_z_index(n)\` or reorder \`self.add\`/animation calls so foreground objects are added after background ones, otherwise a mobject can appear to render "behind" something it should be in front of.

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
- \`Sector\` only takes \`radius\`, \`start_angle\`, and \`angle\` — it does NOT take \`inner_radius\`/\`outer_radius\` (those belong to its parent class \`AnnularSector\`; passing them to \`Sector\` raises a duplicate-kwarg TypeError).
- This is Manim **Community Edition** (the \`manim\` package, v0.18-0.19) — NOT ManimGL (3b1b's separate, incompatible library, also imported as \`manim\` in a lot of older tutorials/code you may have seen). Do not use ManimGL-only APIs:
  - No \`.get_graph(...)\` on \`Axes\` — it was removed; use \`axes.plot(function, x_range=[...], color=...)\` instead.
  - No \`.background_lines\` or \`.faded_lines\` attributes on \`Axes\`/\`NumberPlane\` — those don't exist in Community Edition. To color a \`NumberPlane\`'s grid, pass \`background_line_style={"stroke_color": ..., "stroke_width": ...}\` to its constructor instead of touching an attribute after creation. Plain \`Axes\` has no background grid at all.
  - No \`ShowCreation\` (use \`Create\`), no \`TextMobject\`/\`TexMobject\` (use \`Text\`/\`Tex\`), no class-level \`CONFIG = {...}\` dicts (pass kwargs directly to \`__init__\`/the constructor instead).
  - If you're not sure whether an attribute or method exists on a Community Edition mobject, prefer a documented, commonly-used alternative over guessing a plausible-sounding name.`;
}

const WORDS_PER_MINUTE = 150;

/**
 * Splits narration into sentences and gives each an approximate spoken
 * duration (word count at a typical TTS pace), so the model can structure
 * the scene as one visual beat per sentence instead of freehand-guessing
 * how to time self.play()/self.wait() against one opaque narration blob.
 * SHORT mode only — SCENES mode narration is never actually spoken.
 */
function buildSentenceBeats(narration: string): string {
  const sentences = narration
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  return sentences
    .map((sentence, i) => {
      const words = sentence.split(/\s+/).filter(Boolean).length;
      const seconds = Math.max(1, Math.round((words / WORDS_PER_MINUTE) * 60 * 10) / 10);
      return `${i + 1}. (~${seconds}s) "${sentence}"`;
    })
    .join("\n");
}

export function buildCodegenPrompt(
  sceneClassName: string,
  narration: string,
  visualIntent: string,
  mode: VideoGenerationMode,
  previousError?: string
): string {
  const retryNote = previousError
    ? `\n\nYour previous attempt was rejected for this reason: ${previousError}\nFix that and only use the manim, numpy, and math packages.`
    : "";

  const pacingNote =
    mode === "SHORT"
      ? `\n\nThis narration will be read aloud by TTS as one continuous track. Structure the scene as one visual
beat (a self.play(...) call, optionally followed by self.wait(...)) per sentence below, in the same order,
with a short comment above each beat naming which sentence it's for. Size each beat's duration (via
self.play(..., run_time=...) and any self.wait(...)) to roughly match that sentence's estimated spoken
duration (±30%) rather than relying on defaults, so the visuals track what's being said at that moment:
${buildSentenceBeats(narration)}`
      : "";

  return `Scene class name: ${sceneClassName}

Narration (context for pacing — only put it on screen if that's a natural part of the visual, don't just write the whole sentence as text): ${narration}

Visual description: ${visualIntent}${pacingNote}${retryNote}

Write the full Manim scene code now.`;
}

export function buildCritiquePrompt(code: string): string {
  return `Here is Manim scene code you just wrote:

\`\`\`python
${code}
\`\`\`

Re-check it specifically against the rules above — overlapping bounding boxes, off-frame content, aspect-ratio
distortion (.stretch()/mismatched width+height), incorrect Manim Community Edition API usage, and (if this
scene has numbered narration beats) whether each beat's timing roughly matches its sentence. If you find an
issue, return the corrected complete Python source. If it's already correct, return it unchanged. Return ONLY
the complete Python source — no explanations, no markdown code fences.`;
}
