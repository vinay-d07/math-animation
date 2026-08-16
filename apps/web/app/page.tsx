import Link from "next/link";
import { SignedIn, SignedOut } from "@clerk/nextjs";
import { IconFilm, IconHistory, IconSparkles } from "../components/icons";

export default function HomePage() {
  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, rgba(99,102,241,0.18) 0%, rgba(9,9,11,0) 70%)",
        }}
      />

      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-500/20 text-indigo-400">
            <IconFilm className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight">Manim Studio</span>
        </div>
        <nav className="flex items-center gap-3 text-sm">
          <SignedIn>
            <Link href="/editor/new" className="text-neutral-400 transition hover:text-neutral-100">
              Open editor
            </Link>
          </SignedIn>
          <SignedOut>
            <Link href="/sign-in" className="text-neutral-400 transition hover:text-neutral-100">
              Sign in
            </Link>
          </SignedOut>
        </nav>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center sm:px-10">
        <div className="mb-5 inline-flex animate-fade-in items-center gap-1.5 rounded-full border border-neutral-800 bg-neutral-900/60 px-3 py-1 text-xs text-neutral-400">
          <IconSparkles className="h-3.5 w-3.5 text-indigo-400" />
          AI-assisted Manim editing
        </div>

        <h1 className="max-w-2xl animate-fade-in text-4xl font-semibold tracking-tight text-neutral-50 sm:text-5xl">
          Math animations,{" "}
          <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
            written and rendered
          </span>{" "}
          in one place
        </h1>

        <p className="mt-5 max-w-lg animate-fade-in text-balance text-neutral-400">
          Write Manim scene code by hand or describe the change you want in plain English.
          Render previews instantly, roll back any version, and keep every edit in history.
        </p>

        <div className="mt-8 flex animate-fade-in flex-wrap items-center justify-center gap-3">
          <SignedIn>
            <Link
              href="/storyboard/new"
              className="rounded-lg bg-indigo-500 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400"
            >
              Generate from a prompt
            </Link>
            <Link
              href="/editor/new"
              className="rounded-lg border border-neutral-800 px-5 py-2.5 text-sm font-medium text-neutral-200 transition hover:bg-neutral-900"
            >
              Open blank editor
            </Link>
          </SignedIn>
          <SignedOut>
            <Link
              href="/sign-in"
              className="rounded-lg bg-indigo-500 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400"
            >
              Sign in to start
            </Link>
          </SignedOut>
        </div>

        <div className="mt-20 grid w-full max-w-3xl grid-cols-1 gap-4 text-left sm:grid-cols-3">
          <FeatureCard
            icon={<IconSparkles className="h-4 w-4" />}
            title="Prompt to storyboard"
            description="Describe a topic and get a short scene-by-scene plan, coded and rendered automatically."
          />
          <FeatureCard
            icon={<IconFilm className="h-4 w-4" />}
            title="Instant renders"
            description="Queue a preview or final render and watch status update live."
          />
          <FeatureCard
            icon={<IconHistory className="h-4 w-4" />}
            title="Full history"
            description="Every save is a version. Roll back to any point in one click."
          />
        </div>
      </section>
    </main>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="mb-2.5 flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">
        {icon}
      </div>
      <div className="mb-1 text-sm font-medium text-neutral-200">{title}</div>
      <p className="text-xs leading-relaxed text-neutral-500">{description}</p>
    </div>
  );
}
