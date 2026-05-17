import Link from "next/link";

const DATA_SOURCES = [
  { label: "Caltrans CCTV", href: "https://cwwp2.dot.ca.gov/data/d4/cctv/cctvStatusD04.json" },
  { label: "SF 311", href: "https://data.sfgov.org/" },
  { label: "SFPD CAD", href: "https://data.sfgov.org/Public-Safety/Police-Department-Calls-for-Service/hz9m-tj6z" },
  { label: "511.org", href: "https://511.org/open-data" },
  { label: "Mission Local", href: "https://missionlocal.org/" },
  { label: "SF Standard", href: "https://sfstandard.com/" },
];

/**
 * Footer for public-facing pages. Cites every external data source the
 * dashboard pulls from, plus links to /about and /contribute so a curious
 * SF resident can figure out what they're looking at and how to participate.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-neutral-200 bg-white px-4 py-6 text-neutral-500">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-700">
            WatchDog · open-source SF intelligence
          </p>
          <p className="max-w-md font-mono text-[10px] leading-relaxed">
            A read-only OSINT view stitched together from public San Francisco
            data feeds. Not affiliated with SFPD, SFFD, or the City of San
            Francisco.
          </p>
        </div>

        <nav className="grid grid-cols-2 gap-x-8 gap-y-1 font-mono text-[10px] uppercase tracking-widest sm:grid-cols-4">
          <Link href="/about" className="hover:text-black">About</Link>
          <Link href="/map" className="hover:text-black">Map</Link>
          <Link href="/live" className="hover:text-black">Live</Link>
          <Link href="/feed" className="hover:text-black">Feed</Link>
          <Link href="/alerts" className="hover:text-black">Email alerts</Link>
          <Link href="/contribute" className="hover:text-black">Contribute</Link>
          <Link href="/privacy" className="hover:text-black">Privacy</Link>
          <Link href="/login" className="hover:text-black">Sign in</Link>
        </nav>
      </div>

      <div className="mx-auto mt-4 max-w-6xl border-t border-neutral-100 pt-3">
        <p className="font-mono text-[9px] uppercase tracking-widest text-neutral-400">
          Data sources
        </p>
        <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px]">
          {DATA_SOURCES.map((s) => (
            <li key={s.href}>
              <a
                href={s.href}
                target="_blank"
                rel="noreferrer noopener"
                className="text-neutral-500 hover:text-black"
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
