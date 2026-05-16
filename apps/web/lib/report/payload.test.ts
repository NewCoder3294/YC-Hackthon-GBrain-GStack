import { describe, it, expect } from "vitest";
import { ZodError } from "zod";
import {
  parseReportInput,
  buildSignalEventRow,
  type ReportInput,
} from "./payload";

const baseRaw = {
  description: "Pothole blocking the right lane",
  lat: 37.7749,
  lng: -122.4194,
  channel: "web" as const,
};

const ctx = { id: "11111111-1111-1111-1111-111111111111", now: new Date("2026-05-16T20:30:00.000Z") };

describe("parseReportInput", () => {
  it("accepts a minimal valid input", () => {
    const input = parseReportInput(baseRaw);
    expect(input.description).toBe("Pothole blocking the right lane");
    expect(input.lat).toBe(37.7749);
    expect(input.lng).toBe(-122.4194);
    expect(input.channel).toBe("web");
    expect(input.contact).toBeUndefined();
    expect(input.photoPath).toBeUndefined();
  });

  it("coerces string coordinates (form fields arrive as strings)", () => {
    const input = parseReportInput({ ...baseRaw, lat: "37.5", lng: "-122.2" });
    expect(input.lat).toBe(37.5);
    expect(input.lng).toBe(-122.2);
  });

  it("rejects a missing/empty description", () => {
    expect(() => parseReportInput({ ...baseRaw, description: "" })).toThrow(ZodError);
    const { description: _omit, ...noDesc } = baseRaw;
    expect(() => parseReportInput(noDesc)).toThrow(ZodError);
  });

  it("rejects an invalid channel enum", () => {
    expect(() => parseReportInput({ ...baseRaw, channel: "sms" })).toThrow(ZodError);
  });

  it("guards latitude range", () => {
    expect(() => parseReportInput({ ...baseRaw, lat: 91 })).toThrow(ZodError);
    expect(() => parseReportInput({ ...baseRaw, lat: -90.001 })).toThrow(ZodError);
  });

  it("guards longitude range", () => {
    expect(() => parseReportInput({ ...baseRaw, lng: 180.5 })).toThrow(ZodError);
    expect(() => parseReportInput({ ...baseRaw, lng: -181 })).toThrow(ZodError);
  });

  it("accepts optional contact and photoPath", () => {
    const input = parseReportInput({
      ...baseRaw,
      contact: "jane@example.com",
      photoPath: "abc/photo.jpg",
    });
    expect(input.contact).toBe("jane@example.com");
    expect(input.photoPath).toBe("abc/photo.jpg");
  });
});

describe("buildSignalEventRow", () => {
  it("maps a valid input to the correct signal_events row", () => {
    const input: ReportInput = parseReportInput({ ...baseRaw, channel: "mobile" });
    const row = buildSignalEventRow(input, ctx);

    expect(row).toEqual({
      source_type: "citizen_report",
      source_id: ctx.id,
      occurred_at: "2026-05-16T20:30:00.000Z",
      lat: 37.7749,
      lng: -122.4194,
      payload: {
        channel: "mobile",
        description: "Pothole blocking the right lane",
      },
      confidence: null,
      raw_clip_uri: null,
    });
  });

  it("passes the photo path into raw_clip_uri AND payload.photo_path", () => {
    const input = parseReportInput({
      ...baseRaw,
      photoPath: "11111111/evidence.jpg",
      contact: "555-0100",
    });
    const row = buildSignalEventRow(input, ctx);

    expect(row.raw_clip_uri).toBe("11111111/evidence.jpg");
    expect(row.payload.photo_path).toBe("11111111/evidence.jpg");
    expect(row.payload.contact).toBe("555-0100");
  });

  it("omits optional payload keys when absent (exactOptionalPropertyTypes)", () => {
    const input = parseReportInput(baseRaw);
    const row = buildSignalEventRow(input, ctx);
    expect("contact" in row.payload).toBe(false);
    expect("photo_path" in row.payload).toBe(false);
    expect(row.raw_clip_uri).toBeNull();
  });

  it("is pure — same inputs produce identical output", () => {
    const input = parseReportInput(baseRaw);
    expect(buildSignalEventRow(input, ctx)).toEqual(buildSignalEventRow(input, ctx));
  });
});
