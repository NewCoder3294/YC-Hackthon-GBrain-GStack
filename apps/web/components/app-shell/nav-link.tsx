"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import clsx from "clsx";

interface Props {
  href: Route;
  label: string;
  shortcut: string;
}

export function NavLink({ href, label, shortcut }: Props) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
  return (
    <Link
      href={href}
      className={clsx(
        "flex items-center gap-2 border-b-2 px-3 py-3 font-mono text-xs uppercase tracking-widest",
        active ? "border-black text-black" : "border-transparent text-neutral-500 hover:text-black",
      )}
    >
      <span>{label}</span>
      <span className="text-[10px] text-neutral-300">{shortcut}</span>
    </Link>
  );
}
