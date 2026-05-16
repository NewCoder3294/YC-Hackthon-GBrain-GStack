"use client";

import { useState, useTransition } from "react";
import { writeIntelNote } from "@/app/(app)/kg/actions";

interface Props {
  relatedIncidentId?: string | null;
  relatedGangId?: string | null;
}

export function IntelNotePanel({
  relatedIncidentId = null,
  relatedGangId = null,
}: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!title.trim() || !body.trim()) {
      setError("Title and body required");
      return;
    }
    setError(null);
    setSaved(false);
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0 && /^[a-z0-9:_-]+$/.test(t))
      .slice(0, 20);

    startTransition(async () => {
      try {
        await writeIntelNote({
          title: title.trim(),
          body: body.trim(),
          tags,
          relatedIncidentId,
          relatedGangId,
        });
        setSaved(true);
        setTitle("");
        setBody("");
        setTagsInput("");
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed");
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full border border-neutral-300 px-2 py-1.5 font-mono text-[10px] uppercase tracking-widest text-neutral-500 hover:border-black hover:text-black"
      >
        + Write intel note to GBrain
      </button>
    );
  }

  return (
    <div className="space-y-2 border border-neutral-300 p-2">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Note title"
        className="h-7 w-full border border-neutral-200 bg-white px-2 font-mono text-xs focus:border-black focus:outline-none"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        placeholder="Free-text body. Markdown supported."
        className="w-full resize-y border border-neutral-200 bg-white px-2 py-1 font-mono text-xs focus:border-black focus:outline-none"
      />
      <input
        type="text"
        value={tagsInput}
        onChange={(e) => setTagsInput(e.target.value)}
        placeholder="tags, comma, separated"
        className="h-7 w-full border border-neutral-200 bg-white px-2 font-mono text-[10px] focus:border-black focus:outline-none"
      />
      {error && <p className="font-mono text-[10px] text-black">{error}</p>}
      {saved && (
        <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          Saved to GBrain
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="flex-1 border border-black bg-black px-2 py-1.5 font-mono text-[10px] uppercase tracking-widest text-white disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="border border-neutral-300 px-2 py-1.5 font-mono text-[10px] uppercase tracking-widest text-neutral-500 hover:border-black hover:text-black"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
