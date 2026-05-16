import { NextResponse } from "next/server";
import { scanDispatchAudio } from "@/lib/dispatch-audio-scan";

export const runtime = "nodejs";
export const revalidate = 60;

export async function GET() {
  const files = await scanDispatchAudio();
  return NextResponse.json({
    files,
    count: files.length,
    withManifest: files.filter((f) => f.meta).length,
  });
}
