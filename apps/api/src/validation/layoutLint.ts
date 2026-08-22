export interface LintResult {
  ok: boolean;
  reason?: string;
}

const STRETCH_CALL = /\.(stretch|stretch_to_fit_width|stretch_to_fit_height)\s*\(/;
const SECTOR_BAD_KWARG = /Sector\s*\([^)]*\b(inner_radius|outer_radius)\s*=/;

/**
 * Catches layout/API mistakes the codegen system prompt already declares as
 * hard violations (see generateSceneCode.ts) but that the model doesn't
 * always follow — regex/line-based like astGuard.ts, but a distinct concern
 * (visual correctness, not security), so it stays out of that file. Wired
 * into the same retry-with-feedback loop as validateSceneCode in
 * videoGeneration.ts.
 */
export function lintSceneLayout(code: string): LintResult {
  if (STRETCH_CALL.test(code)) {
    return {
      ok: false,
      reason:
        "Uses .stretch()/.stretch_to_fit_width()/.stretch_to_fit_height(), which distorts aspect ratio. " +
        "Use .scale(factor) or .scale_to_fit_width(...)/.scale_to_fit_height(...) instead.",
    };
  }

  if (SECTOR_BAD_KWARG.test(code)) {
    return {
      ok: false,
      reason:
        "Sector(...) was called with inner_radius/outer_radius, which only AnnularSector accepts. " +
        "Sector only takes radius, start_angle, and angle.",
    };
  }

  return { ok: true };
}
