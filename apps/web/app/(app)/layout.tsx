import { TopNav } from "@/components/app-shell/top-nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <TopNav />
      <div className="flex-1">{children}</div>
    </div>
  );
}
