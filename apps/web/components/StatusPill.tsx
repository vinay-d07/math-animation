import { IconAlert, IconCheck, IconLoader } from "./icons";

export type StatusTone = "neutral" | "busy" | "done" | "failed";

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: "bg-ash text-smoke",
  busy: "bg-charcoal text-paper",
  done: "bg-mist text-ink",
  failed: "border border-ink text-ink",
};

export function StatusPill({ label, tone }: { label: string; tone: StatusTone }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-medium ${TONE_CLASSES[tone]}`}
    >
      {tone === "busy" && <IconLoader className="h-3 w-3" />}
      {tone === "done" && <IconCheck className="h-3 w-3" />}
      {tone === "failed" && <IconAlert className="h-3 w-3" />}
      {label}
    </span>
  );
}

export const RENDER_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  IDLE: { label: "No render yet", tone: "neutral" },
  QUEUED: { label: "Queued", tone: "neutral" },
  ACTIVE: { label: "Rendering", tone: "busy" },
  COMPLETED: { label: "Completed", tone: "done" },
  FAILED: { label: "Failed", tone: "failed" },
  TIMEOUT: { label: "Timed out", tone: "failed" },
};

export const SCENE_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  QUEUED: { label: "Queued", tone: "neutral" },
  ACTIVE: { label: "Generating", tone: "busy" },
  COMPLETED: { label: "Ready", tone: "done" },
  FAILED: { label: "Failed", tone: "failed" },
  TIMEOUT: { label: "Timed out", tone: "failed" },
};

export const VIDEO_PROJECT_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  PLANNING: { label: "Planning storyboard", tone: "busy" },
  PLANNED: { label: "Ready to generate", tone: "neutral" },
  GENERATING: { label: "Generating", tone: "busy" },
  DONE: { label: "Done", tone: "done" },
  FAILED: { label: "Failed", tone: "failed" },
};
