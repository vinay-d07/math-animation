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
      <header className="flex flex-col gap-8 border-b-2 border-black pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-[56px] font-semibold uppercase leading-[0.95] tracking-tight text-black sm:text-[72px]">
            Your
            <br />
            Projects
          </h1>
          <p className="mt-3 text-body text-smoke">Every video and code project you&apos;ve started, in one place.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/storyboard/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-black px-4 py-2.5 text-caption font-semibold text-paper transition hover:bg-charcoal"
          >
            <IconSparkles className="h-3.5 w-3.5" />
            New video
          </Link>
          <Link
            href="/editor/new"
            className="inline-flex items-center gap-1.5 rounded-lg border-2 border-black px-4 py-2.5 text-caption font-medium text-black transition hover:bg-black hover:text-paper"
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
                    className="group flex flex-col gap-3 rounded-2xl border-2 border-black bg-paper p-8 transition hover:bg-black"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-black text-paper transition group-hover:bg-paper group-hover:text-black">
                        <IconFilm className="h-4 w-4" />
                      </div>
                      <StatusPill label={status.label} tone={status.tone} />
                    </div>
                    <div>
                      <div className="font-display text-heading-sm font-semibold uppercase tracking-tight text-black transition group-hover:text-paper">
                        {vp.title}
                      </div>
                      <p className="mt-1 line-clamp-2 text-caption text-smoke transition group-hover:text-fog">{vp.prompt}</p>
                    </div>
                    <span className="mt-auto text-caption text-smoke transition group-hover:text-fog">{timeAgo(vp.createdAt)}</span>
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
                  className="group flex flex-col gap-3 rounded-2xl border-2 border-black bg-paper p-8 transition hover:bg-black"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black text-paper transition group-hover:bg-paper group-hover:text-black">
                    <IconFilm className="h-4 w-4" />
                  </div>
                  <div className="font-display text-heading-sm font-semibold uppercase tracking-tight text-black transition group-hover:text-paper">
                    {p.title}
                  </div>
                  <span className="mt-auto text-caption text-smoke transition group-hover:text-fog">{timeAgo(p.updatedAt)}</span>
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
      <h2 className="font-display text-[28px] font-semibold uppercase tracking-tight text-black">{title}</h2>
      {empty ? (
        <div className="rounded-2xl border-2 border-dashed border-black/30 px-8 py-12 text-center text-caption text-smoke">
          {emptyLabel}
        </div>
      ) : (
        children
      )}
    </section>
  );
}
