import "dotenv/config";
import { Worker, type Job } from "bullmq";
import { prisma } from "@manim-saas/db";
import { connection } from "./queue/connection.js";
import { RENDER_QUEUE_NAME } from "./queue/renderQueue.js";
import { uploadRenderOutput } from "./lib/storage.js";
import { renderSceneInSandbox } from "./lib/sandboxRenderer.js";
import { recordRenderMetric } from "./lib/metrics.js";
import { env } from "./env.js";
import type { RenderJobData, RenderJobResult } from "./types.js";

async function processRenderJob(job: Job<RenderJobData>): Promise<RenderJobResult> {
  const { sceneCode, sceneClassName, quality, renderId, sceneId, narrationAudioBase64 } = job.data;
  const start = Date.now();

  if (renderId) await updateRenderStatus(renderId, { status: "ACTIVE" });
  if (sceneId) await updateSceneStatus(sceneId, { status: "ACTIVE" });

  const narrationAudio = narrationAudioBase64 ? Buffer.from(narrationAudioBase64, "base64") : undefined;
  const result = await renderSceneInSandbox(sceneCode, sceneClassName, quality, narrationAudio);
  await recordRenderMetric({ success: result.success, durationMs: result.durationMs, quality });

  if (!result.success || !result.videoBuffer) {
    throw new Error(result.error ?? "Render failed for an unknown reason");
  }

  const outputUrl = await uploadRenderOutput(`${job.id}.mp4`, result.videoBuffer);

  return {
    outputUrl,
    renderDurationMs: result.durationMs,
    totalDurationMs: Date.now() - start,
  };
}

const worker = new Worker<RenderJobData, RenderJobResult>(RENDER_QUEUE_NAME, processRenderJob, {
  connection,
  concurrency: env.RENDER_CONCURRENCY,
});

worker.on("completed", async (job, result) => {
  console.log(`[render] job ${job.id} done in ${result.totalDurationMs}ms (render: ${result.renderDurationMs}ms) -> ${result.outputUrl}`);
  if (job.data.renderId) {
    await updateRenderStatus(job.data.renderId, {
      status: "COMPLETED",
      outputPath: result.outputUrl,
      durationMs: result.totalDurationMs,
    });
  }
  if (job.data.sceneId) {
    await updateSceneStatus(job.data.sceneId, {
      status: "COMPLETED",
      outputUrl: result.outputUrl,
      durationMs: result.totalDurationMs,
    });
  }
});

worker.on("failed", async (job, err) => {
  console.error(`[render] job ${job?.id} failed: ${err.message}`);
  if (job?.data.renderId) {
    await updateRenderStatus(job.data.renderId, { status: "FAILED", errorMessage: err.message });
  }
  if (job?.data.sceneId) {
    await updateSceneStatus(job.data.sceneId, { status: "FAILED", errorMessage: err.message });
  }
});

async function updateRenderStatus(
  renderId: string,
  data: { status: "ACTIVE" | "COMPLETED" | "FAILED"; outputPath?: string; durationMs?: number; errorMessage?: string }
) {
  try {
    await prisma.render.update({ where: { id: renderId }, data });
  } catch (err) {
    // Standalone test jobs (enqueueTestJob.ts) use a placeholder renderId with
    // no matching Mongo doc — that's expected and not worth failing the job over.
    console.warn(`[render] could not update Render ${renderId}:`, err instanceof Error ? err.message : err);
  }
}

async function updateSceneStatus(
  sceneId: string,
  data: { status: "ACTIVE" | "COMPLETED" | "FAILED"; outputUrl?: string; durationMs?: number; errorMessage?: string }
) {
  try {
    await prisma.scene.update({ where: { id: sceneId }, data });
  } catch (err) {
    console.warn(`[render] could not update Scene ${sceneId}:`, err instanceof Error ? err.message : err);
  }
}

console.log(`Render dispatcher listening on queue "${RENDER_QUEUE_NAME}", concurrency=${env.RENDER_CONCURRENCY}, E2B template="${env.E2B_TEMPLATE_ID}".`);
