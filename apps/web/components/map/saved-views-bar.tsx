"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import {
  saveCurrentView,
  deleteSavedView,
  type SavedView,
} from "@/app/(app)/map/views-actions";

interface Props {
  initialViews: SavedView[];
}

/**
 * Tucked between the GBrain ask bar and the map: a tiny dropdown of
 * the user's saved views + a "Save view" button when a filter is active.
 *
 * Keeping the UI deliberately compact — the map is the product, the
 * persistence UI is a footer ribbon.
 */
export function SavedViewsBar({ initialViews }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [views, setViews] = useState<SavedView[]>(initialViews);
  const [saving, startSave] = useTransition();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const qs = params.toString();
  const hasFilter = qs.length > 0;

  function loadView(view: SavedView) {
    const next = view.queryString ? `/map?${view.queryString}` : "/map";
    router.replace(next as Route);
  }

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    startSave(async () => {
      const res = await saveCurrentView({ name: name.trim(), queryString: qs });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setName("");
      // Optimistically prepend; the page will revalidate via the action.
      setViews((prev) => [
        {
          id: res.id,
          name: name.trim(),
          queryString: qs,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
    });
  }

  async function onDelete(id: string) {
    const res = await deleteSavedView({ id });
    if (res.ok) setViews((prev) => prev.filter((v) => v.id !== id));
  }

  return (
    <div className="pointer-events-auto absolute bottom-3 right-3 z-10 w-[min(320px,calc(100vw-1.5rem))] space-y-1.5">
      {views.length > 0 && (
        <ul className="max-h-44 overflow-y-auto border border-neutral-300 bg-white/95 font-mono text-[10px] uppercase tracking-widest backdrop-blur">
          {views.map((v) => (
            <li
              key={v.id}
              className="flex items-center gap-1.5 border-b border-neutral-100 px-2 py-1 last:border-b-0"
            >
              <button
                type="button"
                onClick={() => loadView(v)}
                className="min-w-0 flex-1 truncate text-left text-neutral-800 hover:text-black"
                title={v.queryString || "(no filter)"}
              >
                {v.name}
              </button>
              <button
                type="button"
                onClick={() => onDelete(v.id)}
                aria-label={`Delete saved view ${v.name}`}
                className="shrink-0 border border-neutral-300 px-1 py-0.5 text-neutral-500 hover:border-black hover:bg-black hover:text-white"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {hasFilter && (
        <form
          onSubmit={onSave}
          className="flex items-center gap-1.5 border border-neutral-300 bg-white/95 px-2 py-1 backdrop-blur"
        >
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            Save
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="view name"
            disabled={saving}
            maxLength={80}
            className="min-w-0 flex-1 border-0 bg-transparent font-mono text-xs text-neutral-800 placeholder:text-neutral-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="border border-neutral-300 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest hover:border-black hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "…" : "✓"}
          </button>
          {error && (
            <span className="font-mono text-[10px] normal-case text-red-700">
              {error}
            </span>
          )}
        </form>
      )}
    </div>
  );
}
