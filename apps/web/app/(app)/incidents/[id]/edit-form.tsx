"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
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

// Machine-generated preambles from OpenClaw worker (e.g. "OpenClaw fused 21
// signals within 90s / 300m. Earliest …Z; latest …Z. Members: …") shouldn't
// crowd the dispatcher's note field. Split it out into a quoted origin block
// so the notes area is reserved for human commentary.
function splitMachinePreamble(notes: string): {
  preamble: string | null;
  user: string;
} {
  if (!notes) return { preamble: null, user: "" };
  const trimmed = notes.trim();
  if (!/^OpenClaw fused/i.test(trimmed)) {
    return { preamble: null, user: trimmed };
  }
  const blankIdx = trimmed.indexOf("\n\n");
  if (blankIdx === -1) return { preamble: trimmed, user: "" };
  return {
    preamble: trimmed.slice(0, blankIdx).trim(),
    user: trimmed.slice(blankIdx + 2).trim(),
  };
}

export function EditIncidentForm({
  id,
  initialTitle,
  initialNotes,
  initialSeverity,
}: Props) {
  const router = useRouter();
  const { preamble, user: initialUserNotes } = useMemo(
    () => splitMachinePreamble(initialNotes),
    [initialNotes],
  );
  const [title, setTitle] = useState(initialTitle);
  const [notes, setNotes] = useState(initialUserNotes);
  const [severity, setSeverity] = useState<Severity>(initialSeverity);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const dirty =
    title !== initialTitle ||
    notes !== initialUserNotes ||
    severity !== initialSeverity;

  const onSaveRef = useRef<() => void>(() => {});

  function onSave() {
    setError(null);
    setSaved(false);
    const composedNotes = preamble
      ? notes.trim()
        ? `${preamble}\n\n${notes.trim()}`
        : preamble
      : notes.trim() || null;
    startTransition(async () => {
      try {
        await updateIncident({
          id,
          title: title.trim(),
          notes: typeof composedNotes === "string" ? composedNotes : null,
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

      {preamble && (
        <div className="border-l-2 border-neutral-300 bg-neutral-50 px-3 py-2">
          <div className="mb-1 flex items-center gap-2 font-mono text-[9px] uppercase tracking-widest text-neutral-500">
            <span className="border border-neutral-300 bg-white px-1 py-0.5">openclaw</span>
            <span>auto-generated context</span>
          </div>
          <p className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-neutral-600">
            {preamble}
          </p>
        </div>
      )}

      <label className="block">
        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          Dispatcher notes
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

      {error && <p className="font-mono text-xs text-black">{error}</p>}

      <div className="flex h-9 items-center gap-3">
        {dirty ? (
          <>
            <Button
              type="button"
              onClick={onSave}
              disabled={pending || title.trim().length === 0}
            >
              {pending ? "Saving…" : "Save changes"}
            </Button>
            <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">
              ⌘S
            </span>
          </>
        ) : (
          <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-neutral-400">
            <span className="h-1.5 w-1.5 rounded-full bg-neutral-300" />
            {saved ? "Saved" : "All changes saved"}
          </span>
        )}
      </div>

      <details className="group mt-4 border-t border-neutral-100 pt-3">
        <summary className="flex cursor-pointer list-none items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-neutral-400 hover:text-black">
          <span className="transition-transform group-open:rotate-90">›</span>
          Danger zone
        </summary>
        <div className="mt-2 space-y-2 pl-4">
          <p className="font-mono text-[10px] leading-relaxed text-neutral-400">
            Deleting unlinks the clips. The clip files remain in storage and
            can be re-attached.
          </p>
          <button
            type="button"
            onClick={onDelete}
            disabled={pending}
            className="border border-neutral-300 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-black hover:border-black hover:bg-black hover:text-white disabled:opacity-40"
          >
            Delete incident
          </button>
        </div>
      </details>
    </div>
  );
}
