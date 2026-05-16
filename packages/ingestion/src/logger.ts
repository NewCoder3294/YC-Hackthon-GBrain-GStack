/**
 * Minimal structured logger for the ingestion workers.
 *
 * Workers are long-running CLI processes, so stdout/stderr IS the
 * interface — but we centralize it here (one sanctioned place) rather
 * than scattering raw console.log calls through the producers.
 */

type Level = "info" | "warn" | "error";

function emit(level: Level, scope: string, msg: string, extra?: unknown): void {
  const line = JSON.stringify({
    t: new Date().toISOString(),
    level,
    scope,
    msg,
    ...(extra !== undefined ? { extra } : {}),
  });
  const stream = level === "error" ? process.stderr : process.stdout;
  stream.write(`${line}\n`);
}

export interface Logger {
  info(msg: string, extra?: unknown): void;
  warn(msg: string, extra?: unknown): void;
  error(msg: string, extra?: unknown): void;
}

export function createLogger(scope: string): Logger {
  return {
    info: (msg, extra) => emit("info", scope, msg, extra),
    warn: (msg, extra) => emit("warn", scope, msg, extra),
    error: (msg, extra) => emit("error", scope, msg, extra),
  };
}
