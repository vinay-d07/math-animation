"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { createApiClient, type VideoProjectMode } from "../../../lib/api";
import { IconAlert, IconLoader, IconSparkles } from "../../../components/icons";

const EXAMPLES = [
  "Explain the chain rule with a worked example",
  "Why does the Pythagorean theorem work?",
  "What is a Taylor series, visually?",
];

const MODES: { value: VideoProjectMode; label: string; description: string }[] = [
  { value: "SCENES", label: "Quick scenes", description: "A few short, silent clips — fast preview, no voiceover." },
  { value: "SHORT", label: "Full narrated short", description: "A 2-5 min explainer with voiceover, stitched into one video." },
];

export default function NewStoryboardPage() {
  const router = useRouter();
  const { getToken } = useAuth();
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<VideoProjectMode>("SCENES");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!prompt.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const api = createApiClient(getToken);
      const { videoProject } = await api.createVideoProject(prompt.trim(), mode);
      router.push(`/storyboard/${videoProject.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create storyboard");
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-[calc(100vh-53px)] flex-col items-center justify-center gap-6 px-6 py-10">
      <div className="w-full max-w-lg text-center">
        <h1 className="text-heading-lg font-bold tracking-tight text-ink">What do you want to explain?</h1>
        <p className="mt-3 text-body text-smoke">
          Describe a topic. It&apos;ll be broken into a short storyboard of a few scenes, each one
          coded, rendered, and explained in writing.
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                disabled={submitting}
                onClick={() => setMode(m.value)}
                className={`rounded-xl border p-3.5 text-left transition disabled:opacity-50 ${
                  mode === m.value ? "border-ink bg-mist" : "border-fog hover:border-pewter"
                }`}
              >
                <div className="text-caption font-semibold text-ink">{m.label}</div>
                <div className="mt-1 text-caption text-smoke">{m.description}</div>
              </button>
            ))}
          </div>

          <textarea
            className="min-h-28 resize-none rounded-xl border border-fog bg-paper p-3.5 text-body text-ink outline-none transition placeholder:text-pewter focus:border-ink"
            placeholder="e.g. Explain the chain rule with a worked example"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={submitting}
            autoFocus
          />

          {error && (
            <div className="inline-flex items-start gap-1.5 rounded-lg border border-ink px-2.5 py-1.5 text-left text-caption text-ink">
              <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}

          <button
            disabled={!prompt.trim() || submitting}
            onClick={handleSubmit}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-charcoal px-4 py-2.5 text-caption font-semibold text-paper transition hover:bg-ink disabled:cursor-not-allowed disabled:opacity-50"
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
              className="rounded-full border border-fog px-3 py-1.5 text-caption text-smoke transition hover:border-pewter hover:text-ink disabled:opacity-50"
            >
              {example}
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
