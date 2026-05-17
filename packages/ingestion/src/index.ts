/**
 * @caltrans/ingestion — Hari's Layer-1 multi-modal ingestion (TRD §6).
 *
 * Shared contract surface only. Producer entrypoints live under
 * src/camera/ (Caltrans detector) and src/calls/ (911 generator) and
 * are run via package scripts, not imported from here.
 */

export {
  SOURCE_TYPES,
  signalEventInputSchema,
  buildSignalEventRows,
  insertSignalEvents,
  type SourceType,
  type SignalEventInput,
} from "./signal-events";
export { createLogger, type Logger } from "./logger";
export { dbFromEnv } from "./db";
