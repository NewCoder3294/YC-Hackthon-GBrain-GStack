import Link from "next/link";
import { notFound } from "next/navigation";
import { getClipSignedUrl, getIncident } from "../data";
import { ClipThumbnail } from "../clip-thumbnail";
import { LiveMjpeg } from "../live-mjpeg";
import { thumbnailUrl } from "../thumbnail-url";
import { SeverityBadge } from "../severity-badge";
import { EditIncidentForm } from "./edit-form";
import { TagEditor } from "./tag-editor";

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface PageProps {
  params: Promise<{ id: string }>;
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
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <div className="flex items-baseline gap-3">
          <Link
            href="/incidents"
            className="font-mono text-[10px] uppercase tracking-widest text-neutral-500 hover:text-black"
          >
            ← Incidents
          </Link>
          <h1 className="font-mono text-sm uppercase tracking-widest">
            {incident.title}
          </h1>
          <SeverityBadge severity={incident.severity} />
        </div>
        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          {formatTimestamp(incident.createdAt)}
        </span>
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
                {incident.clips.map((c) => (
                  <li
                    key={c.id}
                    className="overflow-hidden border border-neutral-200"
                  >
                    <ClipThumbnail path={c.thumbnailPath} aspect="video" />
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
                ))}
              </ul>
            </div>
          )}
        </main>

        <aside className="overflow-y-auto p-6">
          <EditIncidentForm
            id={incident.id}
            initialTitle={incident.title}
            initialNotes={incident.notes ?? ""}
            initialSeverity={incident.severity}
          />

          {primary && (
            <div className="mt-8 space-y-3 border-t border-neutral-200 pt-6">
              <div>
                <h2 className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                  Tags
                </h2>
                <p className="mt-1 font-mono text-[10px] text-neutral-300">
                  Tags are attached to the primary clip.
                </p>
              </div>
              <TagEditor
                incidentId={incident.id}
                clipId={primary.id}
                initialTags={primary.tags}
              />
            </div>
          )}

          {primary && signedUrl && (
            <div className="mt-8 border-t border-neutral-200 pt-6">
              <a
                href={signedUrl}
                download
                className="font-mono text-[10px] uppercase tracking-widest text-neutral-500 hover:text-black"
              >
                ↓ Download original clip
              </a>
            </div>
          )}
        </aside>
      </div>
    </section>
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
          <LiveMjpeg streamUrl={liveStreamUrl!} />
        ) : (
          <ClipThumbnail
            path={fallbackThumbnail}
            aspect="video"
            label={
              liveStreamType === "hls"
                ? "Clip pending — live HLS feed available on Wall"
                : "Clip unavailable"
            }
            className="!border-0"
          />
        )}
      </div>
      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-neutral-500">
        <span>{cameraLabel}</span>
        <span>
          {showLiveMjpeg
            ? "Live"
            : `${formatTimestamp(startedAt)} · ${formatDuration(durationS)}`}
        </span>
      </div>
    </div>
  );
}
