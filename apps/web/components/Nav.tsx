"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/storyboard/new", label: "New video" },
  { href: "/editor/new", label: "Code editor" },
];

export default function Nav() {
  const pathname = usePathname();
  if (pathname?.startsWith("/editor/")) return null;

  return (
    <header className="sticky top-0 z-30 border-b border-fog bg-paper/95 py-2 backdrop-blur">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6 sm:px-10">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-charcoal">
            <Image src="/logo.jpg" alt="" width={20} height={20} className="rounded-[3px]" />
          </div>
          <span className="font-display text-heading-sm font-semibold tracking-tight text-ink">Manim Studio</span>
        </Link>

        <SignedIn>
          <nav className="hidden items-center gap-8 md:flex">
            {LINKS.map((link) => {
              const active = pathname === link.href || (link.href !== "/" && pathname?.startsWith(link.href));
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`text-caption font-medium transition ${
                    active ? "text-ink" : "text-graphite hover:text-ink"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </SignedIn>

        <div className="flex items-center gap-3">
          <SignedIn>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
          <SignedOut>
            <Link
              href="/sign-in"
              className="inline-flex items-center rounded-lg border border-pewter px-4 py-2 text-caption font-medium text-ink transition hover:bg-mist"
            >
              Sign in
            </Link>
          </SignedOut>
        </div>
      </div>
    </header>
  );
}
