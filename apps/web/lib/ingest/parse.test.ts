import { describe, it, expect } from "vitest";
import {
  buildStoragePaths,
  extFromMime,
  parseIngestForm,
} from "./parse";
import { INGEST_FIELDS } from "./types";

function makeForm(
  overrides: Partial<Record<keyof typeof INGEST_FIELDS, string>> = {},
  files: { video?: Blob | null; thumbnail?: Blob | null } = {},
): FormData {
  const form = new FormData();
  const defaults: Record<keyof typeof INGEST_FIELDS, string | undefined> = {
    caltransId: "TVD04--001",
    startedAt: "2026-05-16T12:34:56.000Z",
    durationS: "30",
    tags: undefined,
    incidentId: undefined,
    video: undefined,
    thumbnail: undefined,
  };
  const merged = { ...defaults, ...overrides };
  for (const key of Object.keys(INGEST_FIELDS) as (keyof typeof INGEST_FIELDS)[]) {
    const value = merged[key];
    if (value !== undefined) form.set(INGEST_FIELDS[key], value);
  }
  const video = files.video === undefined ? new Blob(["v"], { type: "video/webm" }) : files.video;
  const thumbnail =
    files.thumbnail === undefined ? new Blob(["t"], { type: "image/jpeg" }) : files.thumbnail;
  if (video) form.set(INGEST_FIELDS.video, video);
  if (thumbnail) form.set(INGEST_FIELDS.thumbnail, thumbnail);
  return form;
}

describe("parseIngestForm", () => {
  it("accepts a well-formed payload", () => {
    const result = parseIngestForm(makeForm({ tags: "collision,fire" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.meta.caltransId).toBe("TVD04--001");
      expect(result.meta.durationS).toBe(30);
      expect(result.meta.tags).toEqual(["collision", "fire"]);
      expect(result.meta.incidentId).toBeUndefined();
    }
  });

  it("rejects when video file is missing", () => {
    const result = parseIngestForm(makeForm({}, { video: null }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toMatch(/video and thumbnail/);
    }
  });

  it("rejects when thumbnail file is missing", () => {
    const result = parseIngestForm(makeForm({}, { thumbnail: null }));
    expect(result.ok).toBe(false);
  });

  it("rejects invalid started_at", () => {
    const result = parseIngestForm(makeForm({ startedAt: "not-a-date" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it("rejects negative duration", () => {
    const result = parseIngestForm(makeForm({ durationS: "-1" }));
    expect(result.ok).toBe(false);
  });

  it("rejects duration over one hour", () => {
    const result = parseIngestForm(makeForm({ durationS: "3601" }));
    expect(result.ok).toBe(false);
  });

  it("rejects malformed incident_id", () => {
    const result = parseIngestForm(makeForm({ incidentId: "not-a-uuid" }));
    expect(result.ok).toBe(false);
  });

  it("treats empty tags as an empty list", () => {
    const result = parseIngestForm(makeForm({ tags: "" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.meta.tags).toEqual([]);
  });

  it("trims whitespace in tags and drops empties", () => {
    const result = parseIngestForm(makeForm({ tags: " a , , b " }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.meta.tags).toEqual(["a", "b"]);
  });
});

describe("extFromMime", () => {
  it.each([
    ["video/webm", "webm", "webm"],
    ["video/mp4", "webm", "mp4"],
    ["image/jpeg", "jpg", "jpg"],
    ["image/png", "jpg", "png"],
    ["IMAGE/JPEG", "jpg", "jpg"],
    ["", "webm", "webm"],
    ["application/octet-stream", "webm", "webm"],
  ])("mime=%s fallback=%s -> %s", (mime, fallback, expected) => {
    expect(extFromMime(mime, fallback)).toBe(expected);
  });
});

describe("buildStoragePaths", () => {
  it("composes {cameraId}/{clipId}.{ext} for both buckets", () => {
    const paths = buildStoragePaths(
      "cam-uuid",
      "clip-uuid",
      "video/mp4",
      "image/png",
    );
    expect(paths.storagePath).toBe("cam-uuid/clip-uuid.mp4");
    expect(paths.thumbnailPath).toBe("cam-uuid/clip-uuid.png");
  });

  it("falls back to webm and jpg for unknown mimes", () => {
    const paths = buildStoragePaths("cam", "clip", "", "");
    expect(paths.storagePath).toBe("cam/clip.webm");
    expect(paths.thumbnailPath).toBe("cam/clip.jpg");
  });
});
