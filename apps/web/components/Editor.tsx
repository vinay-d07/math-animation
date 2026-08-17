"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import MonacoEditor, { DiffEditor } from "@monaco-editor/react";
import { createApiClient, resolveMediaUrl, type RenderStatus, type Version } from "../lib/api";
import { timeAgo } from "../lib/format";
import { StatusPill, RENDER_STATUS } from "./StatusPill";
import {
  IconAlert,
  IconArrowLeft,
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

  const renderStatus = RENDER_STATUS[render.status];

  return (
    <div className="flex h-screen flex-col bg-paper text-ink">
      <header className="flex items-center justify-between border-b border-fog bg-paper px-4 py-2.5">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-smoke transition hover:bg-mist hover:text-ink"
            title="Back to dashboard"
          >
            <IconArrowLeft className="h-4 w-4" />
          </Link>
          <div className="h-4 w-px bg-fog" />
          <input
            className="rounded-lg border border-transparent bg-mist px-2.5 py-1 font-mono text-caption text-ink outline-none transition focus:border-ink"
            value={sceneClassName}
            onChange={(e) => setSceneClassName(e.target.value)}
            spellCheck={false}
          />
          <StatusPill label={renderStatus.label} tone={renderStatus.tone} />
        </div>
        <div className="flex items-center gap-2 text-caption">
          <span className="mr-1 inline-flex items-center gap-1.5 rounded-full border border-fog px-2.5 py-1 text-caption text-smoke">
            <IconCoin className="h-3.5 w-3.5" />
            {balance ?? "…"}
          </span>
          <button
            className="inline-flex items-center gap-1.5 rounded-lg border border-pewter px-3 py-1.5 font-medium text-ink transition hover:bg-mist"
            onClick={() => setHistoryOpen((v) => !v)}
          >
            <IconHistory className="h-3.5 w-3.5" />
            History
          </button>
          <button
            disabled={rendering}
            className="inline-flex items-center gap-1.5 rounded-lg border border-pewter px-3 py-1.5 font-medium text-ink transition hover:bg-mist disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => handleRender("preview")}
          >
            {rendering ? <IconLoader className="h-3.5 w-3.5" /> : <IconPlay className="h-3.5 w-3.5" />}
            Preview
          </button>
          <button
            disabled={rendering}
            className="inline-flex items-center gap-1.5 rounded-lg bg-charcoal px-3 py-1.5 font-semibold text-paper transition hover:bg-ink disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => handleRender("final")}
          >
            {rendering ? <IconLoader className="h-3.5 w-3.5" /> : <IconFilm className="h-3.5 w-3.5" />}
            Render final
          </button>
        </div>
      </header>

      <div className="relative flex flex-1 overflow-hidden">
        <div className="flex w-1/2 flex-col border-r border-fog">
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
              <div className="flex items-center justify-between border-b border-fog bg-mist px-3 py-2">
                <span className="inline-flex items-center gap-1.5 text-caption font-medium text-ink">
                  <IconSparkles className="h-3.5 w-3.5" />
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
              <div className="flex gap-2 border-t border-fog bg-paper p-2.5">
                <button
                  className="inline-flex items-center gap-1.5 rounded-lg bg-charcoal px-3 py-1.5 text-caption font-semibold text-paper transition hover:bg-ink"
                  onClick={acceptAiEdit}
                >
                  <IconCheck className="h-3.5 w-3.5" />
                  Accept
                </button>
                <button
                  className="inline-flex items-center gap-1.5 rounded-lg border border-pewter px-3 py-1.5 text-caption font-medium text-ink transition hover:bg-mist"
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
          <div className="dark-scroll flex flex-1 items-center justify-center bg-charcoal p-4">
            {render.status === "COMPLETED" && render.outputUrl ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-3">
                <video
                  controls
                  autoPlay
                  className="max-h-full max-w-full rounded-lg"
                  src={resolveMediaUrl(render.outputUrl)}
                />
                <a
                  href={resolveMediaUrl(render.outputUrl)}
                  download
                  className="inline-flex items-center gap-1.5 rounded-lg border border-graphite px-3 py-1.5 text-caption text-fog transition hover:bg-graphite"
                >
                  <IconDownload className="h-3.5 w-3.5" />
                  Download
                </a>
              </div>
            ) : render.status === "FAILED" || render.status === "TIMEOUT" ? (
              <div className="flex max-w-md flex-col items-center gap-2 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-graphite text-fog">
                  <IconAlert className="h-5 w-5" />
                </div>
                <p className="text-body text-fog">
                  {render.status === "TIMEOUT" ? "Render timed out" : "Render failed"}
                </p>
                {render.errorMessage && <p className="text-caption text-pewter">{render.errorMessage}</p>}
              </div>
            ) : rendering ? (
              <div className="flex flex-col items-center gap-3 text-fog">
                <IconLoader className="h-6 w-6" />
                <p className="text-caption">
                  Rendering… <span className="text-pewter">({render.status})</span>
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 text-pewter">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-graphite">
                  <IconFilm className="h-5 w-5" />
                </div>
                <p className="text-caption">No render yet</p>
                <p className="text-caption text-graphite">Click Preview or Render final to get started</p>
              </div>
            )}
          </div>

          <div className="flex h-64 flex-col border-t border-fog bg-paper p-3">
            <div className="mb-2 inline-flex items-center gap-1.5 text-caption font-semibold text-ink">
              <IconSparkles className="h-4 w-4" />
              AI edit
            </div>
            {aiError && (
              <div className="mb-2 inline-flex items-start gap-1.5 rounded-lg border border-ink px-2.5 py-1.5 text-caption text-ink">
                <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {aiError}
              </div>
            )}
            <textarea
              className="mb-2 flex-1 resize-none rounded-lg border border-fog bg-paper p-2.5 text-caption text-ink outline-none transition placeholder:text-pewter focus:border-ink disabled:opacity-60"
              placeholder="Describe the change you want… e.g. “make the title fade in slower”"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              disabled={aiStreaming}
            />
            <button
              disabled={aiStreaming || !instruction.trim()}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-charcoal px-3 py-1.5 text-caption font-semibold text-paper transition hover:bg-ink disabled:cursor-not-allowed disabled:opacity-50"
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
            <div className="absolute inset-0 z-10 bg-ink/20" onClick={() => setHistoryOpen(false)} />
            <div className="absolute right-0 top-0 z-20 h-full w-80 animate-slide-in overflow-y-auto border-l border-fog bg-paper shadow-2xl">
              <div className="flex items-center justify-between border-b border-fog px-4 py-3">
                <div className="inline-flex items-center gap-1.5 text-caption font-semibold text-ink">
                  <IconHistory className="h-4 w-4" />
                  Version history
                </div>
                <button
                  className="rounded-lg p-1 text-smoke transition hover:bg-mist hover:text-ink"
                  onClick={() => setHistoryOpen(false)}
                >
                  <IconX className="h-4 w-4" />
                </button>
              </div>
              <ul className="flex flex-col gap-2 p-3">
                {versions.length === 0 && (
                  <li className="px-1 py-6 text-center text-caption text-pewter">No versions yet</li>
                )}
                {versions.map((v) => (
                  <li key={v.id} className="rounded-xl border border-fog bg-paper p-3 text-caption transition hover:border-pewter">
                    <div className="mb-2 flex items-center justify-between">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          v.createdBy === "AI" ? "bg-mist text-ink" : "bg-ash text-smoke"
                        }`}
                      >
                        {v.createdBy === "AI" && <IconSparkles className="h-3 w-3" />}
                        {v.createdBy}
                      </span>
                      <span className="inline-flex items-center gap-1 text-smoke">
                        <IconClock className="h-3 w-3" />
                        {timeAgo(v.createdAt)}
                      </span>
                    </div>
                    <button
                      className="w-full rounded-lg border border-pewter px-2 py-1.5 text-center font-medium text-ink transition hover:bg-mist"
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
