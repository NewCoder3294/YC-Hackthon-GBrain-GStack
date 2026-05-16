import type { Route } from "next";
import { NavLink } from "./nav-link";

export function TopNav({ email }: { email: string }) {
  return (
    <header className="flex h-12 items-center justify-between border-b border-neutral-200 px-4">
      <div className="flex items-center gap-6">
        <span className="font-mono text-xs uppercase tracking-widest">CalTrans · D4</span>
        <nav className="flex items-center gap-1">
          <NavLink href={"/" as Route} label="Wall" shortcut="g w" />
          <NavLink href={"/map" as Route} label="Map" shortcut="g m" />
          <NavLink href={"/kg" as Route} label="KG" shortcut="g k" />
          <NavLink href={"/incidents" as Route} label="Incidents" shortcut="g i" />
        </nav>
      </div>
      <span className="font-mono text-xs text-neutral-500">{email}</span>
    </header>
  );
}
