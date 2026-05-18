"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import clsx from "clsx";

interface SubTab {
  href: Route;
  label: string;
}

/**
 * Cluster sub-nav rendered above a group of related pages that share a
 * top-level entry in the main TopNav. Active when the current pathname
 * starts with the tab's href. Pure visual unification — no routing
 * changes; each tab is a normal Next link to an existing route.
 */
export function SubTabs({
  label,
  tabs,
}: {
  /** Cluster name shown to the left, e.g. "Incidents" or "Intel". */
  label: string;
  tabs: SubTab[];
}) {
  const pathname = usePathname();
  return (
    <div className="border-b border-neutral-200 bg-white">
      <div className="flex items-center gap-3 px-3 py-2 sm:px-4">
        <span className="hidden font-mono text-[10px] uppercase tracking-widest text-neutral-400 sm:inline">
          {label}
        </span>
        <nav className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {tabs.map((t) => {
            const active =
              pathname === t.href || pathname.startsWith(`${t.href}/`);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "inline-flex shrink-0 items-center whitespace-nowrap border px-2 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors",
                  active
                    ? "border-black bg-black text-white"
                    : "border-neutral-300 bg-white text-neutral-600 hover:border-black hover:text-black",
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
