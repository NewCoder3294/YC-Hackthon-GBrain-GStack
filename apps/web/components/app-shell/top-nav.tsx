import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NavLink } from "./nav-link";
import { ThemeToggle } from "./theme-toggle";

const PUBLIC_LINKS: { href: Route; label: string }[] = [
  { href: "/map" as Route, label: "Map" },
  { href: "/live" as Route, label: "Live" },
  { href: "/feed" as Route, label: "Feed" },
  { href: "/about" as Route, label: "About" },
];

const OPERATOR_LINKS: { href: Route; label: string }[] = [
  { href: "/wall" as Route, label: "Wall" },
  { href: "/map" as Route, label: "Map" },
  { href: "/live" as Route, label: "Live" },
  { href: "/kg" as Route, label: "Knowledge Graph" },
  { href: "/incidents" as Route, label: "Incidents" },
  { href: "/triage" as Route, label: "Triage" },
  { href: "/enrichment" as Route, label: "Web Search" },
  { href: "/feed" as Route, label: "Feed" },
  { href: "/openclaw" as Route, label: "NemoClaw" },
];

export async function TopNav() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const links = user ? OPERATOR_LINKS : PUBLIC_LINKS;

  return (
    <header className="flex h-12 items-center gap-3 border-b border-neutral-200 px-3 sm:px-4">
      <Link
        href={"/" as Route}
        className="flex shrink-0 items-center gap-2 hover:opacity-80"
        title="WatchDog home"
      >
        <Image
          src="/watchdog.png"
          alt="WatchDog"
          width={24}
          height={24}
          priority
          className="rounded-sm"
        />
        <span className="hidden font-mono text-sm font-semibold uppercase tracking-[0.2em] sm:inline">
          WatchDog
        </span>
      </Link>
      <nav className="no-scrollbar flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
        {links.map((l) => (
          <NavLink key={l.href} href={l.href} label={l.label} />
        ))}
      </nav>
      <div className="flex shrink-0 items-center gap-2">
        <ThemeToggle />
        {!user && (
          <Link
            href={"/login" as Route}
            className="hidden h-8 items-center border border-neutral-300 px-3 font-mono text-[10px] uppercase tracking-widest text-neutral-700 hover:border-black hover:bg-black hover:text-white sm:inline-flex"
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
