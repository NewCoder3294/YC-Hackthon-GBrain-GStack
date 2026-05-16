import type { Route } from "next";
import Image from "next/image";
import { NavLink } from "./nav-link";

export function TopNav() {
  return (
    <header className="flex h-12 items-center justify-between border-b border-neutral-200 px-4">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Image
            src="/watchdog.png"
            alt="WatchDog"
            width={24}
            height={24}
            priority
            className="rounded-sm"
          />
          <span className="font-mono text-sm font-semibold uppercase tracking-[0.2em]">
            WatchDog
          </span>
        </div>
        <nav className="flex items-center gap-0.5">
          <NavLink href={"/wall" as Route} label="Wall" />
          <NavLink href={"/map" as Route} label="Map" />
          <NavLink href={"/live" as Route} label="Live" />
          <NavLink href={"/kg" as Route} label="Knowledge Graph" />
          <NavLink href={"/incidents" as Route} label="Incidents" />
          <NavLink href={"/enrichment" as Route} label="Web Search" />
          <NavLink href={"/openclaw" as Route} label="OpenClaw" />
        </nav>
      </div>
    </header>
  );
}
