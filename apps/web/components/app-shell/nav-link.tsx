"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import clsx from "clsx";

interface Props {
  href: Route;
  label: string;
}

export function NavLink({ href, label }: Props) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
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
