import "server-only";
import sharp from "sharp";

export type ValidationStatus = "ok" | "degraded" | "failed";

export interface ValidationResult {
  status: ValidationStatus;
  error: string | null;
}

export interface ValidatedImageFrame extends ValidationResult {
  bytes?: Buffer;
  contentType?: string;
}

export interface CameraValidationInput {
  streamUrl: string;
  streamType: "hls" | "mjpeg" | "iframe" | string;
  source: string;
  stillImageUrl?: string | null;
  hlsUrl?: string | null;
}

const TIMEOUT_MS = 5000;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 1920 * 1080 * 4;
const PIXEL_SAMPLE_SIZE = 48;
const STDDEV_DEAD_THRESHOLD = 4;
const CALTRANS_UNAVAILABLE_WIDTH = 320;
const CALTRANS_UNAVAILABLE_HEIGHT = 240;
const CALTRANS_ALT_UNAVAILABLE_HEIGHT = 260;
const HLS_PLAYLIST_DEPTH_LIMIT = 3;
const HLS_SEGMENTS_TO_PROBE = 3;

interface HttpResourceOptions {
  inspectImage?: boolean;
  rejectCaltransUnavailable?: boolean;
}

interface HlsEntry {
  url: string;
  kind: "playlist" | "segment";
}

/**
 * Validate the exact camera surface the wall should show. Caltrans District 4
 * cameras are served to the wall as refreshed still frames; their HLS playlists
 * are too flaky to be the display contract. A camera is displayable only if the
 * still frame decodes and does not look dead, black, gray, or unavailable.
 */
export async function validateCamera(
  camera: CameraValidationInput,
  fetchImpl: typeof fetch = fetch,
): Promise<ValidationResult> {
  const isCaltrans = camera.source === "caltrans";

  if (isCaltrans) {
    const stillUrl =
      camera.stillImageUrl ??
      (camera.streamType !== "hls" && !camera.streamUrl.includes(".m3u8")
        ? camera.streamUrl
        : null);
    if (!stillUrl) return { status: "failed", error: "missing_still" };

    const still = await validateStream(stillUrl, "mjpeg", camera.source, fetchImpl);
    if (still.status !== "ok") {
      return {
        status: "failed",
        error: `still_${still.error ?? "failed"}`.slice(0, 200),
      };
    }

    return { status: "ok", error: null };
  }

  const result = await validateStream(
    camera.streamUrl,
    camera.streamType,
    camera.source,
    fetchImpl,
    camera.stillImageUrl ?? null,
  );
  return result;
}

/**
 * Validate that a camera's stream URL is actually reachable and serving the
 * expected content. RTSP streams short-circuit to ok (the VPS worker handles
 * those; web app can't probe them). HLS pulls the .m3u8 and checks for the
 * `#EXTM3U` magic header in the first 256 bytes. Still-image cameras also
 * decode a sampled frame so unavailable placeholders and flat frames fail
 * before the wall ever sees them.
 *
 * All calls are bounded by a 5s timeout via AbortSignal.timeout.
 */
export async function validateStream(
  streamUrl: string,
  streamType: "hls" | "mjpeg" | "iframe" | string,
  source: string,
  fetchImpl: typeof fetch = fetch,
  fallbackStillImageUrl?: string | null,
): Promise<ValidationResult> {
  if (!streamUrl) return { status: "failed", error: "missing_url" };

  // RTSP streams can't be validated from the web app — the VPS worker
  // handles those. Mark ok by convention.
  if (streamUrl.startsWith("rtsp://") || streamUrl.startsWith("rtsps://")) {
    return { status: "ok", error: null };
  }

  // The DB stores stream_type='hls' even for sources whose stream_url is
  // actually an iframe embed (e.g. Windy webcams). Treat URLs that don't
  // look like HLS playlists as iframes regardless of the DB stream_type.
  const looksLikeIframe =
    /^https?:\/\/(?:webcams\.windy\.com|player\.day|www\.youtube\.com\/embed\/)/i.test(streamUrl) ||
    streamType === "iframe";
  const looksLikeHls =
    !looksLikeIframe && (streamType === "hls" || streamUrl.includes(".m3u8"));

  async function failOrStill(error: string): Promise<ValidationResult> {
    if (
      source === "caltrans" &&
      fallbackStillImageUrl &&
      fallbackStillImageUrl !== streamUrl
    ) {
      let still: ValidationResult;
      try {
        still = await validateHttpResource(fallbackStillImageUrl, fetchImpl, {
          inspectImage: true,
          rejectCaltransUnavailable: source === "caltrans",
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        still = { status: "failed", error: msg.slice(0, 120) };
      }
      if (still.status === "ok") {
        return { status: "degraded", error: `hls_${error}_still_ok` };
      }
      return {
        status: "failed",
        error: `hls_${error};still_${still.error ?? "failed"}`.slice(0, 200),
      };
    }
    return { status: "failed", error };
  }

  try {
    if (looksLikeHls) {
      const res = await fetchImpl(streamUrl, {
        method: "GET",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: "follow",
      });
      if (!res.ok) return await failOrStill(`http_${res.status}`);
      const text = await res.text();
      const head = text.slice(0, 256);
      if (!head.includes("#EXTM3U")) {
        return await failOrStill("not_m3u8");
      }
      // Tighter check: a playlist is only useful if the actual media segment
      // is reachable. Caltrans playlist.m3u8 files often point to a nested
      // chunklist.m3u8; validate that nested .ts segment, not just the
      // intermediate playlist.
      const segment = await validateHlsSegment(
        text,
        streamUrl,
        fetchImpl,
        0,
      );
      if (segment.status !== "ok") {
        return await failOrStill(segment.error ?? "seg_failed");
      }
      return { status: "ok", error: null };
    }
    return await validateHttpResource(streamUrl, fetchImpl, {
      inspectImage: shouldInspectStillFrame(streamUrl, streamType, source),
      rejectCaltransUnavailable: source === "caltrans",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (looksLikeHls) return await failOrStill(msg.slice(0, 200));
    return { status: "failed", error: msg.slice(0, 200) };
  }
}

async function validateHlsSegment(
  playlistText: string,
  playlistUrl: string,
  fetchImpl: typeof fetch,
  depth: number,
): Promise<ValidationResult> {
  const entries = pickHlsEntries(playlistText, playlistUrl);
  const entry = entries[0] ?? null;
  if (!entry) return { status: "failed", error: "no_segments" };

  if (entry.kind === "playlist") {
    if (depth >= HLS_PLAYLIST_DEPTH_LIMIT) {
      return { status: "failed", error: "playlist_depth" };
    }
    const res = await fetchImpl(entry.url, {
      method: "GET",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "follow",
    });
    if (!res.ok) return { status: "failed", error: `playlist_http_${res.status}` };
    const text = await res.text();
    if (!text.slice(0, 256).includes("#EXTM3U")) {
      return { status: "failed", error: "playlist_not_m3u8" };
    }
    return await validateHlsSegment(text, entry.url, fetchImpl, depth + 1);
  }

  for (const segment of entries
    .filter((e) => e.kind === "segment")
    .slice(0, HLS_SEGMENTS_TO_PROBE)) {
    const segRes = await fetchImpl(segment.url, {
      method: "GET",
      headers: { range: "bytes=0-1023" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "follow",
    });
    if (!segRes.ok) {
      return { status: "failed", error: `seg_http_${segRes.status}` };
    }
  }
  return { status: "ok", error: null };
}

function pickHlsEntries(
  playlistText: string,
  playlistUrl: string,
): HlsEntry[] {
  const entries: HlsEntry[] = [];
  let nextUriIsVariantPlaylist = false;
  for (const raw of playlistText.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#EXT-X-STREAM-INF")) {
      nextUriIsVariantPlaylist = true;
      continue;
    }
    if (line.startsWith("#")) continue;
    try {
      entries.push({
        url: new URL(line, playlistUrl).toString(),
        kind:
          nextUriIsVariantPlaylist || /\.m3u8(?:[?#].*)?$/i.test(line)
            ? "playlist"
            : "segment",
      });
      nextUriIsVariantPlaylist = false;
    } catch {
      return [];
    }
  }
  return entries;
}

function pickFirstHlsEntry(
  playlistText: string,
  playlistUrl: string,
): HlsEntry | null {
  return pickHlsEntries(playlistText, playlistUrl)[0] ?? null;
}

async function validateHttpResource(
  url: string,
  fetchImpl: typeof fetch,
  options: HttpResourceOptions = {},
): Promise<ValidationResult> {
  // iframe / mjpeg / unknown — try HEAD first (cheap), fall back to a
  // Range-GET when the origin rejects HEAD (Windy embeds return 405/403
  // for HEAD but serve GET fine).
  const head = await fetchImpl(url, {
    method: "HEAD",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: "follow",
  });
  if (head.status === 405 || head.status === 403 || head.status === 501) {
    if (options.inspectImage) {
      return await validateImageFrame(url, fetchImpl, options);
    }
    const res = await fetchImpl(url, {
      method: "GET",
      headers: { range: "bytes=0-511" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "follow",
    });
    if (!res.ok) return { status: "failed", error: `http_${res.status}` };
    return { status: "ok", error: null };
  }
  if (!head.ok) return { status: "failed", error: `http_${head.status}` };
  if (options.inspectImage) {
    return await validateImageFrame(url, fetchImpl, options);
  }
  return { status: "ok", error: null };
}

async function validateImageFrame(
  url: string,
  fetchImpl: typeof fetch,
  options: HttpResourceOptions,
): Promise<ValidationResult> {
  const frame = await fetchValidatedImageFrame(url, "caltrans", fetchImpl, options);
  return { status: frame.status, error: frame.error };
}

export async function fetchValidatedImageFrame(
  url: string,
  source: string,
  fetchImpl: typeof fetch = fetch,
  options: HttpResourceOptions = {},
): Promise<ValidatedImageFrame> {
  const res = await fetchImpl(url, {
    method: "GET",
    headers: {
      accept: "image/*,*/*;q=0.8",
      "cache-control": "no-cache",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: "follow",
  });
  if (!res.ok) return { status: "failed", error: `http_${res.status}` };

  const contentLength = Number(res.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
    return { status: "failed", error: "image_too_large" };
  }

  const contentType = res.headers.get("content-type")?.toLowerCase();
  if (
    contentType &&
    !contentType.startsWith("image/") &&
    !contentType.includes("octet-stream")
  ) {
    return {
      status: "failed",
      error: `not_image_${contentType.split(";")[0]}`.slice(0, 120),
    };
  }

  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.byteLength === 0) {
    return { status: "failed", error: "empty_image" };
  }
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    return { status: "failed", error: "image_too_large" };
  }

  const validation = await inspectImageBuffer(bytes, {
    ...options,
    inspectImage: true,
    rejectCaltransUnavailable:
      options.rejectCaltransUnavailable ?? source === "caltrans",
  });
  if (validation.status !== "ok") return validation;

  return {
    status: "ok",
    error: null,
    bytes,
    contentType: contentType ?? "image/jpeg",
  };
}

async function inspectImageBuffer(
  bytes: Buffer,
  options: HttpResourceOptions,
): Promise<ValidationResult> {
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(bytes, {
      failOn: "none",
      limitInputPixels: MAX_IMAGE_PIXELS,
    }).metadata();
  } catch {
    return { status: "failed", error: "image_decode_failed" };
  }

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width === 0 || height === 0) {
    return { status: "failed", error: "image_missing_dimensions" };
  }

  // Caltrans has one exact 320x240 unavailable placeholder. Some real D4
  // stills are 320x260, so those are judged by pixel content below.
  if (
    options.rejectCaltransUnavailable &&
    width === CALTRANS_UNAVAILABLE_WIDTH &&
    height === CALTRANS_UNAVAILABLE_HEIGHT
  ) {
    return { status: "failed", error: "temporarily_unavailable_placeholder" };
  }

  let sample: { data: Buffer; info: sharp.OutputInfo };
  try {
    sample = await sharp(bytes, {
      failOn: "none",
      limitInputPixels: MAX_IMAGE_PIXELS,
    })
      .resize(PIXEL_SAMPLE_SIZE, PIXEL_SAMPLE_SIZE, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch {
    return { status: "failed", error: "image_sample_failed" };
  }

  const stats = frameStats(sample.data, sample.info.channels);
  if (
    options.rejectCaltransUnavailable &&
    width === CALTRANS_UNAVAILABLE_WIDTH &&
    height === CALTRANS_ALT_UNAVAILABLE_HEIGHT &&
    stats.whiteRatio > 0.72 &&
    stats.blueRatio > 0.015
  ) {
    return { status: "failed", error: "temporarily_unavailable_placeholder" };
  }
  if (
    options.rejectCaltransUnavailable &&
    width === CALTRANS_UNAVAILABLE_WIDTH &&
    height === CALTRANS_ALT_UNAVAILABLE_HEIGHT &&
    stats.grayRatio > 0.985
  ) {
    return { status: "failed", error: "gray_unavailable_frame" };
  }
  if (stats.stddev < STDDEV_DEAD_THRESHOLD) {
    return {
      status: "failed",
      error: `${flatFrameTone(stats.mean)}_flat_frame`,
    };
  }

  return { status: "ok", error: null };
}

function shouldInspectStillFrame(
  url: string,
  streamType: string,
  source: string,
): boolean {
  if (source === "caltrans") return true;
  if (streamType === "mjpeg") return /\.(?:jpe?g|png|webp)(?:[?#].*)?$/i.test(url);
  return false;
}

function frameStats(
  data: Buffer,
  channels: number,
): {
  mean: number;
  stddev: number;
  whiteRatio: number;
  blueRatio: number;
  grayRatio: number;
} {
  const step = Math.max(channels, 1);
  const n = Math.max(Math.floor(data.length / step), 1);
  let sum = 0;
  let sumSq = 0;
  let white = 0;
  let blue = 0;
  let gray = 0;
  for (let i = 0; i < data.length; i += step) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? r;
    const b = data[i + 2] ?? r;
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    sum += y;
    sumSq += y * y;
    if (r > 235 && g > 235 && b > 235) white++;
    if (b > 80 && b > r * 1.4 && b > g * 1.4) blue++;
    if (Math.max(r, g, b) - Math.min(r, g, b) < 12) gray++;
  }
  const mean = sum / n;
  const variance = sumSq / n - mean * mean;
  return {
    mean,
    stddev: Math.sqrt(Math.max(variance, 0)),
    whiteRatio: white / n,
    blueRatio: blue / n,
    grayRatio: gray / n,
  };
}

function flatFrameTone(mean: number): "black" | "gray" | "white" {
  if (mean < 24) return "black";
  if (mean > 232) return "white";
  return "gray";
}

/**
 * Extract the first segment URL (.ts or nested .m3u8) from an HLS manifest,
 * resolving relative paths against the playlist URL.
 */
export function pickFirstSegmentUrl(
  playlistText: string,
  playlistUrl: string,
): string | null {
  for (const raw of playlistText.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    try {
      return new URL(line, playlistUrl).toString();
    } catch {
      return null;
    }
  }
  return null;
}
