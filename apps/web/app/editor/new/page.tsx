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
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-mist text-ink">
            <IconAlert className="h-5 w-5" />
          </div>
          <p className="text-body text-ink">Couldn&apos;t create your project</p>
          <p className="text-caption text-smoke">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 rounded-lg bg-charcoal px-4 py-2 text-caption font-medium text-paper transition hover:bg-ink"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 text-smoke">
          <IconLoader className="h-6 w-6" />
          <p className="text-caption">Creating your project…</p>
        </div>
      )}
    </main>
  );
}
