import { z } from "zod";
import { INGEST_FIELDS } from "./types";

export const ingestMetaSchema = z.object({
  caltransId: z.string().min(1),
  startedAt: z.string().datetime({ offset: true }),
  durationS: z.coerce.number().int().positive().max(60 * 60),
  incidentId: z.string().uuid().optional(),
  tags: z
    .string()
    .optional()
    .transform((s) =>
      s
        ? s
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
    ),
});

export type IngestMeta = z.infer<typeof ingestMetaSchema>;

export interface ParseResult {
  ok: true;
  meta: IngestMeta;
  video: Blob;
  thumbnail: Blob;
}

export interface ParseError {
  ok: false;
  status: number;
  error: string;
}

export function parseIngestForm(form: FormData): ParseResult | ParseError {
  const video = form.get(INGEST_FIELDS.video);
  const thumbnail = form.get(INGEST_FIELDS.thumbnail);
  if (!(video instanceof Blob) || !(thumbnail instanceof Blob)) {
    return {
      ok: false,
      status: 400,
      error: "video and thumbnail files required",
    };
  }

  const parsed = ingestMetaSchema.safeParse({
    caltransId: form.get(INGEST_FIELDS.caltransId),
    startedAt: form.get(INGEST_FIELDS.startedAt),
    durationS: form.get(INGEST_FIELDS.durationS),
    incidentId: form.get(INGEST_FIELDS.incidentId) || undefined,
    tags: form.get(INGEST_FIELDS.tags) || undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      error: parsed.error.issues[0]?.message ?? "invalid payload",
    };
  }

  return { ok: true, meta: parsed.data, video, thumbnail };
}

const MIME_EXT: Record<string, string> = {
  "video/webm": "webm",
  "video/mp4": "mp4",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function extFromMime(mime: string, fallback: string): string {
  if (!mime) return fallback;
  return MIME_EXT[mime.toLowerCase()] ?? fallback;
}

export function buildStoragePaths(
  cameraId: string,
  clipId: string,
  videoMime: string,
  thumbnailMime: string,
): { storagePath: string; thumbnailPath: string } {
  return {
    storagePath: `${cameraId}/${clipId}.${extFromMime(videoMime, "webm")}`,
    thumbnailPath: `${cameraId}/${clipId}.${extFromMime(thumbnailMime, "jpg")}`,
  };
}
