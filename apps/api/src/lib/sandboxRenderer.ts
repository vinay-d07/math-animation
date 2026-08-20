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
  quality: "low" | "high",
  narrationAudio?: Buffer
): Promise<SandboxRenderResult> {
  const config = QUALITY_CONFIG[quality];
  const jobId = randomUUID();
  const jobDir = `/home/user/${jobId}`;
  const scenePath = `${jobDir}/scene.py`;
  const mediaDir = `${jobDir}/media`;
  const narrationPath = `${jobDir}/narration.wav`;
  const muxedPath = `${jobDir}/muxed.mp4`;

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

    if (!narrationAudio) {
      const bytes = await sbx.files.read(match.path, { format: "bytes" });
      return { success: true, durationMs, videoBuffer: Buffer.from(bytes) };
    }

    // Mux narration onto the rendered clip, in the same (already-network-
    // less) sandbox, using the ffmpeg already baked into the image. If the
    // narration runs longer than the animation, the video is padded by
    // freezing its last frame — the narration is what has to finish, not
    // an arbitrary animation length. Audio bytes are pushed in via the E2B
    // file-write API from this (trusted, network-having) process; the
    // sandbox itself never reaches out anywhere to fetch them.
    await sbx.files.write(
      narrationPath,
      narrationAudio.buffer.slice(narrationAudio.byteOffset, narrationAudio.byteOffset + narrationAudio.byteLength) as ArrayBuffer
    );
    await sbx.commands.run(
      [
        `VIDEO_DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "${match.path}")`,
        `AUDIO_DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "${narrationPath}")`,
        `PAD=$(python3 -c "print(max(0.0, float('$AUDIO_DUR') - float('$VIDEO_DUR')))")`,
        `ffmpeg -y -i "${match.path}" -i "${narrationPath}" -filter_complex "[0:v]tpad=stop_mode=clone:stop_duration=$PAD[v]" -map "[v]" -map 1:a -c:v libx264 -preset veryfast -c:a aac "${muxedPath}"`,
      ].join(" && "),
      { cwd: jobDir, timeoutMs: 60_000 }
    );

    const muxedBytes = await sbx.files.read(muxedPath, { format: "bytes" });
    return { success: true, durationMs, videoBuffer: Buffer.from(muxedBytes) };
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
