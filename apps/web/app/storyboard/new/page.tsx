"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { createApiClient } from "../../../lib/api";
import { IconAlert, IconFilm, IconLoader, IconSparkles } from "../../../components/icons";

const EXAMPLES = [
  "Explain the chain rule with a worked example",
  "Why does the Pythagorean theorem work?",
  "What is a Taylor series, visually?",
];

export default function NewStoryboardPage() {
  const router = useRouter();
  const { getToken } = useAuth();
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!prompt.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const api = createApiClient(getToken);
      const { videoProject } = await api.createVideoProject(prompt.trim());
      router.push(`/storyboard/${videoProject.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create storyboard");
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-10">
      <div className="inline-flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-500/20 text-indigo-400">
          <IconFilm className="h-4 w-4" />
        </div>
        <span className="text-sm font-semibold tracking-tight">Manim Studio</span>
      </div>

      <div className="w-full max-w-lg text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-50">
          What do you want to explain?
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          Describe a topic. It'll be broken into a short storyboard of a few scenes, each one
          coded and rendered with Manim.
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <textarea
            className="min-h-28 resize-none rounded-xl border border-neutral-800 bg-neutral-900 p-3 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-600 focus:border-indigo-500/50"
            placeholder="e.g. Explain the chain rule with a worked example"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={submitting}
            autoFocus
          />

          {error && (
            <div className="inline-flex items-start gap-1.5 rounded-md bg-red-500/10 px-2.5 py-1.5 text-left text-xs text-red-400">
              <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}

          <button
            disabled={!prompt.trim() || submitting}
            onClick={handleSubmit}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? <IconLoader className="h-4 w-4" /> : <IconSparkles className="h-4 w-4" />}
            {submitting ? "Planning storyboard…" : "Plan storyboard"}
          </button>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              disabled={submitting}
              onClick={() => setPrompt(example)}
              className="rounded-full border border-neutral-800 px-3 py-1 text-xs text-neutral-400 transition hover:border-neutral-700 hover:text-neutral-200 disabled:opacity-50"
            >
              {example}
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
