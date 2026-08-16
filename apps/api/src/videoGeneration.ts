import { randomUUID } from "node:crypto";
import { prisma } from "@manim-saas/db";
import { CREDIT_COSTS, deductCredits, getBalance } from "@manim-saas/db/credits";
import { generateSceneCode } from "./llm/generateSceneCode.js";
import { validateSceneCode } from "./validation/astGuard.js";
import { renderQueue } from "./queue/renderQueue.js";

const MAX_SCENE_ATTEMPTS = 2;
const SCENE_RENDER_TIMEOUT_MS = 3 * 60 * 1000;
const SCENE_RENDER_POLL_MS = 1000;

/**
 * Runs sequentially, one scene at a time: the render worker is a single
 * CPU-capped container, so fanning out concurrent renders here just
 * reintroduces the contention issues already hit with two-at-once renders.
 */
export async function runVideoGeneration(videoProjectId: string, userId: string): Promise<void> {
  const scenes = await prisma.scene.findMany({
    where: { videoProjectId },
    orderBy: { order: "asc" },
  });

  for (const scene of scenes) {
    if (scene.status === "COMPLETED") continue;

    const result = await renderSceneWithRetries(scene.id, scene.sceneClassName, scene.narration, scene.visualIntent, userId);
    if (!result.ok) {
      await failProject(videoProjectId, `Scene "${scene.sceneClassName}" failed: ${result.error}`);
      return;
    }
  }

  await prisma.videoProject.update({ where: { id: videoProjectId }, data: { status: "DONE" } });
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
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= MAX_SCENE_ATTEMPTS; attempt++) {
    await prisma.scene.update({ where: { id: sceneId }, data: { status: "ACTIVE", errorMessage: null } });

    try {
      const code = await generateSceneCode(sceneClassName, narration, visualIntent, lastError);

      const validation = await validateSceneCode(code);
      if (!validation.ok) {
        lastError = `Code was rejected by the safety validator: ${validation.reason}`;
        continue;
      }

      await prisma.scene.update({ where: { id: sceneId }, data: { code } });

      const balance = await getBalance(userId);
      if (balance < CREDIT_COSTS.SCENE_RENDER) {
        return { ok: false, error: `Insufficient credits: have ${balance}, need ${CREDIT_COSTS.SCENE_RENDER}` };
      }

      const jobId = randomUUID();
      await renderQueue.add(
        "render",
        { sceneCode: code, sceneClassName, quality: "low", sceneId },
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

async function failProject(videoProjectId: string, message: string): Promise<void> {
  await prisma.videoProject.update({
    where: { id: videoProjectId },
    data: { status: "FAILED", errorMessage: message },
  });
}
