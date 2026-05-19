"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export type DetailSubject =
  | {
      kind: "incident";
      id: string;
      title: string;
      source: string;
      sourceUrl?: string | null;
      lat: number;
      lng: number;
      occurredAt: string;
      severity?: string | null;
      neighborhood?: string | null;
      payload: Record<string, unknown>;
    }
  | {
      kind: "news";
      id: string;
      title: string;
      source: string;
      sourceUrl?: string | null;
      lat: number;
      lng: number;
      publishedAt: string;
      crimeType?: string | null;
      severity?: string | null;
      neighborhood?: string | null;
      payload: Record<string, unknown>;
    }
  | {
      kind: "camera";
      id: string;
      title: string;
      source: string;
      sourceUrl?: string | null;
      lat: number;
      lng: number;
      streamUrl?: string | null;
      streamType?: string | null;
      payload: Record<string, unknown>;
    };

export interface NearestCamera {
  id: string;
  label: string;
  lat: number;
  lng: number;
  distanceM: number;
}

export interface PriorIncident {
  id: string;
  title: string;
  occurredAt: string;
  distanceM: number;
  severity?: string | null;
}

interface Props {
  subject: DetailSubject | null;
  nearestCameras: NearestCamera[];
  priorIncidents: PriorIncident[];
  onClose: () => void;
  onJumpToCamera: (cameraId: string) => void;
}

/**
 * Sliding right-side sheet (not modal). Closes on Esc. Shows source +
 * deep-link, payload (collapsed), nearest 3 cameras (jump-to-feed buttons),
 * and nearest prior incidents within 24h.
 */
export function IncidentDetailSheet({
  subject,
  nearestCameras,
  priorIncidents,
  onClose,
  onJumpToCamera,
}: Props) {
  const [payloadExpanded, setPayloadExpanded] = useState(false);

  useEffect(() => {
    if (!subject) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [subject, onClose]);

  useEffect(() => {
    setPayloadExpanded(false);
  }, [subject?.id]);

  const payloadJson = useMemo(() => {
    if (!subject) return "";
    try {
      return JSON.stringify(subject.payload, null, 2);
    } catch {
      return "(payload not serializable)";
    }
  }, [subject]);

  return (
    <aside
      className={cn(
        "pointer-events-auto fixed right-0 top-0 z-40 flex h-full w-[380px] flex-col border-l border-neutral-300 bg-white shadow-lg transition-transform duration-200 ease-out",
        subject ? "translate-x-0" : "translate-x-full",
      )}
      role="complementary"
      aria-label="Incident detail"
      aria-hidden={!subject}
    >
      {subject && (
        <>
          <header className="flex items-start justify-between gap-3 border-b border-neutral-200 px-4 py-3">
            <div className="min-w-0">
              <div className="font-mono text-[9px] uppercase tracking-wider text-neutral-500">
                {subject.kind} · {subject.source}
              </div>
              <h2 className="mt-0.5 truncate text-sm font-medium text-neutral-900">
                {subject.title}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close detail panel"
              className="rounded-sm border border-neutral-300 px-2 py-1 font-mono text-[10px] uppercase hover:border-neutral-500 hover:bg-neutral-50"
            >
              esc
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-3 text-[12px] text-neutral-800">
            <Section label="location">
              <div className="font-mono text-[11px] text-neutral-700">
                {subject.lat.toFixed(4)}, {subject.lng.toFixed(4)}
                {"neighborhood" in subject && subject.neighborhood && (
                  <span className="ml-2 text-neutral-500">
                    · {subject.neighborhood}
                  </span>
                )}
              </div>
            </Section>

            {subject.sourceUrl && (
              <Section label="source link">
                <a
                  href={subject.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all font-mono text-[11px] text-neutral-700 underline decoration-dotted hover:text-neutral-900"
                >
                  {subject.sourceUrl}
                </a>
              </Section>
            )}

            <Section label="nearest cameras">
              {nearestCameras.length === 0 ? (
                <div className="text-[11px] text-neutral-500">
                  none within range
                </div>
              ) : (
                <ul className="flex flex-col gap-1">
                  {nearestCameras.slice(0, 3).map((cam) => (
                    <li
                      key={cam.id}
                      className="flex items-center justify-between gap-2 rounded-sm border border-neutral-200 px-2 py-1"
                    >
                      <span className="min-w-0 truncate font-mono text-[11px] text-neutral-700">
                        {cam.label}{" "}
                        <span className="text-neutral-400">
                          {Math.round(cam.distanceM)}m
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => onJumpToCamera(cam.id)}
                        className="rounded-sm border border-neutral-300 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider hover:border-neutral-500 hover:bg-neutral-50"
                      >
                        jump to feed
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section label="prior incidents (24h)">
              {priorIncidents.length === 0 ? (
                <div className="text-[11px] text-neutral-500">none nearby</div>
              ) : (
                <ul className="flex flex-col gap-1">
                  {priorIncidents.map((p) => (
                    <li
                      key={p.id}
                      className="rounded-sm border border-neutral-200 px-2 py-1 font-mono text-[11px] text-neutral-700"
                    >
                      <div className="truncate">{p.title}</div>
                      <div className="text-[10px] text-neutral-500">
                        {Math.round(p.distanceM)}m · {p.occurredAt}
                        {p.severity ? ` · ${p.severity}` : ""}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section label="raw payload">
              <button
                type="button"
                onClick={() => setPayloadExpanded((x) => !x)}
                aria-expanded={payloadExpanded}
                className="font-mono text-[10px] uppercase tracking-wider text-neutral-600 underline decoration-dotted hover:text-neutral-900"
              >
                {payloadExpanded ? "collapse" : "expand"}
              </button>
              {payloadExpanded && (
                <pre className="mt-2 max-h-72 overflow-auto rounded-sm border border-neutral-200 bg-neutral-50 p-2 font-mono text-[10px] leading-relaxed text-neutral-700">
                  {payloadJson}
                </pre>
              )}
            </Section>
          </div>
        </>
      )}
    </aside>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-4">
      <div className="mb-1 font-mono text-[9px] uppercase tracking-wider text-neutral-500">
        {label}
      </div>
      {children}
    </section>
  );
}
