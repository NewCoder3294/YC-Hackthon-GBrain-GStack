import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { parseReportInput, buildSignalEventRow } from "@/lib/report/payload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STORAGE_BUCKET = "citizen-reports";
const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10 MB

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Unexpected error";
}

function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
  return cleaned.length > 0 ? cleaned : "photo";
}

export async function POST(request: NextRequest) {
  const reportId = randomUUID();

  // --- Parse multipart form ---
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data body" },
      { status: 400 },
    );
  }

  const photo = form.get("photo");
  const hasPhoto = photo instanceof File && photo.size > 0;

  if (hasPhoto && photo.size > MAX_PHOTO_BYTES) {
    return NextResponse.json(
      { error: "Photo exceeds the 10 MB limit" },
      { status: 413 },
    );
  }
  if (hasPhoto && !photo.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "Uploaded file must be an image" },
      { status: 415 },
    );
  }

  const photoPath = hasPhoto
    ? `${reportId}/${sanitizeFilename(photo.name || "photo")}`
    : undefined;

  // --- Validate fields ---
  let input;
  try {
    input = parseReportInput({
      description: form.get("description"),
      lat: form.get("lat"),
      lng: form.get("lng"),
      channel: form.get("channel"),
      ...(form.get("contact") ? { contact: form.get("contact") } : {}),
      ...(photoPath ? { photoPath } : {}),
    });
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      const first = err.issues[0];
      return NextResponse.json(
        { error: first ? `${first.path.join(".")}: ${first.message}` : "Invalid report" },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Invalid report" }, { status: 400 });
  }

  // --- Service-role client ---
  let supabase;
  try {
    supabase = createServiceClient();
  } catch (err: unknown) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }

  // --- Upload photo (if any) ---
  let uploaded = false;
  if (hasPhoto && photoPath) {
    const bytes = new Uint8Array(await photo.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(photoPath, bytes, {
        contentType: photo.type || "application/octet-stream",
        upsert: false,
      });
    if (uploadError) {
      return NextResponse.json(
        { error: `Photo upload failed: ${uploadError.message}` },
        { status: 502 },
      );
    }
    uploaded = true;
  }

  // --- Insert the signal event ---
  const row = buildSignalEventRow(input, { id: reportId, now: new Date() });
  const { error: insertError } = await supabase.from("signal_events").insert(row);

  if (insertError) {
    // Roll back the orphaned upload so storage stays consistent with the table.
    if (uploaded && photoPath) {
      await supabase.storage.from(STORAGE_BUCKET).remove([photoPath]);
    }
    return NextResponse.json(
      { error: `Failed to record report: ${insertError.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ reportId }, { status: 201 });
}
