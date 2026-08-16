"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { createApiClient, type Scene, type VideoProject } from "../lib/api";
import { IconAlert, IconCheck, IconCoin, IconFilm, IconLoader, IconSparkles } from "./icons";

const SCENE_STATUS_STYLES: Record<Scene["status"], { label: string; className: string }> = {
  QUEUED: { label: "Queued", className: "bg-neutral-800 text-neutral-400" },
  ACTIVE: { label: "Generating", className: "bg-indigo-500/15 text-indigo-400" },
  COMPLETED: { label: "Ready", className: "bg-emerald-500/15 text-emerald-400" },
  FAILED: { label: "Failed", className: "bg-red-500/15 text-red-400" },
  TIMEOUT: { label: "Timed out", className: "bg-red-500/15 text-red-400" },
};

const PROJECT_STATUS_STYLES: Record<VideoProject["status"], { label: string; className: string }> = {
  PLANNING: { label: "Planning storyboard", className: "bg-amber-500/15 text-amber-400" },
  PLANNED: { label: "Ready to generate", className: "bg-neutral-800 text-neutral-400" },
  GENERATING: { label: "Generating", className: "bg-indigo-500/15 text-indigo-400" },
  DONE: { label: "Done", className: "bg-emerald-500/15 text-emerald-400" },
  FAILED: { label: "Failed", className: "bg-red-500/15 text-red-400" },
};

function StatusPill({
  status,
  styles,
}: {
  status: string;
  styles: Record<string, { label: string; className: string }>;
}) {
  const { label, className } = styles[status];
  const busy = status === "QUEUED" || status === "ACTIVE" || status === "PLANNING" || status === "GENERATING";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${className}`}>
      {busy && <IconLoader className="h-3 w-3" />}
      {(status === "COMPLETED" || status === "DONE") && <IconCheck className="h-3 w-3" />}
      {(status === "FAILED" || status === "TIMEOUT") && <IconAlert className="h-3 w-3" />}
      {label}
    </span>
  );
}

export default function Storyboard({ projectId }: { projectId: string }) {
  const { getToken } = useAuth();
  const api = useMemo(() => createApiClient(getToken), [getToken]);

  const [videoProject, setVideoProject] = useState<VideoProject | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    const result = await api.getVideoProject(projectId);
    setVideoProject(result.videoProject);
    setScenes(result.scenes);
    return result.videoProject;
  }, [api, projectId]);

  useEffect(() => {
    refresh().catch((err) => setError(err instanceof Error ? err.message : "Failed to load project"));
    api.getBalance().then((r) => setBalance(r.balance)).catch(() => {});
  }, [refresh, api]);

  useEffect(() => {
    const active = videoProject?.status === "PLANNING" || videoProject?.status === "GENERATING";
    if (!active) return;

    pollRef.current = setInterval(() => {
      refresh()
        .then(() => api.getBalance().then((r) => setBalance(r.balance)))
        .catch(() => {});
    }, 2000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [videoProject?.status, refresh, api]);

  async function handleGenerate() {
    setStarting(true);
    setError(null);
    try {
      await api.generateVideo(projectId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start generation");
    } finally {
      setStarting(false);
    }
  }

  if (!videoProject) {
    return (
      <main className="flex min-h-screen items-center justify-center text-neutral-500">
        <IconLoader className="h-5 w-5 text-indigo-400" />
      </main>
    );
  }

  const canGenerate = videoProject.status === "PLANNED" || videoProject.status === "FAILED";
  const generating = starting || videoProject.status === "GENERATING";

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-500/20 text-indigo-400">
              <IconFilm className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold tracking-tight">Manim Studio</span>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-800 px-2.5 py-1 text-xs text-neutral-400">
            <IconCoin className="h-3.5 w-3.5 text-amber-400" />
            {balance ?? "…"}
          </span>
        </div>

        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-50">{videoProject.title}</h1>
          <p className="mt-1 text-sm text-neutral-500">{videoProject.prompt}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <StatusPill status={videoProject.status} styles={PROJECT_STATUS_STYLES} />
          <button
            disabled={!canGenerate || generating}
            onClick={handleGenerate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generating ? <IconLoader className="h-3.5 w-3.5" /> : <IconSparkles className="h-3.5 w-3.5" />}
            {videoProject.status === "FAILED" ? "Retry generation" : "Generate video"}
          </button>
        </div>

        {(error || videoProject.errorMessage) && (
          <div className="inline-flex items-start gap-1.5 rounded-md bg-red-500/10 px-2.5 py-1.5 text-xs text-red-400">
            <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error ?? videoProject.errorMessage}
          </div>
        )}
      </header>

      <ol className="flex flex-col gap-3">
        {scenes.map((scene, i) => (
          <li key={scene.id} className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 text-sm font-medium text-neutral-200">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-[11px] text-neutral-400">
                  {i + 1}
                </span>
                <span className="font-mono">{scene.sceneClassName}</span>
              </span>
              <StatusPill status={scene.status} styles={SCENE_STATUS_STYLES} />
            </div>
            <p className="mb-1 text-sm text-neutral-300">{scene.narration}</p>
            <p className="text-xs text-neutral-500">{scene.visualIntent}</p>

            {scene.status === "COMPLETED" && scene.outputUrl && (
              <video
                controls
                className="mt-3 w-full max-w-sm rounded-lg border border-neutral-800 bg-black"
                src={`${api.apiUrl}${scene.outputUrl}`}
              />
            )}
            {scene.status === "FAILED" && scene.errorMessage && (
              <div className="mt-3 inline-flex items-start gap-1.5 rounded-md bg-red-500/10 px-2.5 py-1.5 text-xs text-red-400">
                <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {scene.errorMessage}
              </div>
            )}
          </li>
        ))}
      </ol>
    </main>
  );
}
