import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NavLink } from "./nav-link";
import { ThemeToggle } from "./theme-toggle";

// Public surfaces. Map + Live are the OSINT-style read-only views; About
// is the explainer. Feed stays public — fused signal substrate is the
// most useful "what's happening" view for a curious SF resident.
const PUBLIC_LINKS: OperatorLink[] = [
  { href: "/map" as Route, label: "Map" },
  { href: "/live" as Route, label: "Live" },
  { href: "/feed" as Route, label: "Feed" },
  { href: "/about" as Route, label: "About" },
];

// Operator surfaces collapse to four clusters. Wall + Map are
// situational awareness; Incidents owns the queue (Triage/Ranked/Live/
// Feed via the cluster sub-nav); Intel is GBrain + web enrichment. The
// OpenClaw worker dashboard sits behind a small pip in the header,
// not in main nav.
interface OperatorLink {
  href: Route;
  label: string;
  alsoActiveFor?: string[];
}

const OPERATOR_LINKS: OperatorLink[] = [
  { href: "/wall" as Route, label: "Wall" },
  { href: "/map" as Route, label: "Map" },
  {
    href: "/triage" as Route,
    label: "Incidents",
    alsoActiveFor: ["/incidents", "/live", "/feed"],
  },
  {
    href: "/kg" as Route,
    label: "Intel",
    alsoActiveFor: ["/enrichment"],
  },
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
          <NavLink
            key={l.href}
            href={l.href}
            label={l.label}
            {...(l.alsoActiveFor
              ? { alsoActiveFor: l.alsoActiveFor }
              : {})}
          />
        ))}
      </nav>
      <div className="flex shrink-0 items-center gap-2">
        {user && (
          <Link
            href={"/openclaw" as Route}
            title="NemoClaw worker status"
            className="hidden h-8 items-center gap-1.5 border border-neutral-300 px-2 font-mono text-[10px] uppercase tracking-widest text-neutral-600 hover:border-black hover:text-black sm:inline-flex"
          >
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 rounded-full bg-black"
            />
            NemoClaw
          </Link>
        )}
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
