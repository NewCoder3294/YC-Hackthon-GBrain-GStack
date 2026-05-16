import { describe, it, expect, vi } from "vitest";
import {
  summarizeTranscript,
  fallbackSummary,
  extractKeywords,
  DEFAULT_MODEL,
  type AnthropicLike,
  type SummarizeDeps,
} from "./summarize";

const TRANSCRIPT =
  "Shots fired near Innes and Earl, a dark sedan sped off, there's a guy " +
  "down by the corner store, please hurry. He's bleeding badly.";

// Silent logger so test output stays clean while still exercising warn paths.
const silentLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe("extractKeywords / fallbackSummary", () => {
  it("pulls deterministic keywords from a transcript", () => {
    const kw = extractKeywords(TRANSCRIPT);
    expect(kw).toContain("shots fired");
    expect(kw).toContain("vehicle");
    expect(kw).toContain("medical");
  });

  it("fallback clips long transcripts and marks fromModel=false", () => {
    const long = "x ".repeat(200);
    const fb = fallbackSummary(long);
    expect(fb.fromModel).toBe(false);
    expect(fb.summary.length).toBeLessThanOrEqual(121); // 120 + ellipsis
    expect(fb.summary.endsWith("…")).toBe(true);
  });
});

describe("summarizeTranscript fallback (no live API)", () => {
  it("falls back when no API key and no client is provided", async () => {
    const deps: SummarizeDeps = {
      apiKey: "",
      logger: silentLogger,
      client: undefined,
    };
    const out = await summarizeTranscript(TRANSCRIPT, deps);
    expect(out.fromModel).toBe(false);
    expect(out.summary).toContain("Shots fired");
    expect(out.keywords).toContain("shots fired");
    expect(silentLogger.warn).toHaveBeenCalled();
  });

  it("falls back (never throws) when the client throws", async () => {
    const throwingClient: AnthropicLike = {
      messages: {
        create: vi.fn().mockRejectedValue(new Error("429 rate limited")),
      },
    };
    const out = await summarizeTranscript(TRANSCRIPT, {
      client: throwingClient,
      logger: silentLogger,
    });
    expect(out.fromModel).toBe(false);
    expect(out.keywords).toContain("shots fired");
  });

  it("falls back when the model returns no text block", async () => {
    const emptyClient: AnthropicLike = {
      messages: {
        create: vi.fn().mockResolvedValue({ content: [] }),
      },
    };
    const out = await summarizeTranscript(TRANSCRIPT, {
      client: emptyClient,
      logger: silentLogger,
    });
    expect(out.fromModel).toBe(false);
  });

  it("uses the model output on the happy path", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "Shooting at Innes & Earl; victim down." }],
    });
    const mockClient: AnthropicLike = { messages: { create } };
    const out = await summarizeTranscript(TRANSCRIPT, {
      client: mockClient,
      logger: silentLogger,
      model: "test-model",
    });
    expect(out.fromModel).toBe(true);
    expect(out.summary).toBe("Shooting at Innes & Earl; victim down.");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ model: "test-model", max_tokens: 120 }),
    );
  });

  it("defaults to the cheap Haiku model constant", () => {
    expect(DEFAULT_MODEL).toBe("claude-haiku-4-5-20251001");
  });
});
