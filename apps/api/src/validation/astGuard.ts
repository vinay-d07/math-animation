export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

const ALLOWED_MODULES = new Set(["manim", "numpy", "math"]);

const DISALLOWED_NAMES = new Set([
  "eval",
  "exec",
  "__import__",
  "compile",
  "open",
  "globals",
  "locals",
  "vars",
  "exit",
  "quit",
  "input",
]);

const IMPORT_LINE = /^\s*(?:import|from)\s+([A-Za-z_]\w*)/;
const NAME_TOKEN = /\b([A-Za-z_]\w*)\b/g;
const DUNDER_ATTR = /\.(__[A-Za-z0-9_]+__)\b/;

/**
 * Fast, non-authoritative reject: regex/line-based, no real parser, run
 * in-process before a job is ever enqueued. Its only job is to turn away
 * obviously hostile code for free, before it costs an E2B sandbox.
 *
 * The authoritative check is the same logic re-implemented against a real
 * Python AST (sandbox-template/validator.py), baked into the sandbox image
 * and run as the first command of every render — see
 * apps/api/src/lib/sandboxRenderer.ts. A scene that slips past this filter
 * (e.g. via a syntax trick a regex can't see) is still caught there before
 * manim ever runs it.
 */
export async function validateSceneCode(code: string): Promise<ValidationResult> {
  for (const rawLine of code.split("\n")) {
    const line = rawLine.split("#")[0];
    const importMatch = line.match(IMPORT_LINE);
    if (importMatch && !ALLOWED_MODULES.has(importMatch[1])) {
      return { ok: false, reason: `Disallowed import: ${importMatch[1]}` };
    }
  }

  const dunderMatch = code.match(DUNDER_ATTR);
  if (dunderMatch) {
    return { ok: false, reason: `Disallowed attribute access: ${dunderMatch[1]}` };
  }

  for (const match of code.matchAll(NAME_TOKEN)) {
    if (DISALLOWED_NAMES.has(match[1])) {
      return { ok: false, reason: `Disallowed name: ${match[1]}` };
    }
  }

  return { ok: true };
}
