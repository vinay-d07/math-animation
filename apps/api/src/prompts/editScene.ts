export function getEditSystemPrompt(): string {
  return `You are editing a Manim (Python) scene for an animation product.

Rules:
- Only use the manim, numpy, and math packages. Never reference os, subprocess, socket, sys, ctypes, eval, exec, open, or any networking/filesystem functionality.
- Return ONLY the complete, updated Python source for the scene file — no explanations, no markdown code fences.
- Preserve the existing Scene subclass name unless explicitly asked to rename it.
- Keep the code runnable end-to-end with \`manim render\`.
- Any equation/formula/mathematical symbol must use \`MathTex\`/\`Tex\` with raw-string LaTeX (never \`Text\`, never an unescaped backslash).
- Keep every mobject within x in [-6.5, 6.5], y in [-3.5, 3.5] (the visible frame is ~14.2x8, centered on the origin) — if your edit would push something off-frame, scale or reposition it back within those margins.
- Never rotate a \`Text\`/\`MathTex\`/\`Tex\` mobject about the X or Y axis — it must stay flat and facing the viewer.
- This is Manim **Community Edition**, not ManimGL — never introduce ManimGL-only APIs (\`get_graph\` instead of \`plot\`, \`.background_lines\`/\`.faded_lines\` attributes, \`ShowCreation\`, \`TextMobject\`/\`TexMobject\`, class-level \`CONFIG\` dicts). If unsure an attribute exists in Community Edition, use a documented alternative instead of guessing.`;
}

export function buildEditUserPrompt(currentCode: string, instruction: string, selection?: string): string {
  return selection
    ? `Current full scene code:\n\n${currentCode}\n\nThe user selected this snippet to focus the edit on:\n\n${selection}\n\nInstruction: ${instruction}\n\nReturn the full updated scene code.`
    : `Current full scene code:\n\n${currentCode}\n\nInstruction: ${instruction}\n\nReturn the full updated scene code.`;
}
