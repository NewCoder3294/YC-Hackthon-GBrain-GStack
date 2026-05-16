import type { Metadata } from "next";
import { ReportForm } from "./report-form";

export const metadata: Metadata = {
  title: "Report an Incident",
  description: "Anonymously report a traffic incident to CalTrans WatchDog",
};

export default function ReportPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-6 px-5 py-10">
      <header className="space-y-1">
        <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          CalTrans WatchDog
        </p>
        <h1 className="font-mono text-lg tracking-tight">Report an incident</h1>
        <p className="font-mono text-xs leading-relaxed text-neutral-500">
          Anonymous. No login required. Your location and an optional photo help
          responders act faster.
        </p>
      </header>
      <ReportForm />
    </main>
  );
}
