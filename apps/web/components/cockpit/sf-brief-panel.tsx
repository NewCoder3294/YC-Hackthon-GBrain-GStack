import type { SFBrief } from "@/lib/cockpit/sf-brief";

interface Props {
  brief: SFBrief;
}

function statusLabel(reason: SFBrief["reason"]): string {
  switch (reason) {
    case "no_signal":
      return "no signal · last 1h";
    case "no_api_key":
      return "model offline";
    case "model_error":
      return "synthesis failed";
    default:
      return "last 1h · synthesized";
  }
}

function fallbackBody(brief: SFBrief): string {
  switch (brief.reason) {
    case "no_signal":
      return "No DataSF / 511 incidents in the last hour. The orchestrator polls every 5–15 minutes — if this persists, check the cron status on the live_incident_syncs table.";
    case "no_api_key":
      return `Skipping AI synthesis — ANTHROPIC_API_KEY is not set. ${brief.rowsConsidered} incidents are available for analysis; the brief will populate once the key is configured.`;
    case "model_error":
      return `Model call failed against ${brief.rowsConsidered} incidents. Falling back to the raw feed below until the next refresh.`;
    default:
      return "";
  }
}

export function SFBriefPanel({ brief }: Props) {
  const isFallback = !!brief.reason;
  return (
    <section className="flex flex-col">
      <header className="flex items-center justify-between border-b border-neutral-300 py-3 pl-4 pr-20">
        <h2 className="font-mono text-[11px] uppercase tracking-widest">
          SF Brief
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">
          {statusLabel(brief.reason)}
        </span>
      </header>
      <div className="space-y-3 px-4 py-4 font-mono text-[12px] leading-relaxed">
        <p className={isFallback ? "text-neutral-500" : "text-neutral-800"}>
          {isFallback ? fallbackBody(brief) : brief.text}
        </p>
        <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">
          {brief.rowsConsidered} incidents · claude haiku 4.5
        </p>
      </div>
    </section>
  );
}
