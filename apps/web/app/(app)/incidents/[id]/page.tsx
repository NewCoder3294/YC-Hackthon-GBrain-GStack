import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getClipSignedUrl, getIncident } from "../data";
import { ClipThumbnail } from "../clip-thumbnail";
import { LiveMjpeg } from "../live-mjpeg";
import { LiveStream } from "@/components/cameras/live-stream";
import { thumbnailUrl } from "../thumbnail-url";
import { EditIncidentForm } from "./edit-form";
import { TagEditor } from "./tag-editor";
import { PriorContext } from "./prior-context";

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function formatRelative(iso: string): string {
  const dt = Date.now() - new Date(iso).getTime();
  if (dt < 60_000) return `${Math.max(1, Math.floor(dt / 1000))}s ago`;
  if (dt < 3_600_000) return `${Math.floor(dt / 60_000)}m ago`;
  if (dt < 86_400_000) return `${Math.floor(dt / 3_600_000)}h ago`;
  return `${Math.floor(dt / 86_400_000)}d ago`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const SEVERITY_STRIPE: Record<"low" | "med" | "high", string> = {
  high: "bg-black",
  med: "bg-neutral-700",
  low: "bg-neutral-300",
};

const SEVERITY_BADGE: Record<"low" | "med" | "high", string> = {
  high: "bg-black text-white",
  med: "border border-neutral-700 bg-white text-neutral-800",
  low: "border border-neutral-300 bg-white text-neutral-500",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const incident = await getIncident(id);
  if (!incident) return { title: "Incident not found · WatchDog" };
  return {
    title: `[${incident.severity.toUpperCase()}] ${incident.title} · WatchDog`,
  };
}

export default async function IncidentDetailPage({ params }: PageProps) {
  const { id } = await params;
  const incident = await getIncident(id);
  if (!incident) notFound();

  const primary = incident.primaryClip;
  const signedUrl = primary
    ? await getClipSignedUrl(primary.storagePath)
    : null;

  return (
    <section className="flex h-full flex-col">
      <div className={`h-1 w-full ${SEVERITY_STRIPE[incident.severity]}`} aria-hidden />

      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/incidents"
            className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-neutral-500 hover:text-black"
          >
            ← Incidents
          </Link>
          <span
            className={`shrink-0 px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-widest ${SEVERITY_BADGE[incident.severity]}`}
          >
            {incident.severity}
          </span>
          <h1 className="min-w-0 truncate font-mono text-sm text-black">
            {incident.title}
          </h1>
        </div>
        <div className="flex shrink-0 items-baseline gap-4 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          {primary && (
            <span title={formatTimestamp(primary.startedAt)}>
              <span className="text-neutral-300">Observed</span>{" "}
              <span className="text-black">{formatRelative(primary.startedAt)}</span>
            </span>
          )}
          <span title={formatTimestamp(incident.createdAt)}>
            <span className="text-neutral-300">Logged</span>{" "}
            <span className="text-black">{formatRelative(incident.createdAt)}</span>
          </span>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 gap-0 lg:grid-cols-[1fr_24rem]">
        <main className="border-r border-neutral-200 p-6">
          {primary ? (
            <ClipViewer
              signedUrl={signedUrl}
              startedAt={primary.startedAt}
              durationS={primary.durationS}
              cameraLabel={
                primary.camera
                  ? `${primary.camera.route}${primary.camera.direction ? ` ${primary.camera.direction}` : ""} — ${primary.camera.description}`
                  : "Camera deleted"
              }
              fallbackThumbnail={primary.thumbnailPath}
              liveStreamUrl={primary.camera?.streamUrl ?? null}
              liveStreamType={primary.camera?.streamType ?? null}
            />
          ) : (
            <div className="flex h-64 items-center justify-center border border-dashed border-neutral-200 font-mono text-xs text-neutral-300">
              No clip attached
            </div>
          )}

          {incident.clips.length > 1 && (
            <div className="mt-6">
              <h2 className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                All clips ({incident.clips.length})
              </h2>
              <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {incident.clips.map((c) => {
                  const isPrimary = c.id === primary?.id;
                  return (
                    <li
                      key={c.id}
                      className="overflow-hidden border border-neutral-200"
                    >
                      <div className="relative">
                        <ClipThumbnail path={c.thumbnailPath} aspect="video" />
                        {isPrimary && (
                          <span className="absolute left-1.5 top-1.5 bg-black px-1 py-0.5 font-mono text-[9px] uppercase tracking-widest text-white">
                            Primary
                          </span>
                        )}
                      </div>
                      <div className="p-2 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                        <div className="text-black">
                          {c.camera?.route ?? "—"}{" "}
                          {c.camera?.direction ?? ""}
                        </div>
                        <div className="mt-0.5">
                          {formatTimestamp(c.startedAt)}
                        </div>
                        <div className="mt-0.5">
                          {formatDuration(c.durationS)}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </main>

        <aside className="flex flex-col divide-y divide-neutral-200 overflow-y-auto">
          <Section title="Identity">
            <EditIncidentForm
              id={incident.id}
              initialTitle={incident.title}
              initialNotes={incident.notes ?? ""}
              initialSeverity={incident.severity}
            />
          </Section>

          {primary && (
            <Section
              title="Tags"
              hint="primary clip"
              count={primary.tags.length}
            >
              <TagEditor
                incidentId={incident.id}
                clipId={primary.id}
                initialTags={primary.tags}
              />
            </Section>
          )}

          <Section title="Prior Context" hint="GBrain">
            <PriorContext incidentId={incident.id} />
          </Section>

          {primary && signedUrl && (
            <Section title="Clip">
              <a
                href={signedUrl}
                download
                className="inline-flex items-center gap-1 border border-neutral-200 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-neutral-600 hover:border-black hover:text-black"
              >
                ↓ Download original
              </a>
            </Section>
          )}
        </aside>
      </div>
    </section>
  );
}

function Section({
  title,
  hint,
  count,
  children,
}: {
  title: string;
  hint?: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="px-5 py-5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="font-mono text-[10px] uppercase tracking-widest text-neutral-700">
          {title}
          {hint && (
            <span className="ml-2 text-neutral-300">· {hint}</span>
          )}
        </h2>
        {typeof count === "number" && (
          <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-400">
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function ClipViewer({
  signedUrl,
  startedAt,
  durationS,
  cameraLabel,
  fallbackThumbnail,
  liveStreamUrl,
  liveStreamType,
}: {
  signedUrl: string | null;
  startedAt: string;
  durationS: number;
  cameraLabel: string;
  fallbackThumbnail: string;
  liveStreamUrl: string | null;
  liveStreamType: "hls" | "mjpeg" | null;
}) {
  const showLiveMjpeg =
    !signedUrl && liveStreamType === "mjpeg" && !!liveStreamUrl;
  const showLiveHls =
    !signedUrl && liveStreamType === "hls" && !!liveStreamUrl;

  return (
    <div className="space-y-3">
      <div className="relative aspect-video w-full overflow-hidden border border-neutral-200 bg-black">
        {signedUrl ? (
          <video
            controls
            playsInline
            src={signedUrl}
            poster={fallbackThumbnail ? thumbnailUrl(fallbackThumbnail) : undefined}
            className="h-full w-full"
          />
        ) : showLiveMjpeg ? (
          <LiveMjpeg streamUrl={liveStreamUrl!} badgeLabel="Camera live · clip pending" />
        ) : showLiveHls ? (
          <>
            <LiveStream
              streamUrl={liveStreamUrl!}
              streamType="hls"
              showLiveDot
              className="h-full w-full"
            />
            <span className="pointer-events-none absolute left-2 top-2 border border-white/40 bg-black/60 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-white">
              live · clip pending
            </span>
          </>
        ) : (
          <ClipThumbnail
            path={fallbackThumbnail}
            aspect="video"
            label="Clip unavailable"
            className="!border-0"
          />
        )}
      </div>
      <div className="flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
        <span className="min-w-0 flex-1 truncate" title={cameraLabel}>
          {cameraLabel}
        </span>
        <span className="shrink-0">
          {showLiveMjpeg
            ? "Live camera feed · clip pending"
            : `${formatTimestamp(startedAt)} · ${formatDuration(durationS)}`}
        </span>
      </div>
    </div>
  );
}
