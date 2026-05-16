interface Cam {
  id: string;
  caltrans_id: string;
  description: string;
  lat: number;
  lng: number;
  stream_type: "hls" | "mjpeg";
  is_active: boolean;
}

export function CameraList({ cameras }: { cameras: Cam[] }) {
  if (cameras.length === 0) {
    return <p className="font-mono text-xs text-neutral-500">No cameras registered.</p>;
  }
  return (
    <ul className="divide-y divide-neutral-200 border border-neutral-200">
      {cameras.map((c) => (
        <li key={c.id} className="flex items-center justify-between p-3">
          <div className="min-w-0">
            <p className="truncate font-mono text-xs">{c.description}</p>
            <p className="font-mono text-[10px] text-neutral-500">
              {c.lat.toFixed(4)}, {c.lng.toFixed(4)} · {c.stream_type}
            </p>
          </div>
          <span
            className={`font-mono text-[10px] uppercase tracking-widest ${c.is_active ? "text-black" : "text-neutral-400"}`}
          >
            {c.is_active ? "Active" : "Paused"}
          </span>
        </li>
      ))}
    </ul>
  );
}
