import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const env = {
  PORT: Number(process.env.PORT ?? 4000),
  FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN ?? "http://localhost:3000",
  REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
  RENDER_CONCURRENCY: Number(process.env.RENDER_CONCURRENCY ?? 10),
  // How many scenes of a single video project generate (codegen + TTS +
  // sandbox render) at once. Distinct from RENDER_CONCURRENCY, which caps
  // total sandbox parallelism system-wide across every user's videos.
  SCENE_GENERATION_CONCURRENCY: Number(process.env.SCENE_GENERATION_CONCURRENCY ?? 3),

  get DATABASE_URL() {
    return required("DATABASE_URL");
  },
  get E2B_API_KEY() {
    return required("E2B_API_KEY");
  },
  E2B_TEMPLATE_ID: process.env.E2B_TEMPLATE_ID ?? "manim-render",
  get CLERK_SECRET_KEY() {
    return required("CLERK_SECRET_KEY");
  },
  get CLERK_WEBHOOK_SECRET() {
    return required("CLERK_WEBHOOK_SECRET");
  },
  get GROQ_API_KEY() {
    return required("GROQ_API_KEY");
  },
  GROQ_MODEL: process.env.GROQ_MODEL ?? "openai/gpt-oss-120b",
  GROQ_TTS_VOICE: process.env.GROQ_TTS_VOICE ?? "troy",

  // Optional second free-tier LLM bucket (https://cloud.cerebras.ai) — an
  // entirely separate rate-limit pool from Groq's, so routing storyboard
  // planning here instead of competing with scene-codegen calls for Groq's
  // budget effectively adds capacity for free. Cerebras' free tier trades
  // the opposite way from Groq's (30K TPM but only 5 req/min, vs Groq's 8K
  // TPM / 30 req/min) — good for planning's few-large-calls pattern, bad
  // for codegen's many-small-concurrent-calls pattern, so codegen and
  // editing stay on Groq. Unset by default: planStoryboard falls back to
  // Groq if no key is configured.
  CEREBRAS_API_KEY: process.env.CEREBRAS_API_KEY,
  CEREBRAS_MODEL: process.env.CEREBRAS_MODEL ?? "gpt-oss-120b",

  // Object storage for rendered clips — Supabase Storage (see apps/api/src/lib/storage.ts).
  get SUPABASE_URL() {
    return required("SUPABASE_URL");
  },
  get SUPABASE_SERVICE_ROLE_KEY() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  SUPABASE_STORAGE_BUCKET: process.env.SUPABASE_STORAGE_BUCKET ?? "renders",
};
