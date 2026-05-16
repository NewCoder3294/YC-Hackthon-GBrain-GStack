"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { deleteIncident, updateIncident } from "../actions";
import type { Severity } from "../types";

interface Props {
  id: string;
  initialTitle: string;
  initialNotes: string;
  initialSeverity: Severity;
}

const SEVERITIES: Severity[] = ["low", "med", "high"];

export function EditIncidentForm({
  id,
  initialTitle,
  initialNotes,
  initialSeverity,
}: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [notes, setNotes] = useState(initialNotes);
  const [severity, setSeverity] = useState<Severity>(initialSeverity);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const dirty =
    title !== initialTitle ||
    notes !== initialNotes ||
    severity !== initialSeverity;

  const onSaveRef = useRef<() => void>(() => {});

  function onSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await updateIncident({
          id,
          title: title.trim(),
          notes: notes.trim() ? notes : null,
          severity,
        });
        setSaved(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed");
      }
    });
  }

  onSaveRef.current = onSave;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        onSaveRef.current();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!saved) return;
    const id = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(id);
  }, [saved]);

  function onDelete() {
    if (!confirm("Delete this incident? Clips will remain but unlinked.")) {
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await deleteIncident({ id });
        router.push("/incidents");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Delete failed");
      }
    });
  }

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          Title
        </span>
        <textarea
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          rows={2}
          spellCheck={false}
          data-gramm="false"
          data-gramm_editor="false"
          data-enable-grammarly="false"
          className="mt-1 w-full resize-y border border-neutral-200 bg-white px-3 py-2 font-mono text-sm leading-snug focus:border-black focus:outline-none"
        />
      </label>

      <label className="block">
        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          Severity
        </span>
        <div className="mt-1 inline-flex border border-neutral-200">
          {SEVERITIES.map((s) => {
            const active = severity === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setSeverity(s)}
                className={`px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest ${
                  active
                    ? "bg-black text-white"
                    : "bg-white text-neutral-500 hover:text-black"
                }`}
              >
                {s}
              </button>
            );
          })}
        </div>
      </label>

      <label className="block">
        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          Notes
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={6}
          spellCheck={false}
          data-gramm="false"
          data-gramm_editor="false"
          data-enable-grammarly="false"
          className="mt-1 w-full resize-y border border-neutral-200 bg-white p-3 font-mono text-sm leading-relaxed focus:border-black focus:outline-none"
          placeholder="Observed plate, time of event, follow-up actions…"
        />
      </label>

      {error && (
        <p className="font-mono text-xs text-black">{error}</p>
      )}
      {saved && !dirty && (
        <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          Saved
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button
          type="button"
          onClick={onSave}
          disabled={pending || !dirty || title.trim().length === 0}
        >
          {pending ? "Saving…" : "Save changes"}
        </Button>
        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-300">
          {dirty ? "⌘S to save" : ""}
        </span>
      </div>

      <div className="mt-8 border-t border-neutral-200 pt-6">
        <h2 className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          Danger zone
        </h2>
        <p className="mt-1 font-mono text-[10px] text-neutral-300">
          Deleting an incident unlinks its clips. The clips remain in storage.
        </p>
        <button
          type="button"
          onClick={onDelete}
          disabled={pending}
          className="mt-3 border border-neutral-300 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-black hover:border-black hover:bg-black hover:text-white disabled:opacity-40"
        >
          Delete incident
        </button>
      </div>
    </div>
  );
}
