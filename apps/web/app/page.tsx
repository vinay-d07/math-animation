import Link from "next/link";
import { SignedIn, SignedOut } from "@clerk/nextjs";
import { IconFilm, IconHistory, IconSparkles } from "../components/icons";

export default function HomePage() {
  return (
    <main className="flex min-h-[calc(100vh-53px)] flex-col items-center px-6 py-20 text-center sm:px-10">
      <div className="inline-flex animate-fade-in items-center gap-1.5 rounded-full border border-ink px-3 py-1.5 text-caption font-medium text-ink">
        <IconSparkles className="h-3.5 w-3.5" />
        AI-assisted Manim editing
      </div>

      <h1 className="mt-6 max-w-3xl animate-fade-in text-heading-xl font-bold tracking-tight text-ink sm:text-display-lg">
        Math animations,{" "}
        <span className="text-gradient-electric">written and rendered</span> in one place
      </h1>

      <p className="mt-6 max-w-[640px] animate-fade-in text-subheading font-normal text-smoke">
        Describe a topic in plain English or write Manim scene code by hand. Get back a rendered
        video, a written explanation of every scene, and a full edit history you can roll back
        any time.
      </p>

      <div className="mt-8 flex animate-fade-in flex-wrap items-center justify-center gap-3">
        <SignedIn>
          <Link
            href="/storyboard/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-charcoal px-5 py-2.5 text-caption font-semibold text-paper transition hover:bg-ink"
          >
            <IconSparkles className="h-3.5 w-3.5" />
            Generate from a prompt
          </Link>
          <Link
            href="/editor/new"
            className="inline-flex items-center gap-1.5 rounded-lg border border-pewter px-5 py-2.5 text-caption font-medium text-ink transition hover:bg-mist"
          >
            Open blank editor
          </Link>
        </SignedIn>
        <SignedOut>
          <Link
            href="/sign-in"
            className="inline-flex items-center gap-1.5 rounded-lg bg-charcoal px-5 py-2.5 text-caption font-semibold text-paper transition hover:bg-ink"
          >
            Sign in to start
          </Link>
        </SignedOut>
      </div>

      <div className="mt-20 grid w-full max-w-[1200px] grid-cols-1 gap-6 text-left sm:grid-cols-3">
        <FeatureCard
          icon={<IconSparkles className="h-4 w-4" />}
          title="Prompt to storyboard"
          description="Describe a topic and get a short scene-by-scene plan — each scene coded, rendered, and explained in writing."
        />
        <FeatureCard
          icon={<IconFilm className="h-4 w-4" />}
          title="Instant renders"
          description="Queue a preview or final render and watch status update live, with math typeset correctly and every shot framed on screen."
        />
        <FeatureCard
          icon={<IconHistory className="h-4 w-4" />}
          title="Full history"
          description="Every save is a version. Roll back to any point in one click."
        />
      </div>
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
    <div className="rounded-2xl border border-fog bg-paper p-8">
      <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-mist text-ink">
        {icon}
      </div>
      <div className="mb-1.5 text-heading-sm font-semibold text-ink">{title}</div>
      <p className="text-caption leading-relaxed text-smoke">{description}</p>
    </div>
  );
}
