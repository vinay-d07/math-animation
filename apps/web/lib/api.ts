import { consumeSSE } from "./sse";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Render output URLs are absolute (Supabase Storage); only prefix legacy relative paths. */
export function resolveMediaUrl(url: string): string {
  return /^https?:\/\//.test(url) ? url : `${API_URL}${url}`;
}

export interface Project {
  id: string;
  title: string;
  currentVersionId: string | null;
  updatedAt: string;
}

export interface Version {
  id: string;
  projectId: string;
  code: string;
  sceneClassName: string;
  createdBy: "USER" | "AI";
  createdAt: string;
}

export type RenderStatus = "QUEUED" | "ACTIVE" | "COMPLETED" | "FAILED" | "TIMEOUT";

export type VideoProjectStatus = "PLANNING" | "PLANNED" | "GENERATING" | "DONE" | "FAILED";
export type VideoProjectMode = "SCENES" | "SHORT";

export interface VideoProject {
  id: string;
  title: string;
  prompt: string;
  mode: VideoProjectMode;
  status: VideoProjectStatus;
  errorMessage: string | null;
  outputUrl: string | null;
  durationMs: number | null;
  createdAt: string;
}

export interface Scene {
  id: string;
  videoProjectId: string;
  order: number;
  narration: string;
  visualIntent: string;
  explanation: string | null;
  sceneClassName: string;
  code: string | null;
  status: RenderStatus;
  outputUrl: string | null;
  errorMessage: string | null;
  durationMs: number | null;
}

async function apiFetch<T>(
  getToken: () => Promise<string | null>,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export function createApiClient(getToken: () => Promise<string | null>) {
  return {
    createProject: (title = "Untitled project") =>
      apiFetch<{ project: Project; currentVersion: Version }>(getToken, "/api/projects", {
        method: "POST",
        body: JSON.stringify({ title }),
      }),

    listProjects: () => apiFetch<Project[]>(getToken, "/api/projects"),

    getProject: (id: string) =>
      apiFetch<{ project: Project; currentVersion: Version | null }>(getToken, `/api/projects/${id}`),

    listVersions: (projectId: string) =>
      apiFetch<Version[]>(getToken, `/api/projects/${projectId}/versions`),

    saveVersion: (projectId: string, code: string, sceneClassName: string, createdBy: "USER" | "AI") =>
      apiFetch<Version>(getToken, `/api/projects/${projectId}/versions`, {
        method: "POST",
        body: JSON.stringify({ code, sceneClassName, createdBy }),
      }),

    rollback: (projectId: string, versionId: string) =>
      apiFetch<Version>(getToken, `/api/projects/${projectId}/versions/${versionId}/rollback`, {
        method: "POST",
      }),

    startRender: (projectId: string, code: string, sceneClassName: string, quality: "preview" | "final") =>
      apiFetch<{ renderId: string; jobId: string; versionId: string }>(
        getToken,
        `/api/projects/${projectId}/render`,
        { method: "POST", body: JSON.stringify({ code, sceneClassName, quality }) }
      ),

    getBalance: () => apiFetch<{ balance: number }>(getToken, "/api/me"),

    createVideoProject: (prompt: string, mode: VideoProjectMode = "SCENES") =>
      apiFetch<{ videoProject: VideoProject; scenes: Scene[] }>(getToken, "/api/video-projects", {
        method: "POST",
        body: JSON.stringify({ prompt, mode }),
      }),

    listVideoProjects: () => apiFetch<VideoProject[]>(getToken, "/api/video-projects"),

    getVideoProject: (id: string) =>
      apiFetch<{ videoProject: VideoProject; scenes: Scene[] }>(getToken, `/api/video-projects/${id}`),

    generateVideo: (id: string) =>
      apiFetch<{ status: string }>(getToken, `/api/video-projects/${id}/generate`, { method: "POST" }),

    updateScene: (videoProjectId: string, sceneId: string, data: { narration?: string; visualIntent?: string }) =>
      apiFetch<Scene>(getToken, `/api/video-projects/${videoProjectId}/scenes/${sceneId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),

    deleteScene: (videoProjectId: string, sceneId: string) =>
      apiFetch<{ ok: true }>(getToken, `/api/video-projects/${videoProjectId}/scenes/${sceneId}`, {
        method: "DELETE",
      }),

    reorderScenes: (videoProjectId: string, sceneIds: string[]) =>
      apiFetch<Scene[]>(getToken, `/api/video-projects/${videoProjectId}/scenes/reorder`, {
        method: "POST",
        body: JSON.stringify({ sceneIds }),
      }),

    watchRender: async (
      renderId: string,
      onStatus: (data: { status: RenderStatus; outputUrl?: string; durationMs?: number; errorMessage?: string }) => void
    ) => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/renders/${renderId}/events`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      await consumeSSE(res, { status: onStatus });
    },

    streamAiEdit: async (
      projectId: string,
      code: string,
      instruction: string,
      selection: string | undefined,
      handlers: {
        onChunk: (delta: string) => void;
        onDone: (code: string) => void;
        onInvalid: (reason?: string) => void;
        onError: (message: string) => void;
      }
    ) => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/projects/${projectId}/ai-edit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ code, instruction, selection }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        handlers.onError(body.error ?? `Request failed: ${res.status}`);
        return;
      }

      await consumeSSE(res, {
        chunk: (data) => handlers.onChunk(data.delta),
        done: (data) => handlers.onDone(data.code),
        invalid: (data) => handlers.onInvalid(data.reason),
        error: (data) => handlers.onError(data.message),
      });
    },

    apiUrl: API_URL,
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
