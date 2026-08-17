"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { createApiClient, type Project, type VideoProject } from "../../lib/api";
import { timeAgo } from "../../lib/format";
import { StatusPill, VIDEO_PROJECT_STATUS } from "../../components/StatusPill";
import { IconFilm, IconLoader, IconPlus, IconSparkles } from "../../components/icons";

export default function DashboardPage() {
  const { getToken } = useAuth();
  const api = useMemo(() => createApiClient(getToken), [getToken]);

  const [videoProjects, setVideoProjects] = useState<VideoProject[] | null>(null);
  const [projects, setProjects] = useState<Project[] | null>(null);

  useEffect(() => {
    api.listVideoProjects().then(setVideoProjects).catch(() => setVideoProjects([]));
    api.listProjects().then(setProjects).catch(() => setProjects([]));
  }, [api]);

  const loading = videoProjects === null || projects === null;

  return (
    <main className="mx-auto flex min-h-screen max-w-[1200px] flex-col gap-16 px-6 py-16 sm:px-10">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-heading-lg font-bold tracking-tight text-ink">Your projects</h1>
          <p className="mt-2 text-body text-smoke">Every video and code project you've started, in one place.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/storyboard/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-charcoal px-4 py-2.5 text-caption font-semibold text-paper transition hover:bg-ink"
          >
            <IconSparkles className="h-3.5 w-3.5" />
            New video
          </Link>
          <Link
            href="/editor/new"
            className="inline-flex items-center gap-1.5 rounded-lg border border-pewter px-4 py-2.5 text-caption font-medium text-ink transition hover:bg-mist"
          >
            <IconPlus className="h-3.5 w-3.5" />
            New editor project
          </Link>
        </div>
      </header>

      {loading ? (
        <div className="flex flex-1 items-center justify-center py-20 text-smoke">
          <IconLoader className="h-5 w-5" />
        </div>
      ) : (
        <>
          <Section title="Videos" empty={videoProjects.length === 0} emptyLabel="No videos yet — generate one from a prompt.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {videoProjects.map((vp) => {
                const status = VIDEO_PROJECT_STATUS[vp.status] ?? { label: vp.status, tone: "neutral" as const };
                return (
                  <Link
                    key={vp.id}
                    href={`/storyboard/${vp.id}`}
                    className="group flex flex-col gap-3 rounded-2xl border border-fog bg-paper p-8 transition hover:border-pewter"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-mist text-ink">
                        <IconFilm className="h-4 w-4" />
                      </div>
                      <StatusPill label={status.label} tone={status.tone} />
                    </div>
                    <div>
                      <div className="text-heading-sm font-semibold text-ink">{vp.title}</div>
                      <p className="mt-1 line-clamp-2 text-caption text-smoke">{vp.prompt}</p>
                    </div>
                    <span className="mt-auto text-caption text-smoke">{timeAgo(vp.createdAt)}</span>
                  </Link>
                );
              })}
            </div>
          </Section>

          <Section title="Editor projects" empty={projects.length === 0} emptyLabel="No editor projects yet — start from a blank scene.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((p) => (
                <Link
                  key={p.id}
                  href={`/editor/${p.id}`}
                  className="group flex flex-col gap-3 rounded-2xl border border-fog bg-paper p-8 transition hover:border-pewter"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-mist text-ink">
                    <IconFilm className="h-4 w-4" />
                  </div>
                  <div className="text-heading-sm font-semibold text-ink">{p.title}</div>
                  <span className="mt-auto text-caption text-smoke">{timeAgo(p.updatedAt)}</span>
                </Link>
              ))}
            </div>
          </Section>
        </>
      )}
    </main>
  );
}

function Section({
  title,
  empty,
  emptyLabel,
  children,
}: {
  title: string;
  empty: boolean;
  emptyLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-heading font-semibold text-ink">{title}</h2>
      {empty ? (
        <div className="rounded-2xl border border-dashed border-fog px-8 py-12 text-center text-caption text-smoke">
          {emptyLabel}
        </div>
      ) : (
        children
      )}
    </section>
  );
}
