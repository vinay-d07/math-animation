"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { createApiClient, resolveMediaUrl, type Scene, type VideoProject } from "../lib/api";
import { StatusPill, SCENE_STATUS, VIDEO_PROJECT_STATUS } from "./StatusPill";
import {
  IconAlert,
  IconArrowLeft,
  IconChevronRight,
  IconCoin,
  IconDownload,
  IconFilm,
  IconInfo,
  IconLoader,
  IconSparkles,
  IconX,
} from "./icons";

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

  function updateLocalNarration(sceneId: string, narration: string) {
    setScenes((prev) => prev.map((s) => (s.id === sceneId ? { ...s, narration } : s)));
  }

  async function handleNarrationBlur(scene: Scene, value: string) {
    if (value === scene.narration || !value.trim()) return;
    try {
      await api.updateScene(projectId, scene.id, { narration: value });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save narration");
      await refresh();
    }
  }

  async function moveScene(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= scenes.length) return;
    const reordered = [...scenes];
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    setScenes(reordered);
    try {
      await api.reorderScenes(projectId, reordered.map((s) => s.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reorder scenes");
      await refresh();
    }
  }

  async function handleDeleteScene(sceneId: string) {
    try {
      await api.deleteScene(projectId, sceneId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete scene");
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
  const editable = videoProject.status === "PLANNED";
  const projectStatus = VIDEO_PROJECT_STATUS[videoProject.status] ?? { label: videoProject.status, tone: "neutral" as const };
  const generateLabel =
    videoProject.status === "FAILED" ? "Retry generation" : videoProject.mode === "SHORT" ? "Generate short" : "Generate scenes";

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
            {generateLabel}
          </button>
        </div>

        {(error || videoProject.errorMessage) && (
          <div className="inline-flex items-start gap-1.5 rounded-lg border border-ink px-2.5 py-1.5 text-caption text-ink">
            <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error ?? videoProject.errorMessage}
          </div>
        )}
      </header>

      {videoProject.status === "DONE" && videoProject.outputUrl && (
        <section className="flex flex-col gap-3 rounded-2xl border border-fog bg-paper p-8">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-caption font-medium text-ink">
              <IconFilm className="h-3.5 w-3.5" />
              Final narrated video
            </span>
            <a
              href={resolveMediaUrl(videoProject.outputUrl)}
              download
              className="inline-flex items-center gap-1.5 rounded-lg border border-pewter px-3 py-1.5 text-caption font-medium text-ink transition hover:bg-mist"
            >
              <IconDownload className="h-3.5 w-3.5" />
              Download
            </a>
          </div>
          <video controls className="w-full rounded-xl bg-charcoal" src={resolveMediaUrl(videoProject.outputUrl)} />
        </section>
      )}

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
                <div className="flex items-center gap-2">
                  {editable && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={i === 0}
                        onClick={() => moveScene(i, -1)}
                        aria-label="Move scene up"
                        className="flex h-6 w-6 items-center justify-center rounded-md text-smoke transition hover:bg-mist hover:text-ink disabled:opacity-30"
                      >
                        <IconChevronRight className="h-3.5 w-3.5 -rotate-90" />
                      </button>
                      <button
                        type="button"
                        disabled={i === scenes.length - 1}
                        onClick={() => moveScene(i, 1)}
                        aria-label="Move scene down"
                        className="flex h-6 w-6 items-center justify-center rounded-md text-smoke transition hover:bg-mist hover:text-ink disabled:opacity-30"
                      >
                        <IconChevronRight className="h-3.5 w-3.5 rotate-90" />
                      </button>
                      <button
                        type="button"
                        disabled={scenes.length <= 1}
                        onClick={() => handleDeleteScene(scene.id)}
                        aria-label="Delete scene"
                        className="flex h-6 w-6 items-center justify-center rounded-md text-smoke transition hover:bg-mist hover:text-ink disabled:opacity-30"
                      >
                        <IconX className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  <StatusPill label={status.label} tone={status.tone} />
                </div>
              </div>

              {editable ? (
                <textarea
                  className="mb-1 w-full resize-none rounded-lg border border-fog bg-paper p-2.5 text-body text-ink outline-none transition focus:border-ink"
                  value={scene.narration}
                  onChange={(e) => updateLocalNarration(scene.id, e.target.value)}
                  onBlur={(e) => handleNarrationBlur(scene, e.target.value)}
                  rows={2}
                />
              ) : (
                <p className="mb-1 text-body text-ink">{scene.narration}</p>
              )}
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
