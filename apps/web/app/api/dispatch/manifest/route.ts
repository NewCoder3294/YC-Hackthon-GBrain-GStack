import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadDispatchCatalog } from "@/lib/dispatch-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const files = await loadDispatchCatalog();
  return NextResponse.json({
    files,
    count: files.length,
    withManifest: files.filter((f) => f.meta).length,
  });
}
