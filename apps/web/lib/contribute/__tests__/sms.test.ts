import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendSms } from "../sms";

const originalEnv = { ...process.env };

describe("sendSms", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_FROM_NUMBER;
    vi.restoreAllMocks();
  });

  it("falls back to log when Twilio env is missing", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const result = await sendSms({ to: "+14155551212", body: "hi" });
    expect(result).toEqual({ channel: "log", status: "sent" });
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("[SMS-LOG] +14155551212"),
      expect.stringContaining("hi"),
    );
  });

  it("calls Twilio when env present", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC_test";
    process.env.TWILIO_AUTH_TOKEN = "auth_test";
    process.env.TWILIO_FROM_NUMBER = "+14150000000";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ sid: "SM1" }), { status: 201 }));
    const result = await sendSms({ to: "+14155551212", body: "hi" });
    expect(result).toEqual({ channel: "sms", status: "sent" });
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.twilio.com/2010-04-01/Accounts/AC_test/Messages.json",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("returns failed on Twilio error", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC_test";
    process.env.TWILIO_AUTH_TOKEN = "auth_test";
    process.env.TWILIO_FROM_NUMBER = "+14150000000";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "bad" }), { status: 400 }),
    );
    const result = await sendSms({ to: "+14155551212", body: "hi" });
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/bad|400/);
  });
});
