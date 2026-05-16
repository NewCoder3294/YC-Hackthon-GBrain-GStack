import type { Route } from "next";
import { NavLink } from "./nav-link";

export function TopNav({ email }: { email: string }) {
  return (
    <header className="flex h-12 items-center justify-between border-b border-neutral-200 px-4">
      <div className="flex items-center gap-6">
        <span className="font-mono text-sm font-semibold uppercase tracking-[0.2em]">Watchdog</span>
        <nav className="flex items-center gap-0.5">
          <NavLink href={"/" as Route} label="Wall" />
          <NavLink href={"/map" as Route} label="Map" />
          <NavLink href={"/kg" as Route} label="KG" />
          <NavLink href={"/incidents" as Route} label="Incidents" />
        </nav>
      </div>
      <span className="font-mono text-xs text-neutral-500">{email}</span>
    </header>
  );
}
