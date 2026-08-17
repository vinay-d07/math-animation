"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { createApiClient, resolveMediaUrl, type Scene, type VideoProject } from "../lib/api";
import { StatusPill, SCENE_STATUS, VIDEO_PROJECT_STATUS } from "./StatusPill";
import { IconAlert, IconArrowLeft, IconCoin, IconFilm, IconInfo, IconLoader, IconSparkles } from "./icons";

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
      <main className="flex min-h-[calc(100vh-53px)] items-center justify-center text-smoke">
        <IconLoader className="h-5 w-5" />
      </main>
    );
  }

  const canGenerate = videoProject.status === "PLANNED" || videoProject.status === "FAILED";
  const generating = starting || videoProject.status === "GENERATING";
  const projectStatus = VIDEO_PROJECT_STATUS[videoProject.status] ?? { label: videoProject.status, tone: "neutral" as const };

  return (
    <main className="mx-auto flex min-h-[calc(100vh-53px)] max-w-[760px] flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-caption font-medium text-smoke transition hover:text-ink">
            <IconArrowLeft className="h-3.5 w-3.5" />
            Dashboard
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-fog px-2.5 py-1 text-caption text-smoke">
            <IconCoin className="h-3.5 w-3.5" />
            {balance ?? "…"}
          </span>
        </div>

        <div>
          <h1 className="text-heading-lg font-bold tracking-tight text-ink">{videoProject.title}</h1>
          <p className="mt-2 text-body text-smoke">{videoProject.prompt}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <StatusPill label={projectStatus.label} tone={projectStatus.tone} />
          <button
            disabled={!canGenerate || generating}
            onClick={handleGenerate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-charcoal px-3.5 py-1.5 text-caption font-semibold text-paper transition hover:bg-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generating ? <IconLoader className="h-3.5 w-3.5" /> : <IconSparkles className="h-3.5 w-3.5" />}
            {videoProject.status === "FAILED" ? "Retry generation" : "Generate video"}
          </button>
        </div>

        {(error || videoProject.errorMessage) && (
          <div className="inline-flex items-start gap-1.5 rounded-lg border border-ink px-2.5 py-1.5 text-caption text-ink">
            <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error ?? videoProject.errorMessage}
          </div>
        )}
      </header>

      <ol className="flex flex-col gap-4">
        {scenes.map((scene, i) => {
          const status = SCENE_STATUS[scene.status] ?? { label: scene.status, tone: "neutral" as const };
          return (
            <li key={scene.id} className="rounded-2xl border border-fog bg-paper p-8">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-caption font-medium text-ink">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-mist text-[11px] text-smoke">
                    {i + 1}
                  </span>
                  <span className="font-mono">{scene.sceneClassName}</span>
                </span>
                <StatusPill label={status.label} tone={status.tone} />
              </div>

              <p className="mb-1 text-body text-ink">{scene.narration}</p>
              <p className="text-caption text-smoke">{scene.visualIntent}</p>

              {scene.explanation && (
                <div className="mt-3 flex gap-2 rounded-xl bg-mist p-3.5">
                  <IconInfo className="mt-0.5 h-3.5 w-3.5 shrink-0 text-smoke" />
                  <p className="text-caption leading-relaxed text-ink">{scene.explanation}</p>
                </div>
              )}

              {scene.status === "COMPLETED" && scene.outputUrl && (
                <video
                  controls
                  className="mt-4 w-full max-w-sm rounded-xl bg-charcoal"
                  src={resolveMediaUrl(scene.outputUrl)}
                />
              )}
              {scene.status === "FAILED" && scene.errorMessage && (
                <div className="mt-3 inline-flex items-start gap-1.5 rounded-lg border border-ink px-2.5 py-1.5 text-caption text-ink">
                  <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {scene.errorMessage}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </main>
  );
}
