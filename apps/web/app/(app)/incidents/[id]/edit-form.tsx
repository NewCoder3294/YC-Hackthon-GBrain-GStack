"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
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
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1"
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

      <div className="flex items-center justify-between">
        <Button
          type="button"
          onClick={onSave}
          disabled={pending || !dirty || title.trim().length === 0}
        >
          {pending ? "Saving…" : "Save changes"}
        </Button>
        <button
          type="button"
          onClick={onDelete}
          disabled={pending}
          className="font-mono text-[10px] uppercase tracking-widest text-neutral-500 hover:text-black disabled:opacity-40"
        >
          Delete incident
        </button>
      </div>
    </div>
  );
}
