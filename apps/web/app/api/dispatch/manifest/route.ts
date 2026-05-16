import { NextResponse } from "next/server";
import { loadDispatchCatalog } from "@/lib/dispatch-catalog";

export const runtime = "nodejs";
export const revalidate = 60;

export async function GET() {
  const files = await loadDispatchCatalog();
  return NextResponse.json({
    files,
    count: files.length,
    withManifest: files.filter((f) => f.meta).length,
  });
}
