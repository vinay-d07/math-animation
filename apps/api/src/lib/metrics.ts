import { connection } from "../queue/connection.js";
import { renderQueue } from "../queue/renderQueue.js";

const KEY_PREFIX = "metrics:render";

/**
 * Redis-backed so counts are shared across every API/dispatcher process
 * rather than living in one instance's memory — the same reason the rate
 * limiter is Redis-backed (see server.ts). Kept deliberately simple
 * (counters, not a time series): enough to see render volume, failure
 * rate, and whether you're approaching your E2B plan's limits, without
 * standing up a metrics backend for a project this size.
 */
export async function recordRenderMetric(opts: {
  success: boolean;
  durationMs: number;
  quality: "low" | "high";
}): Promise<void> {
  const multi = connection.multi();
  multi.incr(`${KEY_PREFIX}:total`);
  multi.incr(`${KEY_PREFIX}:${opts.success ? "success" : "failed"}`);
  multi.incrby(`${KEY_PREFIX}:duration_ms_sum`, opts.durationMs);
  multi.incr(`${KEY_PREFIX}:quality:${opts.quality}`);
  await multi.exec();
}

export async function getRenderMetrics() {
  const [total, success, failed, durationSum, qualityLow, qualityHigh, queueCounts] = await Promise.all([
    connection.get(`${KEY_PREFIX}:total`),
    connection.get(`${KEY_PREFIX}:success`),
    connection.get(`${KEY_PREFIX}:failed`),
    connection.get(`${KEY_PREFIX}:duration_ms_sum`),
    connection.get(`${KEY_PREFIX}:quality:low`),
    connection.get(`${KEY_PREFIX}:quality:high`),
    renderQueue.getJobCounts("waiting", "active", "completed", "failed", "delayed"),
  ]);

  const totalNum = Number(total ?? 0);
  const durationSumNum = Number(durationSum ?? 0);

  return {
    totalRenders: totalNum,
    successCount: Number(success ?? 0),
    failedCount: Number(failed ?? 0),
    averageDurationMs: totalNum > 0 ? Math.round(durationSumNum / totalNum) : 0,
    byQuality: { low: Number(qualityLow ?? 0), high: Number(qualityHigh ?? 0) },
    queue: queueCounts,
  };
}
