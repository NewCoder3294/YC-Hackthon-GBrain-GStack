"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import clsx from "clsx";

interface Props {
  href: Route;
  label: string;
  /** Extra path prefixes that count as "active" for this link. Used when a
   *  single top-level tab fronts a cluster of sibling routes (e.g.
   *  "Incidents" → /triage + /incidents + /live + /feed). */
  alsoActiveFor?: string[];
}

export function NavLink({ href, label, alsoActiveFor }: Props) {
  const pathname = usePathname();
  const matches = [href as string, ...(alsoActiveFor ?? [])];
  const active = matches.some(
    (m) => pathname === m || pathname.startsWith(`${m}/`),
  );
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={clsx(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-md px-2 py-1.5 font-mono text-xs uppercase tracking-wider transition-colors duration-150 sm:px-3",
        active
          ? "bg-black text-white"
          : "text-neutral-500 hover:bg-neutral-100 hover:text-black",
      )}
    >
      {label}
    </Link>
  );
}
