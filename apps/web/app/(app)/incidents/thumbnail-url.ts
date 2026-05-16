export function thumbnailUrl(thumbnailPath: string): string {
  if (!thumbnailPath) return "";
  if (thumbnailPath.startsWith("http")) return thumbnailPath;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  if (!base) return "";
  return `${base}/storage/v1/object/public/thumbnails/${thumbnailPath}`;
}
