import { randomUUID } from "node:crypto";
import { prisma } from "@manim-saas/db";
import { CREDIT_COSTS, deductCredits, getBalance } from "@manim-saas/db/credits";
import { generateSceneCode } from "./llm/generateSceneCode.js";
import { generateNarrationAudio } from "./llm/generateNarrationAudio.js";
import type { VideoGenerationMode } from "./llm/planStoryboard.js";
import { validateSceneCode } from "./validation/astGuard.js";
import { lintSceneLayout } from "./validation/layoutLint.js";
import { renderQueue } from "./queue/renderQueue.js";
import { concatenateClips } from "./lib/videoConcat.js";
import { uploadRenderOutput } from "./lib/storage.js";
import { env } from "./env.js";

const MAX_SCENE_ATTEMPTS = 2;
const SCENE_RENDER_TIMEOUT_MS = 3 * 60 * 1000;
const SCENE_RENDER_POLL_MS = 1000;

/**
 * Runs up to SCENE_GENERATION_CONCURRENCY scenes at once — scenes are
 * independent (no shared state between them), so there's no correctness
 * reason to serialize them, only a resource one, which the concurrency cap
 * already bounds (and each scene still gets its own fresh E2B sandbox, so
 * parallelizing doesn't weaken per-scene isolation).
 *
 * Once any scene definitively fails, `aborted` flips and every scene still
 * waiting for a free concurrency slot is skipped rather than started —
 * cheap to do, and it's the only point where "stop spending" is actually
 * free. Scenes already mid-flight when that happens still run to
 * completion: their credits are already committed and there's no cheap way
 * to interrupt an in-progress LLM call or sandbox render, so this is
 * "stop starting new work," not "cancel work in progress."
 */
export async function runVideoGeneration(videoProjectId: string, userId: string): Promise<void> {
  const videoProject = await prisma.videoProject.findUniqueOrThrow({ where: { id: videoProjectId } });
  const mode = videoProject.mode as VideoGenerationMode;

  const scenes = await prisma.scene.findMany({
    where: { videoProjectId },
    orderBy: { order: "asc" },
  });
  const pending = scenes.filter((s) => s.status !== "COMPLETED");

  let aborted = false;
  let firstFailure: string | null = null;
  const isAborted = () => aborted;

  await mapWithConcurrency(pending, env.SCENE_GENERATION_CONCURRENCY, async (scene) => {
    if (isAborted()) {
      await prisma.scene.update({
        where: { id: scene.id },
        data: { status: "FAILED", errorMessage: "Skipped — another scene in this video failed" },
      });
      return;
    }

    const result = await renderSceneWithRetries(
      scene.id,
      scene.sceneClassName,
      scene.narration,
      scene.visualIntent,
      userId,
      mode,
      isAborted
    );
    if (!result.ok && !aborted) {
      aborted = true;
      firstFailure = `Scene "${scene.sceneClassName}" failed: ${result.error}`;
    }
  });

  if (aborted && firstFailure) {
    await failProject(videoProjectId, firstFailure);
    return;
  }

  // SCENES mode produces quick, independent silent clips — there's no
  // single "final video" to stitch, so it's done as soon as every scene is.
  if (mode === "SCENES") {
    await prisma.videoProject.update({ where: { id: videoProjectId }, data: { status: "DONE" } });
    return;
  }

  await stitchFinalVideo(videoProjectId);
}

/** Runs `fn` over `items` with at most `limit` in flight at once. */
async function mapWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let nextIndex = 0;
  async function worker() {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/**
 * A "failure" can be a static validation rejection or a real render error
 * (code that passes the AST guard but hits a Manim API mistake only visible
 * at render time — LLMs get this wrong often enough that it's worth a real
 * retry, not just a validation-only one). Either way, the error is fed back
 * into the next codegen attempt so the model has a shot at fixing itself.
 */
async function renderSceneWithRetries(
  sceneId: string,
  sceneClassName: string,
  narration: string,
  visualIntent: string,
  userId: string,
  mode: VideoGenerationMode,
  isAborted: () => boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= MAX_SCENE_ATTEMPTS; attempt++) {
    if (isAborted()) {
      await prisma.scene.update({
        where: { id: sceneId },
        data: { status: "FAILED", errorMessage: "Cancelled — another scene in this video failed" },
      });
      return { ok: false, error: "cancelled" };
    }

    await prisma.scene.update({ where: { id: sceneId }, data: { status: "ACTIVE", errorMessage: null } });

    try {
      const code = await generateSceneCode(sceneClassName, narration, visualIntent, mode, lastError);

      const validation = await validateSceneCode(code);
      if (!validation.ok) {
        lastError = `Code was rejected by the safety validator: ${validation.reason}`;
        continue;
      }

      const lint = lintSceneLayout(code);
      if (!lint.ok) {
        lastError = `Code was rejected by the layout check: ${lint.reason}`;
        continue;
      }

      await prisma.scene.update({ where: { id: sceneId }, data: { code } });

      const balance = await getBalance(userId);
      if (balance < CREDIT_COSTS.SCENE_RENDER) {
        return { ok: false, error: `Insufficient credits: have ${balance}, need ${CREDIT_COSTS.SCENE_RENDER}` };
      }

      // SCENES mode is the quick, silent preview — no TTS call, no audio
      // muxing. Narration audio is generated here (this process has
      // network access) and carried through the job as base64; the render
      // sandbox itself stays network-less regardless — see sandboxRenderer.ts.
      let narrationAudioBase64: string | undefined;
      if (mode === "SHORT") {
        try {
          const audio = await generateNarrationAudio(narration);
          narrationAudioBase64 = audio.toString("base64");
        } catch (err) {
          // Narration is an enhancement, not the core deliverable — a TTS
          // outage shouldn't fail the whole scene when a silent clip is
          // still a usable fallback.
          console.warn(`[videoGeneration] narration audio failed for scene ${sceneId}, falling back to silent clip:`, err);
        }
      }

      const jobId = randomUUID();
      await renderQueue.add(
        "render",
        { sceneCode: code, sceneClassName, quality: "low", sceneId, narrationAudioBase64 },
        { jobId }
      );
      await prisma.scene.update({ where: { id: sceneId }, data: { jobId } });
      await deductCredits(userId, CREDIT_COSTS.SCENE_RENDER, "SCENE_RENDER", jobId);

      await waitForSceneRender(sceneId);

      const settled = await prisma.scene.findUnique({ where: { id: sceneId } });
      if (settled?.status === "COMPLETED") return { ok: true };
      lastError = settled?.errorMessage ?? "Render failed for an unknown reason";
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Scene generation failed";
    }
  }

  await prisma.scene.update({
    where: { id: sceneId },
    data: { status: "FAILED", errorMessage: lastError ?? "Scene failed after retries" },
  });
  return { ok: false, error: lastError ?? "unknown reason" };
}

async function waitForSceneRender(sceneId: string): Promise<void> {
  const deadline = Date.now() + SCENE_RENDER_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const scene = await prisma.scene.findUnique({ where: { id: sceneId } });
    if (!scene || scene.status === "COMPLETED" || scene.status === "FAILED") return;
    await new Promise((resolve) => setTimeout(resolve, SCENE_RENDER_POLL_MS));
  }
  await prisma.scene.update({
    where: { id: sceneId },
    data: { status: "FAILED", errorMessage: "Render timed out" },
  });
}

/**
 * All scenes rendered (each already muxed with its own narration audio) —
 * pull them back down and concatenate into one downloadable video. A
 * failure here doesn't undo the individually-complete scenes, so the
 * project still finishes as DONE; the error just explains why there's no
 * single stitched file to download.
 */
async function stitchFinalVideo(videoProjectId: string): Promise<void> {
  const scenes = await prisma.scene.findMany({
    where: { videoProjectId },
    orderBy: { order: "asc" },
  });

  const start = Date.now();
  try {
    const clips = await Promise.all(
      scenes.map(async (scene) => {
        if (!scene.outputUrl) throw new Error(`Scene "${scene.sceneClassName}" has no output to stitch`);
        const response = await fetch(scene.outputUrl);
        if (!response.ok) throw new Error(`Failed to fetch rendered clip for "${scene.sceneClassName}"`);
        return Buffer.from(await response.arrayBuffer());
      })
    );

    const result = await concatenateClips(clips);
    if (!result.success || !result.videoBuffer) {
      throw new Error(result.error ?? "Concatenation failed for an unknown reason");
    }

    const outputUrl = await uploadRenderOutput(`video-project-${videoProjectId}.mp4`, result.videoBuffer);

    await prisma.videoProject.update({
      where: { id: videoProjectId },
      data: { status: "DONE", outputUrl, durationMs: Date.now() - start, errorMessage: null },
    });
  } catch (err) {
    console.error(`[videoGeneration] final stitch failed for ${videoProjectId}:`, err);
    await prisma.videoProject.update({
      where: { id: videoProjectId },
      data: {
        status: "DONE",
        errorMessage: `All scenes rendered, but stitching the final narrated video failed: ${
          err instanceof Error ? err.message : String(err)
        }. Individual scene clips are still available below.`,
      },
    });
  }
}

async function failProject(videoProjectId: string, message: string): Promise<void> {
  await prisma.videoProject.update({
    where: { id: videoProjectId },
    data: { status: "FAILED", errorMessage: message },
  });
}
