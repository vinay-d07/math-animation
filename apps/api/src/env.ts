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
  WORKER_URL: process.env.WORKER_URL ?? "http://localhost:8000",
  OUTPUT_DIR: process.env.OUTPUT_DIR ?? "./output",
  REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",

  get DATABASE_URL() {
    return required("DATABASE_URL");
  },
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
};
