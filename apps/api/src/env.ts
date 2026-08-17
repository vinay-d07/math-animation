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

  // Object storage for rendered clips — Supabase Storage (see apps/api/src/lib/storage.ts).
  get SUPABASE_URL() {
    return required("SUPABASE_URL");
  },
  get SUPABASE_SERVICE_ROLE_KEY() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  SUPABASE_STORAGE_BUCKET: process.env.SUPABASE_STORAGE_BUCKET ?? "renders",
};
