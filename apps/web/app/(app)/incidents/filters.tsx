"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useTransition } from "react";
import { Input } from "@/components/ui/input";

interface Props {
  routes: string[];
  tags: string[];
}

const SEVERITIES = [
  { value: "", label: "All severities" },
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
        <Select
          value={get("route")}
          onChange={(v) => update({ route: v })}
          options={[{ value: "", label: "Any" }, ...routes.map((r) => ({ value: r, label: r }))]}
        />
      </FilterField>

      <FilterField label="Tag">
        <Select
          value={get("tag")}
          onChange={(v) => update({ tag: v })}
          options={[{ value: "", label: "Any" }, ...tags.map((t) => ({ value: t, label: t }))]}
        />
      </FilterField>

      <FilterField label="Severity">
        <Select
          value={get("severity")}
          onChange={(v) => update({ severity: v })}
          options={SEVERITIES}
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

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 min-w-[8rem] border border-neutral-200 bg-white px-2 font-mono text-xs focus:border-black focus:outline-none"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
