import Link from "next/link";
import { notFound } from "next/navigation";
import { getClipSignedUrl, getIncident, thumbnailUrl } from "../data";
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
                    {c.thumbnailPath ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={thumbnailUrl(c.thumbnailPath)}
                        alt=""
                        className="aspect-video w-full object-cover grayscale"
                      />
                    ) : (
                      <div className="aspect-video w-full bg-neutral-50" />
                    )}
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
}: {
  signedUrl: string | null;
  startedAt: string;
  durationS: number;
  cameraLabel: string;
  fallbackThumbnail: string;
}) {
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
        ) : fallbackThumbnail ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={thumbnailUrl(fallbackThumbnail)}
            alt=""
            className="h-full w-full object-cover grayscale"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-mono text-xs uppercase tracking-widest text-neutral-500">
            Clip unavailable
          </div>
        )}
      </div>
      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-neutral-500">
        <span>{cameraLabel}</span>
        <span>
          {formatTimestamp(startedAt)} · {formatDuration(durationS)}
        </span>
      </div>
    </div>
  );
}
