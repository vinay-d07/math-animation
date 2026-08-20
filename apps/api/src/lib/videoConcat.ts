import { randomUUID } from "node:crypto";
import { Sandbox } from "e2b";
import { env } from "../env.js";

const CONCAT_TIMEOUT_MS = 120_000;
const CONCAT_SANDBOX_TIMEOUT_MS = 180_000;

export interface ConcatResult {
  success: boolean;
  durationMs: number;
  videoBuffer?: Buffer;
  error?: string;
}

/**
 * Concatenates already-rendered (and already narration-muxed) scene clips
 * into one final video, in order. Runs in a dedicated E2B sandbox purely
 * because ffmpeg already lives there — the inputs are our own trusted
 * render output, not untrusted code, so this isn't a security boundary the
 * way scene rendering is, but reusing the same isolated environment avoids
 * adding ffmpeg as a host dependency for one batch step.
 */
export async function concatenateClips(clips: Buffer[]): Promise<ConcatResult> {
  const start = Date.now();
  const jobId = randomUUID();
  const jobDir = `/home/user/${jobId}`;
  const listPath = `${jobDir}/list.txt`;
  const outputPath = `${jobDir}/final.mp4`;

  const sbx = await Sandbox.create(env.E2B_TEMPLATE_ID, {
    apiKey: env.E2B_API_KEY,
    timeoutMs: CONCAT_SANDBOX_TIMEOUT_MS,
    allowInternetAccess: false,
  });

  try {
    const clipPaths = await Promise.all(
      clips.map(async (clip, i) => {
        const path = `${jobDir}/clip_${i}.mp4`;
        await sbx.files.write(path, clip.buffer.slice(clip.byteOffset, clip.byteOffset + clip.byteLength) as ArrayBuffer);
        return path;
      })
    );

    const listContents = clipPaths.map((path) => `file '${path}'`).join("\n");
    await sbx.files.write(listPath, listContents);

    // -c copy: all clips came from the same manim + ffmpeg mux settings, so
    // stream copy (no re-encode) is safe and fast.
    await sbx.commands.run(`ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy "${outputPath}"`, {
      cwd: jobDir,
      timeoutMs: CONCAT_TIMEOUT_MS,
    });

    const bytes = await sbx.files.read(outputPath, { format: "bytes" });
    return { success: true, durationMs: Date.now() - start, videoBuffer: Buffer.from(bytes) };
  } catch (err) {
    return {
      success: false,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await sbx.kill();
  }
}
