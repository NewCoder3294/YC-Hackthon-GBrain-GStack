/**
 * Structured JSON logger. Matches the shape used elsewhere in the monorepo
 * (`packages/ingestion/src/logger.ts`) so logs aggregate cleanly when the
 * worker runs alongside the dispatcher web app and the ingestion package.
 */

type Level = "debug" | "info" | "warn" | "error";

interface LogFields {
  scope: string;
  msg: string;
  extra?: Record<string, unknown>;
}

function emit(level: Level, fields: LogFields) {
  const stream = level === "error" || level === "warn" ? process.stderr : process.stdout;
  const line = JSON.stringify({
    t: new Date().toISOString(),
    level,
    ...fields,
  });
  stream.write(`${line}\n`);
}

export const log = {
  debug: (fields: LogFields) => {
    if (process.env.LOG_LEVEL === "debug") emit("debug", fields);
  },
  info: (fields: LogFields) => emit("info", fields),
  warn: (fields: LogFields) => emit("warn", fields),
  error: (fields: LogFields) => emit("error", fields),
};
