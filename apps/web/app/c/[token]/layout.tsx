import { notFound } from "next/navigation";
import { cache } from "react";
import { adminClient } from "@/lib/supabase/admin";

export const getContributor = cache(async (token: string) => {
  const supabase = adminClient();
  const { data } = await supabase
    .from("contributors")
    .select("id, name, contact_phone, verified_at, removed_at, created_at")
    .eq("token", token)
    .maybeSingle();
  if (!data || data.removed_at) return null;
  return data;
});

export default async function ContributorLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const contributor = await getContributor(token);
  if (!contributor) notFound();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-12 items-center justify-between border-b border-neutral-200 px-4">
        <span className="font-mono text-xs uppercase tracking-widest">
          WatchDog · {contributor.name}
        </span>
        <span className="font-mono text-[10px] text-neutral-500">
          {contributor.verified_at ? "verified" : "unverified"}
        </span>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
