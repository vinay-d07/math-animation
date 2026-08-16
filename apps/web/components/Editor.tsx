"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import MonacoEditor, { DiffEditor } from "@monaco-editor/react";
import { createApiClient, type RenderStatus, type Version } from "../lib/api";
import {
  IconAlert,
  IconCheck,
  IconClock,
  IconCoin,
  IconDownload,
  IconFilm,
  IconHistory,
  IconLoader,
  IconPlay,
  IconSparkles,
  IconX,
} from "./icons";

type RenderState = {
  status: RenderStatus | "IDLE";
  outputUrl?: string;
  errorMessage?: string;
};

const STATUS_STYLES: Record<RenderStatus | "IDLE", { label: string; className: string }> = {
  IDLE: { label: "No render yet", className: "bg-neutral-800 text-neutral-400" },
  QUEUED: { label: "Queued", className: "bg-amber-500/15 text-amber-400" },
  ACTIVE: { label: "Rendering", className: "bg-indigo-500/15 text-indigo-400" },
  COMPLETED: { label: "Completed", className: "bg-emerald-500/15 text-emerald-400" },
  FAILED: { label: "Failed", className: "bg-red-500/15 text-red-400" },
  TIMEOUT: { label: "Timed out", className: "bg-red-500/15 text-red-400" },
};

function StatusPill({ status }: { status: RenderStatus | "IDLE" }) {
  const { label, className } = STATUS_STYLES[status];
  const busy = status === "QUEUED" || status === "ACTIVE";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${className}`}>
      {busy && <IconLoader className="h-3 w-3" />}
      {status === "COMPLETED" && <IconCheck className="h-3 w-3" />}
      {(status === "FAILED" || status === "TIMEOUT") && <IconAlert className="h-3 w-3" />}
      {label}
    </span>
  );
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function Editor({ projectId }: { projectId: string }) {
  const { getToken } = useAuth();
  const api = useMemo(() => createApiClient(getToken), [getToken]);

  const [code, setCode] = useState("");
  const [sceneClassName, setSceneClassName] = useState("NewScene");
  const [versions, setVersions] = useState<Version[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [render, setRender] = useState<RenderState>({ status: "IDLE" });
  const [rendering, setRendering] = useState(false);

  const [instruction, setInstruction] = useState("");
  const [aiStreaming, setAiStreaming] = useState(false);
  const [proposedCode, setProposedCode] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const [historyOpen, setHistoryOpen] = useState(false);

  const refreshBalance = useCallback(() => {
    api.getBalance().then((r) => setBalance(r.balance)).catch(() => {});
  }, [api]);

  useEffect(() => {
    api.getProject(projectId).then(({ currentVersion }) => {
      if (currentVersion) {
        setCode(currentVersion.code);
        setSceneClassName(currentVersion.sceneClassName);
      }
    });
    api.listVersions(projectId).then(setVersions);
    refreshBalance();
  }, [api, projectId, refreshBalance]);

  async function handleRender(quality: "preview" | "final") {
    setRendering(true);
    setRender({ status: "QUEUED" });
    try {
      const { renderId } = await api.startRender(projectId, code, sceneClassName, quality);
      refreshBalance();
      await api.watchRender(renderId, (data) => {
        setRender({ status: data.status, outputUrl: data.outputUrl, errorMessage: data.errorMessage });
        if (data.status === "COMPLETED" || data.status === "FAILED" || data.status === "TIMEOUT") {
          setRendering(false);
        }
      });
    } catch (err) {
      setRender({ status: "FAILED", errorMessage: err instanceof Error ? err.message : "Render failed" });
      setRendering(false);
      refreshBalance();
    }
  }

  async function handleAiEdit() {
    if (!instruction.trim()) return;
    setAiStreaming(true);
    setAiError(null);
    setProposedCode("");
    await api.streamAiEdit(projectId, code, instruction, undefined, {
      onChunk: (delta) => setProposedCode((prev) => (prev ?? "") + delta),
      onDone: () => {
        setAiStreaming(false);
        refreshBalance();
      },
      onInvalid: (reason) => {
        setAiError(`AI proposed unsafe code: ${reason ?? "rejected by validator"}`);
        setAiStreaming(false);
        setProposedCode(null);
      },
      onError: (message) => {
        setAiError(message);
        setAiStreaming(false);
        setProposedCode(null);
      },
    });
  }

  async function acceptAiEdit() {
    if (proposedCode == null) return;
    setCode(proposedCode);
    await api.saveVersion(projectId, proposedCode, sceneClassName, "AI");
    setVersions(await api.listVersions(projectId));
    setProposedCode(null);
    setInstruction("");
  }

  function rejectAiEdit() {
    setProposedCode(null);
  }

  async function handleRollback(versionId: string) {
    const version = await api.rollback(projectId, versionId);
    setCode(version.code);
    setSceneClassName(version.sceneClassName);
    setVersions(await api.listVersions(projectId));
    setHistoryOpen(false);
  }

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-800 bg-neutral-950/80 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-500/20 text-indigo-400">
              <IconFilm className="h-3.5 w-3.5" />
            </div>
            <span className="hidden text-sm font-semibold tracking-tight sm:inline">Manim Studio</span>
          </div>
          <div className="h-4 w-px bg-neutral-800" />
          <input
            className="rounded-md border border-transparent bg-neutral-900 px-2.5 py-1 font-mono text-sm text-neutral-200 outline-none transition focus:border-indigo-500/50"
            value={sceneClassName}
            onChange={(e) => setSceneClassName(e.target.value)}
            spellCheck={false}
          />
          <StatusPill status={render.status} />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="mr-1 inline-flex items-center gap-1.5 rounded-full border border-neutral-800 px-2.5 py-1 text-xs text-neutral-400">
            <IconCoin className="h-3.5 w-3.5 text-amber-400" />
            {balance ?? "…"}
          </span>
          <button
            className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-800 px-3 py-1.5 text-sm transition hover:bg-neutral-700"
            onClick={() => setHistoryOpen((v) => !v)}
          >
            <IconHistory className="h-3.5 w-3.5" />
            History
          </button>
          <button
            disabled={rendering}
            className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-800 px-3 py-1.5 text-sm transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => handleRender("preview")}
          >
            {rendering ? <IconLoader className="h-3.5 w-3.5" /> : <IconPlay className="h-3.5 w-3.5" />}
            Preview
          </button>
          <button
            disabled={rendering}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 px-3 py-1.5 text-sm font-medium text-white shadow-sm shadow-indigo-500/20 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => handleRender("final")}
          >
            {rendering ? <IconLoader className="h-3.5 w-3.5" /> : <IconFilm className="h-3.5 w-3.5" />}
            Render final
          </button>
        </div>
      </header>

      <div className="relative flex flex-1 overflow-hidden">
        <div className="flex w-1/2 flex-col border-r border-neutral-800">
          {proposedCode == null ? (
            <MonacoEditor
              language="python"
              theme="vs-dark"
              value={code}
              onChange={(value) => setCode(value ?? "")}
              options={{ minimap: { enabled: false }, fontSize: 13, padding: { top: 12 } }}
            />
          ) : (
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-900/50 px-3 py-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-300">
                  <IconSparkles className="h-3.5 w-3.5 text-indigo-400" />
                  Reviewing AI-proposed changes
                </span>
              </div>
              <div className="flex-1">
                <DiffEditor
                  language="python"
                  theme="vs-dark"
                  original={code}
                  modified={proposedCode}
                  options={{ minimap: { enabled: false }, fontSize: 13, readOnly: true }}
                />
              </div>
              <div className="flex gap-2 border-t border-neutral-800 p-2.5">
                <button
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium transition hover:bg-emerald-500"
                  onClick={acceptAiEdit}
                >
                  <IconCheck className="h-3.5 w-3.5" />
                  Accept
                </button>
                <button
                  className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-800 px-3 py-1.5 text-sm transition hover:bg-neutral-700"
                  onClick={rejectAiEdit}
                >
                  <IconX className="h-3.5 w-3.5" />
                  Reject
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex w-1/2 flex-col">
          <div className="flex flex-1 items-center justify-center bg-black/40 p-4">
            {render.status === "COMPLETED" && render.outputUrl ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-3">
                <video
                  controls
                  autoPlay
                  className="max-h-full max-w-full rounded-lg shadow-2xl"
                  src={`${api.apiUrl}${render.outputUrl}`}
                />
                <a
                  href={`${api.apiUrl}${render.outputUrl}`}
                  download
                  className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-800 px-3 py-1.5 text-xs text-neutral-300 transition hover:bg-neutral-900"
                >
                  <IconDownload className="h-3.5 w-3.5" />
                  Download
                </a>
              </div>
            ) : render.status === "FAILED" || render.status === "TIMEOUT" ? (
              <div className="flex max-w-md flex-col items-center gap-2 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10 text-red-400">
                  <IconAlert className="h-5 w-5" />
                </div>
                <p className="text-sm text-neutral-300">
                  {render.status === "TIMEOUT" ? "Render timed out" : "Render failed"}
                </p>
                {render.errorMessage && (
                  <p className="text-xs text-neutral-500">{render.errorMessage}</p>
                )}
              </div>
            ) : rendering ? (
              <div className="flex flex-col items-center gap-3 text-neutral-400">
                <IconLoader className="h-6 w-6 text-indigo-400" />
                <p className="text-sm">
                  Rendering… <span className="text-neutral-500">({render.status})</span>
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 text-neutral-600">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-neutral-800">
                  <IconFilm className="h-5 w-5" />
                </div>
                <p className="text-sm">No render yet</p>
                <p className="text-xs text-neutral-700">Click Preview or Render final to get started</p>
              </div>
            )}
          </div>

          <div className="flex h-64 flex-col border-t border-neutral-800 bg-neutral-900/20 p-3">
            <div className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-300">
              <IconSparkles className="h-4 w-4 text-indigo-400" />
              AI edit
            </div>
            {aiError && (
              <div className="mb-2 inline-flex items-start gap-1.5 rounded-md bg-red-500/10 px-2.5 py-1.5 text-xs text-red-400">
                <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {aiError}
              </div>
            )}
            <textarea
              className="mb-2 flex-1 resize-none rounded-lg border border-neutral-800 bg-neutral-900 p-2.5 text-sm outline-none transition placeholder:text-neutral-600 focus:border-indigo-500/50 disabled:opacity-60"
              placeholder="Describe the change you want… e.g. “make the title fade in slower”"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              disabled={aiStreaming}
            />
            <button
              disabled={aiStreaming || !instruction.trim()}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={handleAiEdit}
            >
              {aiStreaming ? (
                <>
                  <IconLoader className="h-3.5 w-3.5" />
                  Generating…
                </>
              ) : (
                <>
                  <IconSparkles className="h-3.5 w-3.5" />
                  Ask AI
                </>
              )}
            </button>
          </div>
        </div>

        {historyOpen && (
          <>
            <div
              className="absolute inset-0 z-10 bg-black/20"
              onClick={() => setHistoryOpen(false)}
            />
            <div className="absolute right-0 top-0 z-20 h-full w-80 animate-slide-in overflow-y-auto border-l border-neutral-800 bg-neutral-950 shadow-2xl">
              <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
                <div className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-200">
                  <IconHistory className="h-4 w-4" />
                  Version history
                </div>
                <button
                  className="rounded-md p-1 text-neutral-500 transition hover:bg-neutral-900 hover:text-neutral-300"
                  onClick={() => setHistoryOpen(false)}
                >
                  <IconX className="h-4 w-4" />
                </button>
              </div>
              <ul className="flex flex-col gap-2 p-3">
                {versions.length === 0 && (
                  <li className="px-1 py-6 text-center text-xs text-neutral-600">No versions yet</li>
                )}
                {versions.map((v) => (
                  <li
                    key={v.id}
                    className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3 text-xs transition hover:border-neutral-700"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          v.createdBy === "AI"
                            ? "bg-indigo-500/15 text-indigo-400"
                            : "bg-neutral-800 text-neutral-400"
                        }`}
                      >
                        {v.createdBy === "AI" && <IconSparkles className="h-3 w-3" />}
                        {v.createdBy}
                      </span>
                      <span className="inline-flex items-center gap-1 text-neutral-600">
                        <IconClock className="h-3 w-3" />
                        {timeAgo(v.createdAt)}
                      </span>
                    </div>
                    <button
                      className="w-full rounded-md bg-neutral-800 px-2 py-1.5 text-center transition hover:bg-neutral-700"
                      onClick={() => handleRollback(v.id)}
                    >
                      Restore this version
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
