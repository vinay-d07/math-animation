import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { Worker, type Job } from "bullmq";
import { prisma } from "@manim-saas/db";
import { connection } from "./queue/connection.js";
import { RENDER_QUEUE_NAME } from "./queue/renderQueue.js";
import type { RenderJobData, RenderJobResult } from "./types.js";

const WORKER_URL = process.env.WORKER_URL ?? "http://localhost:8000";
const OUTPUT_DIR = process.env.OUTPUT_DIR ?? "./output";

async function processRenderJob(job: Job<RenderJobData>): Promise<RenderJobResult> {
  const { sceneCode, sceneClassName, quality, renderId, sceneId } = job.data;
  const start = Date.now();

  if (renderId) await updateRenderStatus(renderId, { status: "ACTIVE" });
  if (sceneId) await updateSceneStatus(sceneId, { status: "ACTIVE" });

  const response = await fetch(`${WORKER_URL}/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scene_code: sceneCode,
      scene_class: sceneClassName,
      quality,
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(`Render failed: ${(body as { error?: string }).error ?? response.statusText}`);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, `${job.id}.mp4`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);

  const renderDurationMs = Number(response.headers.get("x-render-duration-ms") ?? Date.now() - start);

  return {
    outputPath,
    renderDurationMs,
    totalDurationMs: Date.now() - start,
  };
}

const worker = new Worker<RenderJobData, RenderJobResult>(RENDER_QUEUE_NAME, processRenderJob, {
  connection,
  concurrency: 2,
});

worker.on("completed", async (job, result) => {
  console.log(`[render] job ${job.id} done in ${result.totalDurationMs}ms (render: ${result.renderDurationMs}ms) -> ${result.outputPath}`);
  const outputUrl = `/media/${job.id}.mp4`;
  if (job.data.renderId) {
    await updateRenderStatus(job.data.renderId, {
      status: "COMPLETED",
      outputPath: result.outputPath,
      durationMs: result.totalDurationMs,
    });
  }
  if (job.data.sceneId) {
    await updateSceneStatus(job.data.sceneId, {
      status: "COMPLETED",
      outputUrl,
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

console.log(`Render dispatcher listening on queue "${RENDER_QUEUE_NAME}". WORKER_URL=${WORKER_URL}`);
