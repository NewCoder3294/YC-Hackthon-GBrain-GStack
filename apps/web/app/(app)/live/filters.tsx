"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";

interface Props {
  neighborhoods: string[];
}

const SOURCE_OPTIONS = [
  { value: "", label: "Any" },
  { value: "sfpd_cad", label: "SFPD Calls" },
  { value: "sf_fire_ems", label: "Fire/EMS" },
  { value: "sf_311", label: "311" },
  { value: "sfpd_reports", label: "SFPD Reports" },
  { value: "511_traffic", label: "Traffic" },
  { value: "511_transit", label: "Transit" },
];

const SEVERITY_OPTIONS = [
  { value: "", label: "Any" },
  { value: "low", label: "Low" },
  { value: "med", label: "Med" },
  { value: "high", label: "High" },
];

const SINCE_OPTIONS = [
  { value: "", label: "Any time" },
  { value: "1h", label: "Last 1h" },
  { value: "6h", label: "Last 6h" },
  { value: "24h", label: "Last 24h" },
  { value: "7d", label: "Last 7d" },
];

export function LiveFilters({ neighborhoods }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const get = useCallback((key: string) => params.get(key) ?? "", [params]);

  const update = useCallback(
    (patch: Record<string, string>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      const qs = next.toString();
      startTransition(() => {
        router.replace(qs ? `/live?${qs}` : "/live");
      });
    },
    [params, router],
  );

  const hasAny = useMemo(
    () =>
      ["source", "severity", "neighborhood", "since", "q", "ack"].some((k) =>
        params.get(k),
      ),
    [params],
  );

  const neighborhoodOptions = useMemo(
    () => [
      { value: "", label: "Any" },
      ...neighborhoods.map((n) => ({ value: n, label: n })),
    ],
    [neighborhoods],
  );

  return (
    <div
      className="flex flex-wrap items-end gap-3 border-b border-neutral-200 bg-white p-4"
      data-pending={pending ? "" : undefined}
    >
      <FilterField label="Search">
        <Input
          defaultValue={get("q")}
          placeholder="title, address…"
          className="h-8 w-56 text-xs"
          onChange={(e) => update({ q: e.target.value })}
        />
      </FilterField>

      <FilterField label="Source">
        <Combobox
          value={get("source")}
          onChange={(v) => update({ source: v })}
          options={SOURCE_OPTIONS}
          searchable={false}
          triggerLabel="Filter by source"
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

      <FilterField label="Neighborhood">
        <Combobox
          value={get("neighborhood")}
          onChange={(v) => update({ neighborhood: v })}
          options={neighborhoodOptions}
          triggerLabel="Filter by neighborhood"
        />
      </FilterField>

      <FilterField label="Since">
        <Combobox
          value={get("since")}
          onChange={(v) => update({ since: v })}
          options={SINCE_OPTIONS}
          searchable={false}
          triggerLabel="Filter by time"
        />
      </FilterField>

      <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-neutral-700">
        <input
          type="checkbox"
          checked={get("ack") === "1"}
          onChange={(e) => update({ ack: e.target.checked ? "1" : "" })}
          className="h-3.5 w-3.5 border border-neutral-300 accent-black"
        />
        Unack only
      </label>

      {hasAny && (
        <button
          type="button"
          onClick={() =>
            update({
              source: "",
              severity: "",
              neighborhood: "",
              since: "",
              q: "",
              ack: "",
            })
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
