import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/service";
import { buildStoragePaths, parseIngestForm } from "@/lib/ingest/parse";
import type { IngestResponse } from "@/lib/ingest/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIDEO_BUCKET = "clips";
const THUMBNAIL_BUCKET = "thumbnails";

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!env.INGEST_SECRET || auth !== `Bearer ${env.INGEST_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "expected multipart/form-data" },
      { status: 400 },
    );
  }

  const parsed = parseIngestForm(form);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }
  const { meta, video, thumbnail } = parsed;

  const supabase = createServiceClient();

  const { data: camera, error: cameraErr } = await supabase
    .from("cameras")
    .select("id")
    .eq("caltrans_id", meta.caltransId)
    .maybeSingle();
  if (cameraErr) {
    return NextResponse.json({ error: cameraErr.message }, { status: 500 });
  }
  if (!camera) {
    return NextResponse.json(
      { error: `unknown caltrans_id: ${meta.caltransId}` },
      { status: 404 },
    );
  }

  const clipId = crypto.randomUUID();
  const { storagePath, thumbnailPath } = buildStoragePaths(
    camera.id,
    clipId,
    video.type,
    thumbnail.type,
  );

  const videoUpload = await supabase.storage
    .from(VIDEO_BUCKET)
    .upload(storagePath, video, {
      contentType: video.type || "video/webm",
      upsert: false,
    });
  if (videoUpload.error) {
    return NextResponse.json(
      { error: `video upload: ${videoUpload.error.message}` },
      { status: 500 },
    );
  }

  const thumbUpload = await supabase.storage
    .from(THUMBNAIL_BUCKET)
    .upload(thumbnailPath, thumbnail, {
      contentType: thumbnail.type || "image/jpeg",
      upsert: false,
    });
  if (thumbUpload.error) {
    await supabase.storage.from(VIDEO_BUCKET).remove([storagePath]);
    return NextResponse.json(
      { error: `thumbnail upload: ${thumbUpload.error.message}` },
      { status: 500 },
    );
  }

  const { error: insertErr } = await supabase.from("clips").insert({
    id: clipId,
    camera_id: camera.id,
    incident_id: meta.incidentId ?? null,
    started_at: meta.startedAt,
    duration_s: meta.durationS,
    storage_path: storagePath,
    thumbnail_path: thumbnailPath,
  });
  if (insertErr) {
    await supabase.storage.from(VIDEO_BUCKET).remove([storagePath]);
    await supabase.storage.from(THUMBNAIL_BUCKET).remove([thumbnailPath]);
    return NextResponse.json(
      { error: `db insert: ${insertErr.message}` },
      { status: 500 },
    );
  }

  if (meta.tags.length > 0) {
    const rows = meta.tags.map((tag) => ({ clip_id: clipId, tag }));
    const tagErr = await supabase.from("clip_tags").insert(rows);
    if (tagErr.error) {
      console.warn(`clip ${clipId} tag insert failed: ${tagErr.error.message}`);
    }
  }

  const body: IngestResponse = { clipId, storagePath, thumbnailPath };
  return NextResponse.json(body, { status: 201 });
}
