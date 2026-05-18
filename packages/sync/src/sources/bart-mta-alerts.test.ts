import { describe, it, expect, vi } from "vitest";
import { fetchBartMtaAlerts } from "./bart-mta-alerts";

function jsonOk(body: unknown) {
  return {
    ok: true,
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

describe("fetchBartMtaAlerts", () => {
  it("maps a BART major delay to a high-severity transit signal", async () => {
    const fetchImpl = vi.fn().mockImplementation((url: string) => {
      if (url.includes("bart.gov")) {
        return Promise.resolve(
          jsonOk({
            root: {
              bsa: [
                {
                  bsa: "1",
                  type: "EMERGENCY",
                  posted: "Sun May 17 2026 02:30 AM PDT",
                  expires: "Sun May 17 2026 06:00 AM PDT",
                  description: {
                    "#cdata-section":
                      "Major delays system-wide due to track maintenance.",
                  },
                },
              ],
            },
          }),
        );
      }
      // SFMTA path — no key, no rows.
      return Promise.resolve(jsonOk({ Siri: {} }));
    });
    const result = await fetchBartMtaAlerts({
      fetch: fetchImpl as unknown as typeof fetch,
      // Force the SFMTA branch to short-circuit cleanly.
      sf511ApiKey: undefined,
    });
    expect(result.bartFetched).toBe(1);
    expect(result.rows).toHaveLength(1);
    const row = result.rows[0]!;
    expect(row.kind).toBe("transit");
    expect(row.source).toBe("bart_mta");
    expect(row.severity).toBe("high");
    expect(row.title).toMatch(/BART/);
    expect(row.subtitle).toMatch(/Major delays/);
  });

  it("collapses BART 'No delays' sentinel rows into dropped", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonOk({
        root: {
          bsa: { description: "", type: "DELAY", posted: "" },
        },
      }),
    );
    const result = await fetchBartMtaAlerts({
      fetch: fetchImpl as unknown as typeof fetch,
      sf511ApiKey: undefined,
    });
    expect(result.bartFetched).toBe(0);
    expect(result.dropped).toBe(1);
  });

  it("ingests SFMTA Muni alerts from the 511 service-alerts feed", async () => {
    const fetchImpl = vi.fn().mockImplementation((url: string) => {
      if (url.includes("bart.gov")) {
        return Promise.resolve(jsonOk({ root: { bsa: [] } }));
      }
      // 511 SFMTA response
      return Promise.resolve(
        jsonOk({
          Siri: {
            ServiceDelivery: {
              SituationExchangeDelivery: [
                {
                  Situations: {
                    PtSituationElement: [
                      {
                        Id: "muni-44-detour",
                        Severity: "severe",
                        CreationTime: "2026-05-17T11:30:00Z",
                        EffectPeriods: [
                          { Start: "2026-05-17T11:30:00Z", End: "2026-05-17T20:00:00Z" },
                        ],
                        HeaderText: {
                          Translations: [{ Text: "44 O'Shaughnessy detour", Language: "en" }],
                        },
                        DescriptionText: {
                          Translations: [{ Text: "Detoured via Market.", Language: "en" }],
                        },
                        InformedEntities: {
                          InformedEntity: [{ RouteName: "44 O'Shaughnessy" }],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        }),
      );
    });
    const result = await fetchBartMtaAlerts({
      fetch: fetchImpl as unknown as typeof fetch,
      sf511ApiKey: "key",
    });
    expect(result.sfmtaFetched).toBe(1);
    expect(result.rows[0]!.severity).toBe("high");
    expect(result.rows[0]!.title).toMatch(/SFMTA/);
    expect(result.rows[0]!.subtitle).toMatch(/44 O'Shaughnessy/);
  });

  it("isolates failure: BART error + SFMTA ok still returns SFMTA rows", async () => {
    const fetchImpl = vi.fn().mockImplementation((url: string) => {
      if (url.includes("bart.gov")) {
        return Promise.resolve({
          ok: false,
          status: 500,
          text: async () => "down",
        });
      }
      return Promise.resolve(
        jsonOk({
          Siri: {
            ServiceDelivery: {
              SituationExchangeDelivery: [
                {
                  Situations: {
                    PtSituationElement: [
                      {
                        Id: "m-1",
                        Severity: "slight",
                        CreationTime: "2026-05-17T11:30:00Z",
                        HeaderText: { Translations: [{ Text: "Stop change", Language: "en" }] },
                      },
                    ],
                  },
                },
              ],
            },
          },
        }),
      );
    });
    const result = await fetchBartMtaAlerts({
      fetch: fetchImpl as unknown as typeof fetch,
      sf511ApiKey: "key",
    });
    expect(result.bartFetched).toBe(0);
    expect(result.sfmtaFetched).toBe(1);
  });

  it("throws when both upstreams fail", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "down",
    });
    await expect(
      fetchBartMtaAlerts({
        fetch: fetchImpl as unknown as typeof fetch,
        sf511ApiKey: "key",
      }),
    ).rejects.toThrow(/both upstreams failed/);
  });
});
