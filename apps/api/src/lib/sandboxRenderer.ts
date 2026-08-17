import { randomUUID } from "node:crypto";
import { CommandExitError, Sandbox, TimeoutError } from "e2b";
import { env } from "../env.js";

const QUALITY_CONFIG = {
  low: { flag: "-ql", commandTimeoutMs: 90_000, sandboxTimeoutMs: 150_000 },
  high: { flag: "-qh", commandTimeoutMs: 240_000, sandboxTimeoutMs: 300_000 },
} as const;

const VALIDATE_TIMEOUT_MS = 15_000;

export interface SandboxRenderResult {
  success: boolean;
  durationMs: number;
  videoBuffer?: Buffer;
  error?: string;
}

interface ValidatorVerdict {
  ok: boolean;
  reason?: string | null;
}

/**
 * Runs a single Manim scene inside an ephemeral E2B sandbox (a Firecracker
 * microVM) — never in this process. The regex pre-filter in astGuard.ts
 * already ran before this was called; the AST-based validator baked into
 * the sandbox image (sandbox-template/validator.py) runs here as the first
 * command, inside the same isolation boundary as the render itself, and is
 * the authoritative check. The sandbox has no access to this process's
 * filesystem or environment, no access to other renders, and no network
 * egress at all (allowInternetAccess: false) — code that passed both
 * checks but is still hostile has nothing left to reach.
 */
export async function renderSceneInSandbox(
  sceneCode: string,
  sceneClassName: string,
  quality: "low" | "high"
): Promise<SandboxRenderResult> {
  const config = QUALITY_CONFIG[quality];
  const jobId = randomUUID();
  const jobDir = `/home/user/${jobId}`;
  const scenePath = `${jobDir}/scene.py`;
  const mediaDir = `${jobDir}/media`;

  const start = Date.now();
  const sbx = await Sandbox.create(env.E2B_TEMPLATE_ID, {
    apiKey: env.E2B_API_KEY,
    timeoutMs: config.sandboxTimeoutMs,
    allowInternetAccess: false,
  });

  try {
    await sbx.files.write(scenePath, sceneCode);

    const validation = await sbx.commands.run(`python3 /opt/validator.py "${scenePath}"`, {
      cwd: jobDir,
      timeoutMs: VALIDATE_TIMEOUT_MS,
    });
    const verdict = JSON.parse(validation.stdout.trim() || "{}") as ValidatorVerdict;
    if (!verdict.ok) {
      return {
        success: false,
        durationMs: Date.now() - start,
        error: `Code was rejected by the sandbox validator: ${verdict.reason ?? "unknown reason"}`,
      };
    }

    // Non-background commands.run() waits and throws CommandExitError on a
    // non-zero exit, so a clean return here means manim succeeded.
    await sbx.commands.run(
      `manim render ${config.flag} scene.py ${sceneClassName} --media_dir media --disable_caching`,
      { cwd: jobDir, timeoutMs: config.commandTimeoutMs }
    );
    const durationMs = Date.now() - start;

    const videosDir = `${mediaDir}/videos`;
    let entries: Awaited<ReturnType<typeof sbx.files.list>> = [];
    try {
      entries = await sbx.files.list(videosDir, { depth: 10 });
    } catch {
      entries = [];
    }
    const match = entries.find((entry) => entry.name === `${sceneClassName}.mp4`);
    if (!match) {
      return {
        success: false,
        durationMs,
        error: "manim exited successfully but no output mp4 was found",
      };
    }

    const bytes = await sbx.files.read(match.path, { format: "bytes" });
    return { success: true, durationMs, videoBuffer: Buffer.from(bytes) };
  } catch (err) {
    const durationMs = Date.now() - start;
    if (err instanceof CommandExitError) {
      return { success: false, durationMs, error: err.stderr.slice(-4000) };
    }
    if (err instanceof TimeoutError) {
      return { success: false, durationMs, error: "Render timed out" };
    }
    return { success: false, durationMs, error: err instanceof Error ? err.message : String(err) };
  } finally {
    await sbx.kill();
  }
}
