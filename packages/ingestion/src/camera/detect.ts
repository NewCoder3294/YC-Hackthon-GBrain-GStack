/**
 * Object detection over a grabbed JPEG frame (TRD §3.1 — the camera
 * producer only emits a signal_event when it actually sees people or
 * vehicles, so the correlator isn't flooded with empty frames).
 *
 * Uses transformers.js (`@huggingface/transformers`) running the small
 * YOLOS model fully on-device — no API key, no network at inference
 * time once the model is cached. The pipeline is a lazy singleton: the
 * model loads on first detect call and is reused for the worker's life.
 */

import { pipeline, RawImage } from "@huggingface/transformers";

/**
 * Minimal structural type for the callable transformers.js returns for
 * "object-detection". We don't reference the library's `AllTasks` union
 * directly — instantiating it produces a "union too complex" TS error
 * (TS2590). This is the only shape we use: call with an image, get back
 * an array of `{ label, score, box }` (validated at the boundary anyway).
 */
type ObjectDetector = (
  image: RawImage,
  options: { threshold: number; percentage: boolean },
) => Promise<unknown>;

/** Small, fast COCO object detector. Kept as a constant per the spec. */
export const DETECTION_MODEL_ID = "Xenova/yolos-tiny";
export const DEFAULT_DETECTION_THRESHOLD = 0.5;

/**
 * COCO labels we care about: people and road vehicles. Everything else
 * (traffic light, bench, etc.) is dropped so signal_events stay signal.
 */
export const RELEVANT_LABELS = [
  "person",
  "bicycle",
  "car",
  "motorcycle",
  "bus",
  "truck",
] as const;

export type RelevantLabel = (typeof RELEVANT_LABELS)[number];

const RELEVANT_LABEL_SET: ReadonlySet<string> = new Set(RELEVANT_LABELS);

export interface DetectionBox {
  readonly xmin: number;
  readonly ymin: number;
  readonly xmax: number;
  readonly ymax: number;
}

export interface Detection {
  readonly label: RelevantLabel;
  readonly score: number;
  readonly box: DetectionBox;
}

/** transformers.js object-detection output entry (loosely typed at the boundary). */
const detectorOutputSchemaHint = {
  label: "",
  score: 0,
  box: { xmin: 0, ymin: 0, xmax: 0, ymax: 0 },
} as const;
export type RawDetectorEntry = typeof detectorOutputSchemaHint;

let pipelinePromise: Promise<ObjectDetector> | null = null;

/** Lazy singleton — first call downloads/loads the model, then it's reused. */
async function getDetector(): Promise<ObjectDetector> {
  if (pipelinePromise === null) {
    // The pipeline object is callable at runtime; the library's static
    // return type is the giant AllTasks union, so we narrow via unknown.
    pipelinePromise = pipeline(
      "object-detection",
      DETECTION_MODEL_ID,
    ) as unknown as Promise<ObjectDetector>;
  }
  return pipelinePromise;
}

/** Injectable detector for tests (avoids loading the real model). */
export type DetectorFn = (
  image: RawImage,
  options: { threshold: number; percentage: boolean },
) => Promise<unknown>;

export interface DetectDeps {
  readonly detector?: DetectorFn;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Narrow one untrusted detector entry to a typed {@link Detection} or null. */
function toDetection(entry: unknown): Detection | null {
  if (typeof entry !== "object" || entry === null) return null;
  const e = entry as Record<string, unknown>;

  const label = e["label"];
  const score = e["score"];
  const box = e["box"];
  if (typeof label !== "string" || !RELEVANT_LABEL_SET.has(label)) return null;
  if (!isFiniteNumber(score)) return null;
  if (typeof box !== "object" || box === null) return null;

  const b = box as Record<string, unknown>;
  const xmin = b["xmin"];
  const ymin = b["ymin"];
  const xmax = b["xmax"];
  const ymax = b["ymax"];
  if (
    !isFiniteNumber(xmin) ||
    !isFiniteNumber(ymin) ||
    !isFiniteNumber(xmax) ||
    !isFiniteNumber(ymax)
  ) {
    return null;
  }

  return {
    label: label as RelevantLabel,
    score,
    box: { xmin, ymin, xmax, ymax },
  };
}

/**
 * Detect people/vehicles in a JPEG frame. Returns only relevant-label
 * detections at or above `threshold`, sorted by score descending so
 * callers can take `[0].score` as the frame confidence.
 *
 * transformers.js needs a decoded image, not raw JPEG bytes — we wrap
 * the buffer in a Blob and decode via `RawImage.fromBlob`.
 */
export async function detectObjects(
  jpeg: Buffer,
  threshold: number = DEFAULT_DETECTION_THRESHOLD,
  deps: DetectDeps = {},
): Promise<Detection[]> {
  if (jpeg.length === 0) {
    throw new Error("detectObjects: empty frame buffer");
  }

  const detector = deps.detector ?? (await wrapSingleton());
  const image = await RawImage.fromBlob(
    new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }),
  );

  const raw = await detector(image, { threshold, percentage: true });
  const list: unknown[] = Array.isArray(raw) ? raw : [];

  const detections: Detection[] = [];
  for (const entry of list) {
    const d = toDetection(entry);
    if (d !== null && d.score >= threshold) detections.push(d);
  }

  return detections.sort((a, b) => b.score - a.score);
}

/** Adapts the singleton pipeline to the {@link DetectorFn} signature. */
async function wrapSingleton(): Promise<DetectorFn> {
  const detect = await getDetector();
  return (image, options) =>
    detect(image, options) as unknown as Promise<unknown>;
}
