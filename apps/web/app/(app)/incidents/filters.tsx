"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";

interface Props {
  routes: string[];
  tags: string[];
}

const SEVERITY_OPTIONS = [
  { value: "", label: "Any" },
  { value: "low", label: "Low" },
  { value: "med", label: "Med" },
  { value: "high", label: "High" },
];

export function IncidentFilters({ routes, tags }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const get = useCallback(
    (key: string) => params.get(key) ?? "",
    [params],
  );

  const update = useCallback(
    (patch: Record<string, string>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      const qs = next.toString();
      startTransition(() => {
        router.replace(qs ? `/incidents?${qs}` : "/incidents");
      });
    },
    [params, router],
  );

  const hasAny = useMemo(
    () =>
      ["from", "to", "route", "tag", "severity", "q"].some(
        (k) => params.get(k),
      ),
    [params],
  );

  const routeOptions = useMemo(
    () => [
      { value: "", label: "Any" },
      ...sortRoutes(routes).map((r) => ({ value: r, label: r })),
    ],
    [routes],
  );

  const tagOptions = useMemo(
    () => [
      { value: "", label: "Any" },
      ...tags.map((t) => ({ value: t, label: t })),
    ],
    [tags],
  );

  return (
    <div
      className="flex flex-wrap items-end gap-3 border-b border-neutral-200 bg-white p-4"
      data-pending={pending ? "" : undefined}
    >
      <FilterField label="Search">
        <Input
          defaultValue={get("q")}
          placeholder="title or notes…"
          className="h-8 w-56 text-xs"
          onChange={(e) => update({ q: e.target.value })}
        />
      </FilterField>

      <FilterField label="From">
        <Input
          type="date"
          defaultValue={get("from")}
          className="h-8 w-36 text-xs"
          onChange={(e) => update({ from: e.target.value })}
        />
      </FilterField>

      <FilterField label="To">
        <Input
          type="date"
          defaultValue={get("to")}
          className="h-8 w-36 text-xs"
          onChange={(e) => update({ to: e.target.value })}
        />
      </FilterField>

      <FilterField label="Route">
        <Combobox
          value={get("route")}
          onChange={(v) => update({ route: v })}
          options={routeOptions}
          triggerLabel="Filter by route"
        />
      </FilterField>

      <FilterField label="Tag">
        <Combobox
          value={get("tag")}
          onChange={(v) => update({ tag: v })}
          options={tagOptions}
          triggerLabel="Filter by tag"
        />
      </FilterField>

      <FilterField label="Severity">
        <Combobox
          value={get("severity")}
          onChange={(v) => update({ severity: v })}
          options={SEVERITY_OPTIONS}
          searchable={false}
          triggerLabel="Filter by severity"
        />
      </FilterField>

      {hasAny && (
        <button
          type="button"
          onClick={() =>
            update({ from: "", to: "", route: "", tag: "", severity: "", q: "" })
          }
          className="h-8 border border-neutral-200 px-3 font-mono text-[10px] uppercase tracking-widest text-neutral-500 hover:border-black hover:text-black"
        >
          Clear
        </button>
      )}
    </div>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
        {label}
      </span>
      {children}
    </label>
  );
}

const ROUTE_PREFIX_ORDER: Record<string, number> = {
  "I-": 0,
  "US-": 1,
  "SR-": 2,
};

function sortRoutes(routes: string[]): string[] {
  return [...routes].sort((a, b) => {
    const ap = a.slice(0, a.indexOf("-") + 1);
    const bp = b.slice(0, b.indexOf("-") + 1);
    const aw = ROUTE_PREFIX_ORDER[ap] ?? 99;
    const bw = ROUTE_PREFIX_ORDER[bp] ?? 99;
    if (aw !== bw) return aw - bw;
    const an = Number(a.split("-")[1] ?? 0);
    const bn = Number(b.split("-")[1] ?? 0);
    if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) {
      return an - bn;
    }
    return a.localeCompare(b);
  });
}
