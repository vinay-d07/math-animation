"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { createApiClient } from "../../../lib/api";
import { IconAlert, IconLoader } from "../../../components/icons";

export default function NewProjectPage() {
  const router = useRouter();
  const { getToken } = useAuth();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const api = createApiClient(getToken);
    api
      .createProject()
      .then(({ project }) => router.replace(`/editor/${project.id}`))
      .catch((err) => {
        console.error("Failed to create project", err);
        setError(err instanceof Error ? err.message : "Failed to create project");
      });
  }, [getToken, router]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      {error ? (
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10 text-red-400">
            <IconAlert className="h-5 w-5" />
          </div>
          <p className="text-sm text-neutral-300">Couldn&apos;t create your project</p>
          <p className="text-xs text-neutral-500">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 rounded-lg bg-neutral-800 px-4 py-2 text-sm hover:bg-neutral-700"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 text-neutral-400">
          <IconLoader className="h-6 w-6 text-indigo-400" />
          <p className="text-sm">Creating your project…</p>
        </div>
      )}
    </main>
  );
}
