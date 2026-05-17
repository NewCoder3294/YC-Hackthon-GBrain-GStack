import { notFound } from "next/navigation";
import { getContributor } from "./_contributor";

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
