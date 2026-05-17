import { describe, it, expect, vi } from "vitest";
import {
  createAdjudicator,
  deterministicAdjudicator,
  type AnthropicLike,
  type NarrateInput,
} from "./adjudicate";
import type { AmbiguousMerge } from "./types";

const nearMatch: AmbiguousMerge = {
  signalId: "b",
  clusterId: "incident-x",
  reason: "category-match-near-radius",
  distanceM: 200,
};
const mismatch: AmbiguousMerge = {
  signalId: "c",
  clusterId: "incident-y",
  reason: "category-mismatch-in-radius",
  distanceM: 50,
};
const ctx = {
  signalAffinity: "assault",
  clusterAffinity: "assault",
  neighborhood: "Mission",
};
const narrateInput: NarrateInput = {
  tier: "P1",
  factors: {
    corroboration: 0.6,
    severity: 1,
    anomaly: 0.4,
    equity: 0.5,
    degraded: false,
  },
  sourceCount: 3,
  neighborhood: "Mission",
  affinityGroup: "weapons-violence",
  anomalyRatio: 4.2,
};

describe("deterministicAdjudicator", () => {
  it("merges near-radius same-group within 1.5x, splits mismatch", async () => {
    expect(await deterministicAdjudicator.resolveAmbiguous(nearMatch, ctx)).toBe(
      "merge",
    );
    expect(await deterministicAdjudicator.resolveAmbiguous(mismatch, ctx)).toBe(
      "split",
    );
  });
  it("narrates a non-empty templated line", async () => {
    const s = await deterministicAdjudicator.narrate(narrateInput);
    expect(s).toContain("P1");
    expect(s).toContain("weapons-violence");
    expect(s.length).toBeGreaterThan(10);
  });
});

describe("createAdjudicator", () => {
  it("returns the deterministic adjudicator when no API key", async () => {
    const a = createAdjudicator({ apiKey: "" });
    expect(await a.resolveAmbiguous(nearMatch, ctx)).toBe("merge");
  });

  it("uses injected client happy path", async () => {
    const client: AnthropicLike = {
      messages: {
        create: vi
          .fn()
          .mockResolvedValueOnce({ content: [{ type: "text", text: "SPLIT" }] })
          .mockResolvedValueOnce({
            content: [{ type: "text", text: "Three sources converged." }],
          }),
      },
    };
    const a = createAdjudicator({ client, apiKey: "k" });
    expect(await a.resolveAmbiguous(nearMatch, ctx)).toBe("split");
    expect(await a.narrate(narrateInput)).toBe("Three sources converged.");
  });

  it("falls back to deterministic when the client throws", async () => {
    const client: AnthropicLike = {
      messages: { create: vi.fn().mockRejectedValue(new Error("boom")) },
    };
    const a = createAdjudicator({ client, apiKey: "k" });
    expect(await a.resolveAmbiguous(nearMatch, ctx)).toBe("merge");
    expect(await a.narrate(narrateInput)).toContain("P1");
  });
});
