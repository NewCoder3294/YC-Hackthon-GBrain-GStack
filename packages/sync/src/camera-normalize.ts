export function routePrefix(raw: string): string {
  const trimmed = raw.trim();
  if (/^[A-Z]+-?\d+/i.test(trimmed)) return trimmed.toUpperCase();
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return trimmed;
  const interstates = new Set([
    5, 80, 205, 238, 280, 380, 405, 505, 580, 680, 780, 880, 980,
  ]);
  if (interstates.has(n)) return `I-${n}`;
  if (n === 101 || n === 50 || n === 395) return `US-${n}`;
  return `SR-${n}`;
}

export function normalizeDirection(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim().toUpperCase();
  if (v.startsWith("N")) return "N";
  if (v.startsWith("S")) return "S";
  if (v.startsWith("E")) return "E";
  if (v.startsWith("W")) return "W";
  return v.slice(0, 1) || null;
}

export function isTruthyInService(v: string | boolean | null | undefined): boolean {
  if (typeof v === "boolean") return v;
  if (!v) return false;
  return v.trim().toLowerCase() === "true";
}

export function caltransExternalId(index: string | number): string {
  const raw = String(index).trim();
  return /^\d+$/.test(raw) ? `D4-${raw}` : raw;
}
