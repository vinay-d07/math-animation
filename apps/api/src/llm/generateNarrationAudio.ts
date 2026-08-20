import { env } from "../env.js";

// playai-tts (the model this project originally targeted) was decommissioned
// by Groq; canopylabs/orpheus-v1-english is the current replacement on the
// same OpenAI-compatible /audio/speech endpoint. Confirmed working against
// the real API — a fresh Groq org must accept this model's terms once at
// https://console.groq.com/playground?model=canopylabs%2Forpheus-v1-english
// before calls succeed.
const TTS_MODEL = "canopylabs/orpheus-v1-english";
const TTS_ENDPOINT = "https://api.groq.com/openai/v1/audio/speech";

/**
 * Turns a scene's narration text into a WAV clip. Runs in this (trusted,
 * network-having) process, never inside the E2B render sandbox — the
 * sandbox stays network-less; the resulting audio bytes are pushed into it
 * as a file write from here instead (see sandboxRenderer.ts).
 */
export async function generateNarrationAudio(narration: string): Promise<Buffer> {
  const response = await fetch(TTS_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: TTS_MODEL,
      input: narration,
      voice: env.GROQ_TTS_VOICE,
      response_format: "wav",
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(`Groq TTS request failed: ${(body as { error?: { message?: string } }).error?.message ?? response.statusText}`);
  }

  return Buffer.from(await response.arrayBuffer());
}
