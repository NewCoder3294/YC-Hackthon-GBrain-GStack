import { describe, it, expect, vi } from "vitest";
import sharp from "sharp";

vi.mock("server-only", () => ({}));

import { validateCamera, validateStream, pickFirstSegmentUrl } from "./validate";

function mockResponse(opts: {
  status: number;
  body?: string | Buffer;
  headers?: Record<string, string>;
}): Response {
  const body = Buffer.isBuffer(opts.body)
    ? new Uint8Array(opts.body)
    : (opts.body ?? "");
  const init: ResponseInit = { status: opts.status };
  if (opts.headers) init.headers = opts.headers;
  return new Response(body, init);
}

async function jpegFrame(
  width: number,
  height: number,
  pixel: (x: number, y: number) => [number, number, number],
): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y);
      const i = (y * width + x) * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 90 })
    .toBuffer();
}

describe("validateStream", () => {
  it("short-circuits to ok for rtsp:// URLs", async () => {
    const fetchSpy = vi.fn();
    const r = await validateStream(
      "rtsp://camera.local/stream",
      "hls",
      "contributor",
      fetchSpy as unknown as typeof fetch,
    );
    expect(r).toEqual({ status: "ok", error: null });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns ok for HLS with #EXTM3U + reachable segment", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        mockResponse({
          status: 200,
          body: "#EXTM3U\n#EXTINF:10\nseg-1.ts\n",
        }),
      )
      .mockResolvedValueOnce(
        mockResponse({ status: 206, body: "" }),
      );
    const r = await validateStream(
      "https://example.com/stream.m3u8",
      "hls",
      "curated",
      fetchSpy as unknown as typeof fetch,
    );
    expect(r.status).toBe("ok");
    expect(r.error).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[1]![0]).toBe("https://example.com/seg-1.ts");
  });

  it("follows nested HLS playlists before validating the media segment", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        mockResponse({
          status: 200,
          body: "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1280000\nchunklist.m3u8\n",
        }),
      )
      .mockResolvedValueOnce(
        mockResponse({
          status: 200,
          body: "#EXTM3U\n#EXTINF:2\nmedia-1.ts\n",
        }),
      )
      .mockResolvedValueOnce(mockResponse({ status: 206 }));
    const r = await validateStream(
      "https://wzmedia.dot.ca.gov/D4/cam.stream/playlist.m3u8",
      "hls",
      "caltrans",
      fetchSpy as unknown as typeof fetch,
    );
    expect(r.status).toBe("ok");
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(fetchSpy.mock.calls[1]![0]).toBe(
      "https://wzmedia.dot.ca.gov/D4/cam.stream/chunklist.m3u8",
    );
    expect(fetchSpy.mock.calls[2]![0]).toBe(
      "https://wzmedia.dot.ca.gov/D4/cam.stream/media-1.ts",
    );
  });

  it("fails nested HLS playlists when the actual media segment 502s", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        mockResponse({
          status: 200,
          body: "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1280000\nchunklist.m3u8\n",
        }),
      )
      .mockResolvedValueOnce(
        mockResponse({
          status: 200,
          body: "#EXTM3U\n#EXTINF:2\nmedia-1.ts\n",
        }),
      )
      .mockResolvedValueOnce(mockResponse({ status: 502 }));
    const r = await validateStream(
      "https://wzmedia.dot.ca.gov/D4/cam.stream/playlist.m3u8",
      "hls",
      "caltrans",
      fetchSpy as unknown as typeof fetch,
    );
    expect(r).toEqual({ status: "failed", error: "seg_http_502" });
  });

  it("returns failed/seg_http_502 when the manifest is reachable but the segment 502s (Caltrans pattern)", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        mockResponse({
          status: 200,
          body: "#EXTM3U\n#EXTINF:10\nseg-1.ts\n",
        }),
      )
      .mockResolvedValueOnce(mockResponse({ status: 502 }));
    const r = await validateStream(
      "https://wzmedia.example/cam.m3u8",
      "hls",
      "caltrans",
      fetchSpy as unknown as typeof fetch,
    );
    expect(r.status).toBe("failed");
    expect(r.error).toBe("seg_http_502");
  });

  it("fails HLS when a later media segment in the same chunklist 502s", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        mockResponse({
          status: 200,
          body: "#EXTM3U\n#EXTINF:10\nseg-1.ts\n#EXTINF:10\nseg-2.ts\n",
        }),
      )
      .mockResolvedValueOnce(mockResponse({ status: 206 }))
      .mockResolvedValueOnce(mockResponse({ status: 502 }));
    const r = await validateStream(
      "https://wzmedia.example/cam.m3u8",
      "hls",
      "caltrans",
      fetchSpy as unknown as typeof fetch,
    );
    expect(r).toEqual({ status: "failed", error: "seg_http_502" });
    expect(fetchSpy.mock.calls[2]![0]).toBe("https://wzmedia.example/seg-2.ts");
  });

  it("returns degraded when Caltrans HLS fails but the still image works", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(mockResponse({ status: 404 }))
      .mockResolvedValueOnce(mockResponse({ status: 200 }))
      .mockResolvedValueOnce(
        mockResponse({
          status: 200,
          body: await jpegFrame(352, 240, (x, y) => [
            (x * 3) % 256,
            (y * 5) % 256,
            (x + y) % 256,
          ]),
          headers: { "content-type": "image/jpeg" },
        }),
      );
    const r = await validateStream(
      "https://wzmedia.dot.ca.gov/D4/broken.stream/playlist.m3u8",
      "hls",
      "caltrans",
      fetchSpy as unknown as typeof fetch,
      "https://cwwp2.dot.ca.gov/data/d4/cctv/image/cam/cam.jpg",
    );
    expect(r.status).toBe("degraded");
    expect(r.error).toBe("hls_http_404_still_ok");
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(fetchSpy.mock.calls[1]![0]).toBe(
      "https://cwwp2.dot.ca.gov/data/d4/cctv/image/cam/cam.jpg",
    );
  });

  it("rejects Caltrans temporarily unavailable placeholder stills", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(mockResponse({ status: 200 }))
      .mockResolvedValueOnce(
        mockResponse({
          status: 200,
          body: await jpegFrame(320, 240, (x, y) => [
            x % 2 === 0 ? 220 : 80,
            y % 2 === 0 ? 220 : 80,
            120,
          ]),
          headers: { "content-type": "image/jpeg" },
        }),
      );
    const r = await validateStream(
      "https://cwwp2.dot.ca.gov/data/d4/cctv/image/cam/cam.jpg",
      "mjpeg",
      "caltrans",
      fetchSpy as unknown as typeof fetch,
    );
    expect(r).toEqual({
      status: "failed",
      error: "temporarily_unavailable_placeholder",
    });
  });

  it("rejects Caltrans 320x260 temporarily unavailable stills by image content", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(mockResponse({ status: 200 }))
      .mockResolvedValueOnce(
        mockResponse({
          status: 200,
          body: await jpegFrame(320, 260, (x, y) => {
            const inTextBand = y > 100 && y < 130 && x > 50 && x < 270;
            return inTextBand
              ? [0, 0, 140]
              : [255, 255, 255];
          }),
          headers: { "content-type": "image/jpeg" },
        }),
      );
    const r = await validateStream(
      "https://cwwp2.dot.ca.gov/data/d4/cctv/image/cam/cam.jpg",
      "mjpeg",
      "caltrans",
      fetchSpy as unknown as typeof fetch,
    );
    expect(r).toEqual({
      status: "failed",
      error: "temporarily_unavailable_placeholder",
    });
  });

  it("rejects Caltrans 320x260 washed-out grayscale stills", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(mockResponse({ status: 200 }))
      .mockResolvedValueOnce(
        mockResponse({
          status: 200,
          body: await jpegFrame(320, 260, (x, y) => {
            const v = (x * 3 + y * 7) % 180;
            return [v, v, v];
          }),
          headers: { "content-type": "image/jpeg" },
        }),
      );
    const r = await validateStream(
      "https://cwwp2.dot.ca.gov/data/d4/cctv/image/cam/cam.jpg",
      "mjpeg",
      "caltrans",
      fetchSpy as unknown as typeof fetch,
    );
    expect(r).toEqual({ status: "failed", error: "gray_unavailable_frame" });
  });

  it("rejects flat black still frames", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(mockResponse({ status: 200 }))
      .mockResolvedValueOnce(
        mockResponse({
          status: 200,
          body: await jpegFrame(352, 240, () => [0, 0, 0]),
          headers: { "content-type": "image/jpeg" },
        }),
      );
    const r = await validateStream(
      "https://cwwp2.dot.ca.gov/data/d4/cctv/image/cam/cam.jpg",
      "mjpeg",
      "caltrans",
      fetchSpy as unknown as typeof fetch,
    );
    expect(r).toEqual({ status: "failed", error: "black_flat_frame" });
  });

  it("rejects flat gray still frames", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(mockResponse({ status: 200 }))
      .mockResolvedValueOnce(
        mockResponse({
          status: 200,
          body: await jpegFrame(352, 240, () => [128, 128, 128]),
          headers: { "content-type": "image/jpeg" },
        }),
      );
    const r = await validateStream(
      "https://cwwp2.dot.ca.gov/data/d4/cctv/image/cam/cam.jpg",
      "mjpeg",
      "caltrans",
      fetchSpy as unknown as typeof fetch,
    );
    expect(r).toEqual({ status: "failed", error: "gray_flat_frame" });
  });

  it("accepts varied Caltrans still frames", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(mockResponse({ status: 200 }))
      .mockResolvedValueOnce(
        mockResponse({
          status: 200,
          body: await jpegFrame(352, 240, (x, y) => [
            (x * 7) % 256,
            (y * 11) % 256,
            (x + y * 2) % 256,
          ]),
          headers: { "content-type": "image/jpeg" },
        }),
      );
    const r = await validateStream(
      "https://cwwp2.dot.ca.gov/data/d4/cctv/image/cam/cam.jpg",
      "mjpeg",
      "caltrans",
      fetchSpy as unknown as typeof fetch,
    );
    expect(r).toEqual({ status: "ok", error: null });
  });

  it("returns failed/not_m3u8 when HLS response lacks #EXTM3U header", async () => {
    const fetchSpy = vi.fn(async () =>
      mockResponse({
        status: 200,
        body: "<html>404 from CDN</html>",
      }),
    );
    const r = await validateStream(
      "https://example.com/stream.m3u8",
      "hls",
      "curated",
      fetchSpy as unknown as typeof fetch,
    );
    expect(r.status).toBe("failed");
    expect(r.error).toBe("not_m3u8");
  });

  it("returns failed/http_404 when HLS returns 404", async () => {
    const fetchSpy = vi.fn(async () => mockResponse({ status: 404 }));
    const r = await validateStream(
      "https://example.com/missing.m3u8",
      "hls",
      "curated",
      fetchSpy as unknown as typeof fetch,
    );
    expect(r.status).toBe("failed");
    expect(r.error).toBe("http_404");
  });

  it("returns failed with timeout error when fetch throws AbortError", async () => {
    const fetchSpy = vi.fn(async () => {
      throw new Error("The operation was aborted due to timeout");
    });
    const r = await validateStream(
      "https://example.com/slow.m3u8",
      "hls",
      "curated",
      fetchSpy as unknown as typeof fetch,
    );
    expect(r.status).toBe("failed");
    expect(r.error).toMatch(/timeout/i);
  });

  it("returns failed/missing_url for empty stream url", async () => {
    const fetchSpy = vi.fn();
    const r = await validateStream(
      "",
      "hls",
      "curated",
      fetchSpy as unknown as typeof fetch,
    );
    expect(r).toEqual({ status: "failed", error: "missing_url" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns ok for iframe URL with successful HEAD", async () => {
    const fetchSpy = vi.fn(async () => mockResponse({ status: 200 }));
    const r = await validateStream(
      "https://windy.com/webcam/12345",
      "iframe",
      "windy",
      fetchSpy as unknown as typeof fetch,
    );
    expect(r.status).toBe("ok");
    expect(r.error).toBeNull();
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://windy.com/webcam/12345",
      expect.objectContaining({ method: "HEAD" }),
    );
  });

  it("returns failed/http_500 when HEAD returns 500", async () => {
    const fetchSpy = vi.fn(async () => mockResponse({ status: 500 }));
    const r = await validateStream(
      "https://example.com/cam",
      "iframe",
      "windy",
      fetchSpy as unknown as typeof fetch,
    );
    expect(r.status).toBe("failed");
    expect(r.error).toBe("http_500");
  });

  it("falls back to GET when HEAD returns 405 (Windy embed pattern)", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(mockResponse({ status: 405 }))
      .mockResolvedValueOnce(mockResponse({ status: 200 }));
    const r = await validateStream(
      "https://webcams.windy.com/embed/12345/day",
      "iframe",
      "windy",
      fetchSpy as unknown as typeof fetch,
    );
    expect(r.status).toBe("ok");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[0]![1]?.method).toBe("HEAD");
    expect(fetchSpy.mock.calls[1]![1]?.method).toBe("GET");
  });

  it("falls back to GET when HEAD returns 403 (some origins block HEAD)", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(mockResponse({ status: 403 }))
      .mockResolvedValueOnce(mockResponse({ status: 206 }));
    const r = await validateStream(
      "https://example.com/cam",
      "iframe",
      "windy",
      fetchSpy as unknown as typeof fetch,
    );
    expect(r.status).toBe("ok");
  });
});

describe("validateCamera", () => {
  it("accepts Caltrans when the still frame validates", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(mockResponse({ status: 200 }))
      .mockResolvedValueOnce(
        mockResponse({
          status: 200,
          body: await jpegFrame(352, 240, (x, y) => [
            (x * 7) % 256,
            (y * 11) % 256,
            (x + y) % 256,
          ]),
          headers: { "content-type": "image/jpeg" },
        }),
      );

    const r = await validateCamera(
      {
        streamUrl: "https://cwwp2.dot.ca.gov/data/d4/cctv/image/cam/cam.jpg",
        streamType: "mjpeg",
        source: "caltrans",
        hlsUrl: "https://wzmedia.dot.ca.gov/D4/cam.stream/playlist.m3u8",
        stillImageUrl:
          "https://cwwp2.dot.ca.gov/data/d4/cctv/image/cam/cam.jpg",
      },
      fetchSpy as unknown as typeof fetch,
    );

    expect(r).toEqual({ status: "ok", error: null });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://cwwp2.dot.ca.gov/data/d4/cctv/image/cam/cam.jpg",
    );
  });

  it("does not require Caltrans HLS when the still frame validates", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(mockResponse({ status: 200 }))
      .mockResolvedValueOnce(
        mockResponse({
          status: 200,
          body: await jpegFrame(352, 240, (x, y) => [
            (x * 7) % 256,
            (y * 11) % 256,
            (x + y) % 256,
          ]),
          headers: { "content-type": "image/jpeg" },
        }),
      );

    const r = await validateCamera(
      {
        streamUrl: "https://cwwp2.dot.ca.gov/data/d4/cctv/image/cam/cam.jpg",
        streamType: "mjpeg",
        source: "caltrans",
        hlsUrl: "https://wzmedia.dot.ca.gov/D4/cam.stream/playlist.m3u8",
        stillImageUrl:
          "https://cwwp2.dot.ca.gov/data/d4/cctv/image/cam/cam.jpg",
      },
      fetchSpy as unknown as typeof fetch,
    );

    expect(r).toEqual({ status: "ok", error: null });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("fails Caltrans when the still frame is black, gray, or unavailable", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(mockResponse({ status: 200 }))
      .mockResolvedValueOnce(
        mockResponse({
          status: 200,
          body: await jpegFrame(352, 240, () => [128, 128, 128]),
          headers: { "content-type": "image/jpeg" },
        }),
      );

    const r = await validateCamera(
      {
        streamUrl: "https://cwwp2.dot.ca.gov/data/d4/cctv/image/cam/cam.jpg",
        streamType: "mjpeg",
        source: "caltrans",
        hlsUrl: "https://wzmedia.dot.ca.gov/D4/cam.stream/playlist.m3u8",
        stillImageUrl:
          "https://cwwp2.dot.ca.gov/data/d4/cctv/image/cam/cam.jpg",
      },
      fetchSpy as unknown as typeof fetch,
    );

    expect(r).toEqual({ status: "failed", error: "still_gray_flat_frame" });
  });

  it("accepts Caltrans still-only cameras", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(mockResponse({ status: 200 }))
      .mockResolvedValueOnce(
        mockResponse({
          status: 200,
          body: await jpegFrame(352, 240, (x, y) => [
            (x * 7) % 256,
            (y * 11) % 256,
            (x + y) % 256,
          ]),
          headers: { "content-type": "image/jpeg" },
        }),
      );

    const r = await validateCamera(
      {
        streamUrl: "https://cwwp2.dot.ca.gov/data/d4/cctv/image/cam/cam.jpg",
        streamType: "mjpeg",
        source: "caltrans",
        stillImageUrl:
          "https://cwwp2.dot.ca.gov/data/d4/cctv/image/cam/cam.jpg",
      },
      fetchSpy as unknown as typeof fetch,
    );

    expect(r).toEqual({ status: "ok", error: null });
  });

  it("fails Caltrans cameras without a still surface", async () => {
    const fetchSpy = vi.fn();

    const r = await validateCamera(
      {
        streamUrl: "https://wzmedia.dot.ca.gov/D4/cam.stream/playlist.m3u8",
        streamType: "hls",
        source: "caltrans",
        hlsUrl: "https://wzmedia.dot.ca.gov/D4/cam.stream/playlist.m3u8",
      },
      fetchSpy as unknown as typeof fetch,
    );

    expect(r).toEqual({ status: "failed", error: "missing_still" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("pickFirstSegmentUrl", () => {
  it("resolves a relative .ts segment against the playlist URL", () => {
    const u = pickFirstSegmentUrl(
      "#EXTM3U\n#EXTINF:10\nseg-1.ts\n",
      "https://example.com/cam/playlist.m3u8",
    );
    expect(u).toBe("https://example.com/cam/seg-1.ts");
  });

  it("returns null when no segment line exists", () => {
    const u = pickFirstSegmentUrl(
      "#EXTM3U\n#EXT-X-VERSION:3\n",
      "https://example.com/cam/playlist.m3u8",
    );
    expect(u).toBeNull();
  });

  it("skips comment lines", () => {
    const u = pickFirstSegmentUrl(
      "#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXTINF:10\nhttps://cdn.example/seg-1.ts\n",
      "https://example.com/playlist.m3u8",
    );
    expect(u).toBe("https://cdn.example/seg-1.ts");
  });
});
