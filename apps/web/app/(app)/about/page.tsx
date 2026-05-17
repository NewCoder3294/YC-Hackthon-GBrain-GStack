import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About · WatchDog",
  description:
    "WatchDog is an open-source OSINT dashboard for San Francisco. We stitch public data — Caltrans cameras, SFPD/SFFD CAD, 311, neighborhood news — into one view so residents can see what's happening across the city in real time.",
};

const DATA_SOURCES = [
  {
    name: "Caltrans CCTV (District 4)",
    desc: "Live traffic cameras across the Bay Area. Publicly posted by Caltrans.",
    refresh: "every 30s (HLS) · every 5s (MJPEG)",
    href: "https://cwwp2.dot.ca.gov/data/d4/cctv/cctvStatusD04.json",
  },
  {
    name: "SFPD Calls for Service",
    desc: "Dispatched police calls from SFPD's CAD system. Updated daily on DataSF.",
    refresh: "every 5 minutes",
    href: "https://data.sfgov.org/Public-Safety/Police-Department-Calls-for-Service/hz9m-tj6z",
  },
  {
    name: "SFFD / EMS Calls",
    desc: "Fire and emergency medical response data published by SFFD on DataSF.",
    refresh: "every 5 minutes",
    href: "https://data.sfgov.org/Public-Safety/Fire-Department-Calls-for-Service/nuek-vuh3",
  },
  {
    name: "SF 311 Service Requests",
    desc: "Non-emergency reports filed by residents and resolved by city departments.",
    refresh: "every 5 minutes",
    href: "https://data.sfgov.org/City-Infrastructure/311-Cases/vw6y-z8j6",
  },
  {
    name: "511 Bay Area Traffic & Transit",
    desc: "Incidents and disruptions on Bay Area highways and transit lines.",
    refresh: "every 5 minutes",
    href: "https://511.org/open-data",
  },
  {
    name: "SF Neighborhood News",
    desc: "Public reporting from Mission Local, SF Standard, SFPD press releases.",
    refresh: "as published",
    href: "https://missionlocal.org/",
  },
];

export default function AboutPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-8 px-4 py-10 font-sans text-neutral-800">
      <header className="space-y-3 border-b border-neutral-200 pb-6">
        <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          About
        </p>
        <h1 className="font-mono text-2xl uppercase tracking-tight">
          A read-only window into San Francisco's safety data.
        </h1>
        <p className="text-sm leading-relaxed text-neutral-600">
          WatchDog is an open-source intelligence (OSINT) dashboard that
          stitches together public data feeds — police dispatch, fire calls,
          311 reports, traffic incidents, neighborhood news, and Caltrans
          traffic cameras — into one map and timeline. Built for SF residents
          who want a transparent view of what the city is responding to in
          real time.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="font-mono text-[10px] uppercase tracking-widest text-neutral-700">
          What it shows
        </h2>
        <ul className="space-y-2 text-sm leading-relaxed">
          <li>
            <Link href="/map" className="font-medium text-black underline-offset-2 hover:underline">Map</Link> —
            every live incident plotted geographically, plus 700+ Caltrans
            cameras you can tap to view.
          </li>
          <li>
            <Link href="/live" className="font-medium text-black underline-offset-2 hover:underline">Live</Link> —
            a chronological table of every incoming call/report, filterable
            by source, severity, and neighborhood.
          </li>
          <li>
            <Link href="/feed" className="font-medium text-black underline-offset-2 hover:underline">Feed</Link> —
            recent neighborhood news coverage of violent crime in SF, ranked
            by severity and recency.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-mono text-[10px] uppercase tracking-widest text-neutral-700">
          What it doesn't do
        </h2>
        <ul className="space-y-2 text-sm leading-relaxed text-neutral-700">
          <li>
            <span className="font-medium text-black">No facial recognition.</span>{" "}
            California AB 1215 prohibits it on body-worn cameras, and we
            don't run it on anything else either.
          </li>
          <li>
            <span className="font-medium text-black">No predictive policing of people.</span>{" "}
            We don't score individuals, gangs, or demographic groups. We
            surface incidents tied to places, in real time.
          </li>
          <li>
            <span className="font-medium text-black">No private data.</span>{" "}
            Every source listed below is already public. We just put it in
            one place.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-mono text-[10px] uppercase tracking-widest text-neutral-700">
          Data sources
        </h2>
        <ul className="space-y-3">
          {DATA_SOURCES.map((s) => (
            <li
              key={s.href}
              className="border border-neutral-200 p-3 transition-colors hover:border-neutral-400"
            >
              <a
                href={s.href}
                target="_blank"
                rel="noreferrer noopener"
                className="font-mono text-[12px] font-medium text-black hover:underline"
              >
                {s.name} →
              </a>
              <p className="mt-1 text-sm text-neutral-600">{s.desc}</p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-neutral-400">
                refresh · {s.refresh}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-mono text-[10px] uppercase tracking-widest text-neutral-700">
          Got a camera? Contribute one.
        </h2>
        <p className="text-sm leading-relaxed">
          If you run a small business or own a home camera and want to
          opt in to share access with verified responders on a policy
          you control,{" "}
          <Link href="/contribute" className="font-medium text-black underline-offset-2 hover:underline">
            join the contributor waitlist
          </Link>
          . You define the geofence, time windows, and warrant requirements.
          Every query against your camera shows up in your dashboard with
          full provenance.
        </p>
      </section>

      <section className="space-y-3 border-t border-neutral-200 pt-6">
        <h2 className="font-mono text-[10px] uppercase tracking-widest text-neutral-700">
          Open source
        </h2>
        <p className="text-sm leading-relaxed text-neutral-600">
          WatchDog is built in the open. The code is on{" "}
          <a
            href="https://github.com/NewCoder3294/YC-Hackthon-GBrain-GStack"
            target="_blank"
            rel="noreferrer noopener"
            className="font-medium text-black underline-offset-2 hover:underline"
          >
            GitHub
          </a>
          . Bug reports, PRs, and new data sources welcome.
        </p>
      </section>
    </article>
  );
}
