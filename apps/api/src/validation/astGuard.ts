import { env } from "../env.js";

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

export async function validateSceneCode(code: string): Promise<ValidationResult> {
  const response = await fetch(`${env.WORKER_URL}/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scene_code: code }),
  });

  if (!response.ok) {
    return { ok: false, reason: `Validator unavailable (${response.status})` };
  }

  return (await response.json()) as ValidationResult;
}
