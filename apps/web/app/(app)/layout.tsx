import { TopNav } from "@/components/app-shell/top-nav";
import { SiteFooter } from "@/components/app-shell/site-footer";

// Auth gating happens in middleware.ts — the public allowlist (/map, /live,
// /feed, /about) is enforced there. Everything else here is auth-required.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <TopNav />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}
