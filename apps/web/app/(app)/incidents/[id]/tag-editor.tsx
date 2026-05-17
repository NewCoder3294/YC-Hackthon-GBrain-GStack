"use client";

import { useState, useTransition } from "react";
import { addClipTag, removeClipTag } from "../actions";

interface Props {
  incidentId: string;
  clipId: string;
  initialTags: string[];
}

export function TagEditor({ incidentId, clipId, initialTags }: Props) {
  const [tags, setTags] = useState(initialTags);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onAdd() {
    const next = draft.trim().toLowerCase();
    if (!next) return;
    if (tags.includes(next)) {
      setDraft("");
      return;
    }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(next)) {
      setError("Use lowercase letters, digits, and hyphens.");
      return;
    }
    setError(null);
    const optimistic = [...tags, next];
    setTags(optimistic);
    setDraft("");
    startTransition(async () => {
      try {
        await addClipTag({ clipId, tag: next, incidentId });
      } catch (err) {
        setTags(tags);
        setError(err instanceof Error ? err.message : "Add failed");
      }
    });
  }

  function onRemove(tag: string) {
    const optimistic = tags.filter((t) => t !== tag);
    setTags(optimistic);
    startTransition(async () => {
      try {
        await removeClipTag({ clipId, tag, incidentId });
      } catch (err) {
        setTags(tags);
        setError(err instanceof Error ? err.message : "Remove failed");
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {tags.length === 0 && (
          <span className="font-mono text-[10px] leading-relaxed text-neutral-400">
            None yet — add tags like <code className="bg-neutral-100 px-1">plate-loiter</code> or <code className="bg-neutral-100 px-1">gang-related</code> to make this searchable.
          </span>
        )}
        {tags.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onRemove(t)}
            disabled={pending}
            className="group inline-flex items-center gap-1 border border-neutral-200 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-neutral-700 hover:border-black"
          >
            <span>{t}</span>
            <span aria-hidden className="text-neutral-300 group-hover:text-black">
              ×
            </span>
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onAdd();
        }}
        className="flex items-center gap-2"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="add-tag"
          className="h-7 w-40 border border-neutral-200 bg-white px-2 font-mono text-xs focus:border-black focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending || draft.trim().length === 0}
          className="h-7 border border-neutral-200 px-2 font-mono text-[10px] uppercase tracking-widest text-neutral-500 hover:border-black hover:text-black disabled:opacity-40"
        >
          Add
        </button>
      </form>
      {error && (
        <p className="font-mono text-[10px] text-black">{error}</p>
      )}
    </div>
  );
}
