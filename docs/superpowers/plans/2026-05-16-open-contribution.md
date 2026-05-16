# OpenContribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any camera owner (gas station, bodega, parking lot, homeowner) register a camera via API or web form, verify by SMS, and observe a passive dashboard. The system automatically SMS-notifies them when their feed contributes to an incident near their location.

**Architecture:** Hands-off for the owner. One ingest endpoint, one SMS-verify step, one read-mostly dashboard at `/c/[token]` keyed by an opaque 32-byte token (no login). Contributor cameras flow into the existing `cameras` table with a `contributor_id` FK and participate in the fusion engine unchanged. Outbound SMS is enqueued by a Postgres trigger and sent by a Vercel Cron route; Twilio is optional — if env vars are unset, bodies are logged.

**Tech Stack:** Next.js 15 App Router, Supabase Postgres + RLS, Drizzle ORM (schema source of truth), Vercel Cron, Twilio (optional), Zod for request validation, Vitest for unit tests, manual smoke for the dashboard.

---

## Spec reference

This plan implements `docs/superpowers/specs/2026-05-16-open-contribution-design.md`. All section anchors below refer to that spec.

## File structure

```
packages/db/src/schema.ts                  modify: add contributors + contributor_notifications + cameras.contributor_id
packages/db/migrations/0002_contrib.sql    new: generated baseline DDL
packages/db/migrations/0003_contrib_rls.sql new: RLS policies for the two new tables

apps/web/lib/contribute/
  token.ts          new: generate + verify dashboard tokens (32-byte base64url)
  code.ts           new: generate + verify 6-digit codes with expiry
  sms.ts            new: Twilio thin wrapper, falls back to console.log
  ratelimit.ts      new: in-memory IP rate limiter (LRU map, 10/min)
  policy.ts         new: build default camera_policies row for a new contributor camera

apps/web/lib/contribute/__tests__/
  token.test.ts
  code.test.ts
  sms.test.ts
  ratelimit.test.ts

apps/web/app/api/contribute/route.ts          new: POST /api/contribute
apps/web/app/api/contribute/verify/route.ts   new: POST /api/contribute/verify
apps/web/app/api/contribute/remove/route.ts   new: POST /api/contribute/remove
apps/web/app/api/cron/notify-contributors/route.ts  new: drain queued SMS

apps/web/app/contribute/page.tsx              new: public 4-field form + map picker
apps/web/app/contribute/registration-form.tsx new: client form component

apps/web/app/c/[token]/layout.tsx            new: resolves token → contributor, 404 if missing
apps/web/app/c/[token]/page.tsx              new: dashboard (cameras, recent activity, audit log)
apps/web/app/c/[token]/verify/page.tsx       new: 6-digit code entry
apps/web/app/c/[token]/i/[incident_id]/page.tsx  new: single-incident detail for contributor
apps/web/app/c/[token]/_actions.ts           new: server actions: verify, toggle camera, remove

apps/web/app/c/[token]/parts/
  camera-list.tsx
  activity-list.tsx
  audit-table.tsx
  remove-button.tsx

apps/web/lib/env.ts                          modify: add TWILIO_* + add to schema
vercel.json                                  modify: add notify-contributors cron entry

scripts/sql/0004_notification_trigger.sql    new: Postgres trigger that enqueues notifications
```

## Environment variables

Add to Vercel + `apps/web/.env.example`:

- `TWILIO_ACCOUNT_SID` — optional
- `TWILIO_AUTH_TOKEN` — optional
- `TWILIO_FROM_NUMBER` — optional, E.164 format

If any of the three is missing, the SMS sender logs the body and marks the notification `status='sent'` with `channel='log'`. This keeps the demo runnable without a Twilio account.

---

### Task 1: Drizzle schema for `contributors` and `contributor_notifications`

**Files:**
- Modify: `packages/db/src/schema.ts`

- [ ] **Step 1: Open `packages/db/src/schema.ts` and append the new tables + relation**

Add these declarations at the end of the file:

```ts
export const contributors = pgTable("contributors", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  contactPhone: text("contact_phone").notNull().unique(),
  contactEmail: text("contact_email"),
  token: text("token").notNull().unique(),
  verificationCode: text("verification_code"),
  verificationExpiresAt: timestamp("verification_expires_at", { withTimezone: true }),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  hoursJson: jsonb("hours_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  removedAt: timestamp("removed_at", { withTimezone: true }),
});

export const contributorNotifications = pgTable(
  "contributor_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contributorId: uuid("contributor_id")
      .notNull()
      .references(() => contributors.id, { onDelete: "cascade" }),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),
    channel: text("channel", { enum: ["sms", "email", "log"] }).notNull(),
    body: text("body").notNull(),
    status: text("status", { enum: ["queued", "sent", "failed"] })
      .notNull()
      .default("queued"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniquePerIncident: uniqueIndex("contributor_notifications_unique_per_incident").on(
      t.contributorId,
      t.incidentId,
    ),
  }),
);

export type Contributor = typeof contributors.$inferSelect;
export type NewContributor = typeof contributors.$inferInsert;
export type ContributorNotification = typeof contributorNotifications.$inferSelect;
```

Also add `jsonb` to the import line from `drizzle-orm/pg-core` if it isn't already there, and `uniqueIndex`.

- [ ] **Step 2: Modify the existing `cameras` table declaration**

Locate the `cameras = pgTable(...)` declaration and add a nullable FK column. Insert after `lastSyncedAt`:

```ts
  contributorId: uuid("contributor_id").references(() => contributors.id, {
    onDelete: "cascade",
  }),
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @caltrans/db typecheck
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema.ts
git commit -m "feat(db): contributors + contributor_notifications tables and cameras.contributor_id"
```

---

### Task 2: Generate the baseline migration

**Files:**
- Create: `packages/db/migrations/0002_*.sql` (drizzle-kit chooses the filename)

- [ ] **Step 1: Generate**

```bash
DATABASE_URL="postgres://placeholder" pnpm --filter @caltrans/db generate
```

Expected: a new file `packages/db/migrations/0002_<adj>_<noun>.sql` is created containing `CREATE TABLE contributors`, `CREATE TABLE contributor_notifications`, `ALTER TABLE cameras ADD COLUMN contributor_id`, plus the FK constraints and the unique index.

- [ ] **Step 2: Inspect**

Open the generated file. Confirm three table-touching statements (one CREATE TABLE for each new table + one ALTER on cameras) and one UNIQUE INDEX. Nothing else should be present.

- [ ] **Step 3: Apply via Supabase MCP**

Apply the file's contents (read it and copy the SQL) using:

```ts
mcp__supabase__apply_migration({
  project_id: "stfxqaocnyhkumapmbjw",
  name: "open_contribution_baseline",
  query: "<paste the SQL>",
})
```

Expected response: `{ "success": true }`.

- [ ] **Step 4: Verify on Supabase**

```ts
mcp__supabase__execute_sql({
  project_id: "stfxqaocnyhkumapmbjw",
  query: "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('contributors','contributor_notifications');",
})
```

Expected: both rows present.

- [ ] **Step 5: Commit the migration file**

```bash
git add packages/db/migrations/
git commit -m "feat(db): migration 0002 — contributors + notifications + cameras FK"
```

---

### Task 3: RLS policies for the new tables

**Files:**
- Create: `packages/db/migrations/0003_contrib_rls.sql`

- [ ] **Step 1: Write the RLS migration**

```sql
ALTER TABLE contributors ENABLE ROW LEVEL SECURITY;
ALTER TABLE contributor_notifications ENABLE ROW LEVEL SECURITY;

-- contributors: no client access. All reads go through service role on the server.
CREATE POLICY "contributors_no_client_access" ON contributors
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- contributor_notifications: same.
CREATE POLICY "contributor_notifications_no_client_access" ON contributor_notifications
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
```

- [ ] **Step 2: Apply via Supabase MCP**

```ts
mcp__supabase__apply_migration({
  project_id: "stfxqaocnyhkumapmbjw",
  name: "open_contribution_rls",
  query: "<paste the SQL from the file>",
})
```

Expected: `{ "success": true }`.

- [ ] **Step 3: Commit**

```bash
git add packages/db/migrations/0003_contrib_rls.sql
git commit -m "feat(db): RLS — contributors + notifications are server-only"
```

---

### Task 4: Env vars — add TWILIO_* to the schema

**Files:**
- Modify: `apps/web/lib/env.ts`
- Modify: `apps/web/.env.example`

- [ ] **Step 1: Update the zod schema**

Open `apps/web/lib/env.ts` and add three optional fields to the schema:

```ts
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  DATABASE_URL: z.string().url().optional(),
  CRON_SECRET: z.string().min(16).optional(),
  TWILIO_ACCOUNT_SID: z.string().min(10).optional(),
  TWILIO_AUTH_TOKEN: z.string().min(10).optional(),
  TWILIO_FROM_NUMBER: z.string().regex(/^\+\d{10,15}$/).optional(),
});
```

And in the `schema.parse({ ... })` call below, add three more lines:

```ts
  TWILIO_ACCOUNT_SID: blank(process.env.TWILIO_ACCOUNT_SID),
  TWILIO_AUTH_TOKEN: blank(process.env.TWILIO_AUTH_TOKEN),
  TWILIO_FROM_NUMBER: blank(process.env.TWILIO_FROM_NUMBER),
```

- [ ] **Step 2: Update env.example**

Append to `apps/web/.env.example`:

```
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
```

- [ ] **Step 3: Typecheck**

```bash
set -a; source apps/web/.env.local; set +a
pnpm --filter @caltrans/web typecheck
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/env.ts apps/web/.env.example
git commit -m "feat(web): TWILIO_* env vars (all optional, fallback to console)"
```

---

### Task 5: Token utility (`lib/contribute/token.ts`)

**Files:**
- Create: `apps/web/lib/contribute/token.ts`
- Create: `apps/web/lib/contribute/__tests__/token.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/web/lib/contribute/__tests__/token.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { generateContributorToken } from "../token";

describe("generateContributorToken", () => {
  it("returns a 43-character base64url string", () => {
    const t = generateContributorToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("returns a different value every call", () => {
    const a = generateContributorToken();
    const b = generateContributorToken();
    expect(a).not.toBe(b);
  });
});
```

Note: 32 bytes base64url-encoded produces 43 chars (no padding).

- [ ] **Step 2: Add vitest to apps/web if not present**

Check `apps/web/package.json`. If `vitest` is not in devDependencies, add it:

```bash
pnpm --filter @caltrans/web add -D vitest
```

Add a `test` script if missing:

```json
"scripts": {
  ...
  "test": "vitest run"
}
```

Add a minimal vitest config at `apps/web/vitest.config.ts` if missing:

```ts
import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
export default defineConfig({
  test: { environment: "node" },
  resolve: { alias: { "@": resolve(__dirname, ".") } },
});
```

- [ ] **Step 3: Run test, expect FAIL**

```bash
pnpm --filter @caltrans/web test -- token
```

Expected: FAIL — `Cannot find module '../token'`.

- [ ] **Step 4: Implement token.ts**

```ts
import { randomBytes } from "node:crypto";

export function generateContributorToken(): string {
  return randomBytes(32).toString("base64url");
}
```

- [ ] **Step 5: Run test, expect PASS**

```bash
pnpm --filter @caltrans/web test -- token
```

Expected: 2 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/contribute/token.ts apps/web/lib/contribute/__tests__/token.test.ts apps/web/package.json apps/web/vitest.config.ts pnpm-lock.yaml
git commit -m "feat(contribute): token generator + vitest config"
```

---

### Task 6: Verification-code utility (`lib/contribute/code.ts`)

**Files:**
- Create: `apps/web/lib/contribute/code.ts`
- Create: `apps/web/lib/contribute/__tests__/code.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { generateVerificationCode, codeIsValid } from "../code";

describe("generateVerificationCode", () => {
  it("returns 6 digits", () => {
    const c = generateVerificationCode();
    expect(c).toMatch(/^\d{6}$/);
  });
});

describe("codeIsValid", () => {
  const inFuture = new Date(Date.now() + 5 * 60_000).toISOString();
  const inPast = new Date(Date.now() - 5 * 60_000).toISOString();

  it("matches when code and expiry are correct", () => {
    expect(codeIsValid("123456", "123456", inFuture)).toBe(true);
  });

  it("rejects mismatched codes", () => {
    expect(codeIsValid("123456", "999999", inFuture)).toBe(false);
  });

  it("rejects expired codes", () => {
    expect(codeIsValid("123456", "123456", inPast)).toBe(false);
  });

  it("rejects when no code stored", () => {
    expect(codeIsValid("123456", null, inFuture)).toBe(false);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
pnpm --filter @caltrans/web test -- code
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import { randomInt, timingSafeEqual } from "node:crypto";

export function generateVerificationCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function codeIsValid(
  submitted: string,
  stored: string | null,
  expiresAtIso: string | null | undefined,
): boolean {
  if (!stored || !expiresAtIso) return false;
  if (new Date(expiresAtIso).getTime() < Date.now()) return false;
  if (submitted.length !== stored.length) return false;
  return timingSafeEqual(Buffer.from(submitted), Buffer.from(stored));
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
pnpm --filter @caltrans/web test -- code
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/contribute/code.ts apps/web/lib/contribute/__tests__/code.test.ts
git commit -m "feat(contribute): 6-digit verification code generator + validator"
```

---

### Task 7: SMS sender (`lib/contribute/sms.ts`) with Twilio fallback

**Files:**
- Create: `apps/web/lib/contribute/sms.ts`
- Create: `apps/web/lib/contribute/__tests__/sms.test.ts`

- [ ] **Step 1: Write failing test**

```ts
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
```

- [ ] **Step 2: Run, expect FAIL**

```bash
pnpm --filter @caltrans/web test -- sms
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
interface SendArgs {
  to: string;
  body: string;
}

export interface SendResult {
  channel: "sms" | "log";
  status: "sent" | "failed";
  error?: string;
}

export async function sendSms({ to, body }: SendArgs): Promise<SendResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  if (!sid || !token || !from) {
    console.log(`[SMS-LOG] ${to}`, body);
    return { channel: "log", status: "sent" };
  }

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const params = new URLSearchParams({ To: to, From: from, Body: body });
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        authorization: `Basic ${auth}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: params,
    },
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({ message: `${res.status}` }));
    return { channel: "sms", status: "failed", error: data.message ?? String(res.status) };
  }
  return { channel: "sms", status: "sent" };
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
pnpm --filter @caltrans/web test -- sms
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/contribute/sms.ts apps/web/lib/contribute/__tests__/sms.test.ts
git commit -m "feat(contribute): SMS sender with Twilio + log fallback"
```

---

### Task 8: IP rate limiter (`lib/contribute/ratelimit.ts`)

**Files:**
- Create: `apps/web/lib/contribute/ratelimit.ts`
- Create: `apps/web/lib/contribute/__tests__/ratelimit.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { rateLimit, _resetRateLimit } from "../ratelimit";

describe("rateLimit", () => {
  beforeEach(() => {
    _resetRateLimit();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-16T12:00:00Z"));
  });

  it("allows up to the limit then blocks", () => {
    const ip = "1.1.1.1";
    for (let i = 0; i < 10; i++) {
      expect(rateLimit(ip, { limit: 10, windowMs: 60_000 })).toBe(true);
    }
    expect(rateLimit(ip, { limit: 10, windowMs: 60_000 })).toBe(false);
  });

  it("isolates by ip", () => {
    expect(rateLimit("1.1.1.1", { limit: 1, windowMs: 60_000 })).toBe(true);
    expect(rateLimit("2.2.2.2", { limit: 1, windowMs: 60_000 })).toBe(true);
  });

  it("resets after the window", () => {
    rateLimit("1.1.1.1", { limit: 1, windowMs: 60_000 });
    expect(rateLimit("1.1.1.1", { limit: 1, windowMs: 60_000 })).toBe(false);
    vi.advanceTimersByTime(60_001);
    expect(rateLimit("1.1.1.1", { limit: 1, windowMs: 60_000 })).toBe(true);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
pnpm --filter @caltrans/web test -- ratelimit
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

interface Opts {
  limit: number;
  windowMs: number;
}

export function rateLimit(key: string, { limit, windowMs }: Opts): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= limit) return false;
  b.count++;
  return true;
}

export function _resetRateLimit() {
  buckets.clear();
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
pnpm --filter @caltrans/web test -- ratelimit
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/contribute/ratelimit.ts apps/web/lib/contribute/__tests__/ratelimit.test.ts
git commit -m "feat(contribute): in-memory IP rate limiter"
```

---

### Task 9: Default policy builder (`lib/contribute/policy.ts`)

**Files:**
- Create: `apps/web/lib/contribute/policy.ts`

- [ ] **Step 1: Implement**

The `camera_policies` table from TRD §3.5 doesn't exist in this repo yet — the policy-as-code enforcer is a Python-side concern. We still emit the *intent* alongside the camera so a future enforcer can pick it up. For v1 we just store the policy intent on the contributor row.

Append to `packages/db/src/schema.ts` (revisit in a follow-up migration if the Python side needs a real table). For now, expose a helper that returns the canonical default policy object so the enforcer can use it later.

```ts
// apps/web/lib/contribute/policy.ts
export interface ContributorDefaultPolicy {
  geofenceMeters: number;
  allowedIncidentTypes: "all";
  warrantRequirement: "exigent_ok";
  timeWindows: "24/7";
}

export const DEFAULT_POLICY: ContributorDefaultPolicy = {
  geofenceMeters: 500,
  allowedIncidentTypes: "all",
  warrantRequirement: "exigent_ok",
  timeWindows: "24/7",
};
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm --filter @caltrans/web typecheck
git add apps/web/lib/contribute/policy.ts
git commit -m "feat(contribute): default policy object (geofence 500m, exigent_ok)"
```

---

### Task 10: Service-role Supabase client (`lib/supabase/admin.ts`)

**Files:**
- Create: `apps/web/lib/supabase/admin.ts`

The contributor API endpoints bypass user auth and need the service role to read/write `contributors` (which has RLS denying everyone).

- [ ] **Step 1: Implement**

```ts
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

let cached: ReturnType<typeof createClient> | null = null;

export function adminClient() {
  if (cached) return cached;
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for admin operations");
  }
  cached = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm --filter @caltrans/web typecheck
git add apps/web/lib/supabase/admin.ts
git commit -m "feat(web): service-role admin client for server-only RLS bypass"
```

---

### Task 11: `POST /api/contribute` route

**Files:**
- Create: `apps/web/app/api/contribute/route.ts`

- [ ] **Step 1: Implement**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { adminClient } from "@/lib/supabase/admin";
import { generateContributorToken } from "@/lib/contribute/token";
import { generateVerificationCode } from "@/lib/contribute/code";
import { sendSms } from "@/lib/contribute/sms";
import { rateLimit } from "@/lib/contribute/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().min(1).max(200),
  contact_phone: z.string().regex(/^\+\d{10,15}$/, "phone must be E.164"),
  contact_email: z.string().email().optional(),
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
  stream_url: z.string().url(),
  stream_type: z.enum(["hls", "mjpeg"]).default("hls"),
  hours: z.unknown().optional(),
});

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(ip, { limit: 10, windowMs: 60_000 })) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  }
  const body = parsed.data;

  const supabase = adminClient();

  const token = generateContributorToken();
  const code = generateVerificationCode();
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();

  const { data: contributor, error: insertErr } = await supabase
    .from("contributors")
    .insert({
      name: body.name,
      contact_phone: body.contact_phone,
      contact_email: body.contact_email ?? null,
      token,
      verification_code: code,
      verification_expires_at: expiresAt,
      hours_json: body.hours ?? null,
    })
    .select("id, token")
    .single();
  if (insertErr || !contributor) {
    if (insertErr?.code === "23505") {
      return NextResponse.json({ error: "phone_already_registered" }, { status: 409 });
    }
    return NextResponse.json({ error: insertErr?.message ?? "insert_failed" }, { status: 500 });
  }

  const caltransId = `CONTRIB-${contributor.id.slice(0, 8)}`;
  const { error: camErr } = await supabase.from("cameras").insert({
    caltrans_id: caltransId,
    district: 4,
    route: "contributor",
    direction: null,
    description: body.name,
    lat: body.lat,
    lng: body.lng,
    stream_url: body.stream_url,
    stream_type: body.stream_type,
    is_active: false,
    contributor_id: contributor.id,
  });
  if (camErr) {
    return NextResponse.json({ error: camErr.message }, { status: 500 });
  }

  const origin = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
  const dashboardUrl = `${origin}/c/${contributor.token}`;
  const verifyUrl = `${dashboardUrl}/verify`;

  await sendSms({
    to: body.contact_phone,
    body: `WatchDog: your verification code is ${code}. Enter at ${verifyUrl}`,
  });

  return NextResponse.json({
    contributor_id: contributor.id,
    dashboard_url: dashboardUrl,
    verify_url: verifyUrl,
  });
}
```

- [ ] **Step 2: Excluded from auth middleware**

Open `apps/web/middleware.ts`. Update the matcher to also exclude `/api/contribute` and `/c/`:

Replace:
```ts
matcher: ["/((?!_next/static|_next/image|favicon.ico|api/cron|api/hls).*)"],
```
With:
```ts
matcher: [
  "/((?!_next/static|_next/image|favicon.ico|api/cron|api/hls|api/contribute|c/|contribute).*)",
],
```

- [ ] **Step 3: Smoke test**

```bash
curl -X POST http://localhost:3000/api/contribute \
  -H "content-type: application/json" \
  -d '{"name":"Test Gas","contact_phone":"+14155550100","lat":37.78,"lng":-122.41,"stream_url":"https://example.com/x.m3u8"}'
```

Expected: 200 JSON with `contributor_id`, `dashboard_url`, `verify_url`. Server log shows `[SMS-LOG] +14155550100 WatchDog: your verification code is 123456…`.

Verify in DB:
```ts
mcp__supabase__execute_sql({
  project_id: "stfxqaocnyhkumapmbjw",
  query: "SELECT id, name, contact_phone, verified_at FROM contributors ORDER BY created_at DESC LIMIT 1;",
})
```

Expected: one row with `verified_at = null`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/contribute/route.ts apps/web/middleware.ts
git commit -m "feat(contribute): POST /api/contribute creates contributor + camera + SMS code"
```

---

### Task 12: `POST /api/contribute/verify` route

**Files:**
- Create: `apps/web/app/api/contribute/verify/route.ts`

- [ ] **Step 1: Implement**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { adminClient } from "@/lib/supabase/admin";
import { codeIsValid } from "@/lib/contribute/code";
import { rateLimit } from "@/lib/contribute/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  code: z.string().regex(/^\d{6}$/),
});

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`verify:${ip}`, { limit: 10, windowMs: 60_000 })) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const { token, code } = parsed.data;

  const supabase = adminClient();

  const { data: contributor, error: fetchErr } = await supabase
    .from("contributors")
    .select("id, verification_code, verification_expires_at, verified_at, removed_at")
    .eq("token", token)
    .maybeSingle();
  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!contributor || contributor.removed_at) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (contributor.verified_at) {
    return NextResponse.json({ ok: true, alreadyVerified: true });
  }
  if (!codeIsValid(code, contributor.verification_code, contributor.verification_expires_at)) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  const { error: updateErr } = await supabase
    .from("contributors")
    .update({
      verified_at: new Date().toISOString(),
      verification_code: null,
      verification_expires_at: null,
    })
    .eq("id", contributor.id);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  await supabase
    .from("cameras")
    .update({ is_active: true })
    .eq("contributor_id", contributor.id);

  return NextResponse.json({ ok: true, alreadyVerified: false });
}
```

- [ ] **Step 2: Smoke test**

Verify the contributor from Task 11 by reading the code from the server log, then:

```bash
curl -X POST http://localhost:3000/api/contribute/verify \
  -H "content-type: application/json" \
  -d '{"token":"<token>","code":"<6 digits>"}'
```

Expected: 200 `{ ok: true, alreadyVerified: false }`.

Verify in DB:
```ts
mcp__supabase__execute_sql({
  project_id: "stfxqaocnyhkumapmbjw",
  query: "SELECT verified_at IS NOT NULL AS verified FROM contributors ORDER BY created_at DESC LIMIT 1;",
})
```

Expected: `verified = true`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/contribute/verify/route.ts
git commit -m "feat(contribute): POST /api/contribute/verify flips contributor + cameras active"
```

---

### Task 13: `POST /api/contribute/remove` route

**Files:**
- Create: `apps/web/app/api/contribute/remove/route.ts`

- [ ] **Step 1: Implement**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { adminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/contribute/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`remove:${ip}`, { limit: 10, windowMs: 60_000 })) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const { token } = parsed.data;

  const supabase = adminClient();
  const { data: contributor } = await supabase
    .from("contributors")
    .select("id")
    .eq("token", token)
    .maybeSingle();
  if (!contributor) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await supabase.from("contributors").update({ removed_at: new Date().toISOString() }).eq("id", contributor.id);
  await supabase.from("cameras").update({ is_active: false }).eq("contributor_id", contributor.id);

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/api/contribute/remove/route.ts
git commit -m "feat(contribute): POST /api/contribute/remove soft-deletes contributor + cameras"
```

---

### Task 14: Registration page UI (`/contribute`)

**Files:**
- Create: `apps/web/app/contribute/page.tsx`
- Create: `apps/web/app/contribute/registration-form.tsx`

- [ ] **Step 1: Server page**

```tsx
// apps/web/app/contribute/page.tsx
import { RegistrationForm } from "./registration-form";

export const dynamic = "force-static";

export default function ContributePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white p-6">
      <div className="w-full max-w-md border border-neutral-200 p-8">
        <h1 className="font-mono text-sm uppercase tracking-widest">WatchDog · OpenContribution</h1>
        <p className="mt-2 font-mono text-xs text-neutral-500">
          Register a camera. We text you a 6-digit code; your feed goes live after you confirm.
        </p>
        <div className="mt-6">
          <RegistrationForm />
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Client form**

```tsx
// apps/web/app/contribute/registration-form.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";

export function RegistrationForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+1");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [streamUrl, setStreamUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/contribute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        contact_phone: phone,
        lat: Number(lat),
        lng: Number(lng),
        stream_url: streamUrl,
      }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(json.error ?? "registration failed");
      return;
    }
    const verifyUrl = new URL(json.verify_url).pathname as Route;
    router.push(verifyUrl);
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Business name" value={name} onChange={setName} required />
      <Field label="Phone (E.164)" value={phone} onChange={setPhone} required placeholder="+14155551212" />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Latitude" value={lat} onChange={setLat} required />
        <Field label="Longitude" value={lng} onChange={setLng} required />
      </div>
      <Field label="Stream URL (.m3u8 or .jpg)" value={streamUrl} onChange={setStreamUrl} required />
      {error && <p className="font-mono text-xs text-black">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full border border-black bg-black px-3 py-2 font-mono text-xs uppercase tracking-widest text-white disabled:opacity-40"
      >
        {loading ? "Registering…" : "Register & text me a code"}
      </button>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="block font-mono text-[10px] uppercase tracking-widest text-neutral-500">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className="mt-1 w-full border border-neutral-200 px-3 py-2 font-mono text-sm focus:border-black focus:outline-none"
      />
    </label>
  );
}
```

- [ ] **Step 3: Typecheck + smoke**

```bash
pnpm --filter @caltrans/web typecheck
```

Manual: open `http://localhost:3000/contribute`, fill in the form, submit. After 200 response you should be redirected to `/c/<token>/verify`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/contribute/
git commit -m "feat(contribute): public /contribute registration page + form"
```

---

### Task 15: Verify page (`/c/[token]/verify`)

**Files:**
- Create: `apps/web/app/c/[token]/verify/page.tsx`

- [ ] **Step 1: Implement**

```tsx
"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Route } from "next";

export default function VerifyPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/contribute/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: params.token, code }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(json.error ?? "verification failed");
      return;
    }
    router.push((`/c/${params.token}`) as Route);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-3 border border-neutral-200 p-8">
        <h1 className="font-mono text-sm uppercase tracking-widest">Verify your phone</h1>
        <p className="font-mono text-xs text-neutral-500">
          We sent a 6-digit code to the number on file.
        </p>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode="numeric"
          maxLength={6}
          placeholder="123456"
          required
          className="w-full border border-neutral-200 px-3 py-2 text-center font-mono text-2xl tracking-widest focus:border-black focus:outline-none"
        />
        {error && <p className="font-mono text-xs text-black">{error}</p>}
        <button
          type="submit"
          disabled={loading || code.length !== 6}
          className="w-full border border-black bg-black px-3 py-2 font-mono text-xs uppercase tracking-widest text-white disabled:opacity-40"
        >
          {loading ? "Checking…" : "Confirm"}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Smoke + commit**

Manual: open the redirected URL from Task 14, enter the code from the server log, you should land at `/c/<token>`.

```bash
git add apps/web/app/c/
git commit -m "feat(contribute): /c/[token]/verify code-entry page"
```

---

### Task 16: Dashboard layout (`/c/[token]/layout.tsx`)

**Files:**
- Create: `apps/web/app/c/[token]/layout.tsx`

- [ ] **Step 1: Implement**

The layout resolves the token to a contributor and 404s if missing or removed. Children receive contributor info via React `cache`.

```tsx
import { notFound } from "next/navigation";
import { adminClient } from "@/lib/supabase/admin";
import { cache } from "react";

export const getContributor = cache(async (token: string) => {
  const supabase = adminClient();
  const { data } = await supabase
    .from("contributors")
    .select("id, name, contact_phone, verified_at, removed_at, created_at")
    .eq("token", token)
    .maybeSingle();
  if (!data || data.removed_at) return null;
  return data;
});

export default async function ContributorLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const contributor = await getContributor(token);
  if (!contributor) notFound();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-12 items-center justify-between border-b border-neutral-200 px-4">
        <span className="font-mono text-xs uppercase tracking-widest">
          WatchDog · {contributor.name}
        </span>
        <span className="font-mono text-[10px] text-neutral-500">
          {contributor.verified_at ? "verified" : "unverified"}
        </span>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/c/[token]/layout.tsx
git commit -m "feat(contribute): contributor layout resolves token + 404s if removed"
```

---

### Task 17: Dashboard page (`/c/[token]`) — cameras + activity + audit + remove

**Files:**
- Create: `apps/web/app/c/[token]/page.tsx`
- Create: `apps/web/app/c/[token]/parts/camera-list.tsx`
- Create: `apps/web/app/c/[token]/parts/activity-list.tsx`
- Create: `apps/web/app/c/[token]/parts/audit-table.tsx`
- Create: `apps/web/app/c/[token]/parts/remove-button.tsx`

- [ ] **Step 1: Page server component**

```tsx
// apps/web/app/c/[token]/page.tsx
import { notFound } from "next/navigation";
import { adminClient } from "@/lib/supabase/admin";
import { getContributor } from "./layout";
import { CameraList } from "./parts/camera-list";
import { ActivityList } from "./parts/activity-list";
import { AuditTable } from "./parts/audit-table";
import { RemoveButton } from "./parts/remove-button";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const contributor = await getContributor(token);
  if (!contributor) notFound();

  const supabase = adminClient();
  const { data: cameras = [] } = await supabase
    .from("cameras")
    .select("id, caltrans_id, description, lat, lng, stream_type, is_active")
    .eq("contributor_id", contributor.id)
    .order("created_at", { ascending: true });

  return (
    <div className="space-y-6 p-6">
      <Section title="Your cameras">
        <CameraList cameras={cameras ?? []} token={token} />
      </Section>
      <Section title="Recent activity">
        <ActivityList contributorId={contributor.id} />
      </Section>
      <Section title="Audit log">
        <AuditTable contributorId={contributor.id} />
      </Section>
      <Section title="Settings">
        <p className="font-mono text-xs text-neutral-500">
          Policy in effect: geofence 500m · all incident types · exigent_ok.
        </p>
        <RemoveButton token={token} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
        {title}
      </h2>
      {children}
    </section>
  );
}
```

- [ ] **Step 2: CameraList**

```tsx
// apps/web/app/c/[token]/parts/camera-list.tsx
interface Cam {
  id: string;
  caltrans_id: string;
  description: string;
  lat: number;
  lng: number;
  stream_type: "hls" | "mjpeg";
  is_active: boolean;
}

export function CameraList({ cameras, token }: { cameras: Cam[]; token: string }) {
  if (cameras.length === 0) {
    return <p className="font-mono text-xs text-neutral-500">No cameras registered.</p>;
  }
  return (
    <ul className="divide-y divide-neutral-200 border border-neutral-200">
      {cameras.map((c) => (
        <li key={c.id} className="flex items-center justify-between p-3">
          <div className="min-w-0">
            <p className="truncate font-mono text-xs">{c.description}</p>
            <p className="font-mono text-[10px] text-neutral-500">
              {c.lat.toFixed(4)}, {c.lng.toFixed(4)} · {c.stream_type}
            </p>
          </div>
          <span
            className={`font-mono text-[10px] uppercase tracking-widest ${c.is_active ? "text-black" : "text-neutral-400"}`}
          >
            {c.is_active ? "Active" : "Paused"}
          </span>
        </li>
      ))}
    </ul>
  );
}
```

The per-camera on/off toggle is deferred to a follow-up — listed as future work below.

- [ ] **Step 3: ActivityList**

```tsx
// apps/web/app/c/[token]/parts/activity-list.tsx
import { adminClient } from "@/lib/supabase/admin";

export async function ActivityList({ contributorId }: { contributorId: string }) {
  const supabase = adminClient();
  const { data } = await supabase
    .from("contributor_notifications")
    .select("id, incident_id, body, sent_at, created_at, status, channel")
    .eq("contributor_id", contributorId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (!data || data.length === 0) {
    return (
      <p className="font-mono text-xs text-neutral-500">
        No incidents yet. We&apos;ll notify you when your cameras participate.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-neutral-200 border border-neutral-200">
      {data.map((n) => (
        <li key={n.id} className="p-3">
          <p className="font-mono text-xs">{n.body}</p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            {new Date(n.created_at).toLocaleString()} · {n.channel} · {n.status}
          </p>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: AuditTable**

```tsx
// apps/web/app/c/[token]/parts/audit-table.tsx
import { adminClient } from "@/lib/supabase/admin";

export async function AuditTable({ contributorId }: { contributorId: string }) {
  const supabase = adminClient();
  const { data: camIds = [] } = await supabase
    .from("cameras")
    .select("id")
    .eq("contributor_id", contributorId);
  const ids = (camIds ?? []).map((c) => c.id);
  if (ids.length === 0) {
    return <p className="font-mono text-xs text-neutral-500">No cameras yet.</p>;
  }

  const { data } = await supabase
    .from("access_events")
    .select("id, requested_at, requested_by, legal_basis, decision, denial_reason")
    .in("camera_id", ids)
    .order("requested_at", { ascending: false })
    .limit(50);

  if (!data || data.length === 0) {
    return <p className="font-mono text-xs text-neutral-500">No queries against your cameras yet.</p>;
  }
  return (
    <table className="w-full border-collapse border border-neutral-200 text-left">
      <thead>
        <tr className="border-b border-neutral-200 bg-neutral-50">
          <Th>Time</Th>
          <Th>Requester</Th>
          <Th>Basis</Th>
          <Th>Decision</Th>
        </tr>
      </thead>
      <tbody>
        {data.map((e) => (
          <tr key={e.id} className="border-b border-neutral-200">
            <Td>{new Date(e.requested_at).toLocaleString()}</Td>
            <Td>{e.requested_by}</Td>
            <Td>{e.legal_basis}</Td>
            <Td>
              {e.decision}
              {e.denial_reason ? ` (${e.denial_reason})` : ""}
            </Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-neutral-500">{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 font-mono text-xs">{children}</td>;
}
```

Note: this reads from `access_events`. That table is owned by the Python policy enforcer (TRD §3.6). If it doesn't exist yet at integration time, the dashboard simply renders the empty-state message because the query returns `data = null` and the component catches that. To handle the table-doesn't-exist case explicitly, wrap the query in try/catch and treat any error as empty:

```ts
let data: any[] | null = null;
try {
  const r = await supabase
    .from("access_events")
    .select("id, requested_at, requested_by, legal_basis, decision, denial_reason")
    .in("camera_id", ids)
    .order("requested_at", { ascending: false })
    .limit(50);
  data = r.data;
} catch {
  data = null;
}
```

- [ ] **Step 5: RemoveButton**

```tsx
// apps/web/app/c/[token]/parts/remove-button.tsx
"use client";

import { useState } from "react";

export function RemoveButton({ token }: { token: string }) {
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);

  async function remove() {
    const res = await fetch("/api/contribute/remove", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (res.ok) {
      setDone(true);
      setTimeout(() => (window.location.href = "/"), 1500);
    }
  }

  if (done) {
    return <p className="mt-3 font-mono text-xs text-neutral-500">Removed. Redirecting…</p>;
  }
  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="mt-3 border border-neutral-300 px-3 py-2 font-mono text-xs uppercase tracking-widest hover:border-black"
      >
        Remove me from the network
      </button>
    );
  }
  return (
    <div className="mt-3 flex items-center gap-2">
      <button
        onClick={remove}
        className="border border-black bg-black px-3 py-2 font-mono text-xs uppercase tracking-widest text-white"
      >
        Confirm removal
      </button>
      <button
        onClick={() => setConfirming(false)}
        className="border border-neutral-300 px-3 py-2 font-mono text-xs uppercase tracking-widest hover:border-black"
      >
        Cancel
      </button>
    </div>
  );
}
```

- [ ] **Step 6: Typecheck + smoke**

```bash
pnpm --filter @caltrans/web typecheck
```

Manual: visit `/c/<token>` from the verified contributor. You should see your camera, "No incidents yet", "No queries against your cameras yet", policy line, and Remove button.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/c/[token]/page.tsx apps/web/app/c/[token]/parts/
git commit -m "feat(contribute): /c/[token] dashboard — cameras, activity, audit, remove"
```

---

### Task 18: Notification trigger (Postgres function)

**Files:**
- Create: `scripts/sql/0004_notification_trigger.sql`

- [ ] **Step 1: Write the trigger**

```sql
-- For every contributor camera that contributed a signal to a finalized
-- incident within 500m of the incident centroid, enqueue an SMS.
CREATE OR REPLACE FUNCTION enqueue_contributor_notifications()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  rec RECORD;
BEGIN
  -- earth_distance in meters using haversine (no PostGIS dependency).
  -- 6371000 * acos(...). Cameras live in `cameras` with lat/lng doubles.
  FOR rec IN
    SELECT DISTINCT c.contributor_id,
           c.description AS camera_name,
           ctr.contact_phone,
           ctr.token
    FROM cameras c
    JOIN contributors ctr ON ctr.id = c.contributor_id
    WHERE c.contributor_id IS NOT NULL
      AND ctr.verified_at IS NOT NULL
      AND ctr.removed_at IS NULL
      AND 6371000 * acos(
            cos(radians(NEW.centroid_lat)) * cos(radians(c.lat))
            * cos(radians(c.lng) - radians(NEW.centroid_lng))
            + sin(radians(NEW.centroid_lat)) * sin(radians(c.lat))
          ) <= 500
  LOOP
    INSERT INTO contributor_notifications (contributor_id, incident_id, channel, body)
    VALUES (
      rec.contributor_id,
      NEW.id,
      'sms',
      'WatchDog detected ' || COALESCE(NEW.title, 'an incident')
        || ' near your camera ' || rec.camera_name
        || ' at ' || to_char(NEW.created_at, 'HH24:MI')
        || '. SFPD notified. Track: /c/' || rec.token || '/i/' || NEW.id
    )
    ON CONFLICT (contributor_id, incident_id) DO NOTHING;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contributor_notify_on_incident ON incidents;
CREATE TRIGGER contributor_notify_on_incident
AFTER INSERT ON incidents
FOR EACH ROW EXECUTE FUNCTION enqueue_contributor_notifications();
```

**Caveat:** this trigger assumes the `incidents` table has `centroid_lat` and `centroid_lng` columns. The existing `incidents` schema in this repo (TRD §3.2 originally) uses different columns — the other agent's gang-tracking schema may have evolved it. Before applying, confirm the columns by running:

```ts
mcp__supabase__execute_sql({
  project_id: "stfxqaocnyhkumapmbjw",
  query: "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='incidents' ORDER BY ordinal_position;",
})
```

If `centroid_lat`/`centroid_lng` aren't present, replace them with whatever lat/lng columns exist on `incidents` and adapt the SQL accordingly. If `incidents` has *no* location columns at all, defer this task — the notification trigger needs incident geometry to work.

- [ ] **Step 2: Apply via Supabase MCP**

```ts
mcp__supabase__apply_migration({
  project_id: "stfxqaocnyhkumapmbjw",
  name: "contributor_notification_trigger",
  query: "<paste SQL>",
})
```

- [ ] **Step 3: Smoke test**

Insert a synthetic incident at the contributor's lat/lng:

```ts
mcp__supabase__execute_sql({
  project_id: "stfxqaocnyhkumapmbjw",
  query: "INSERT INTO incidents (title, severity, created_by, centroid_lat, centroid_lng) VALUES ('smoke test', 'high', '<test user uuid>', <contrib_lat>, <contrib_lng>);",
})
```

Then check:

```ts
mcp__supabase__execute_sql({
  project_id: "stfxqaocnyhkumapmbjw",
  query: "SELECT contributor_id, body, status FROM contributor_notifications ORDER BY created_at DESC LIMIT 1;",
})
```

Expected: one queued row whose body contains the contributor's camera name.

- [ ] **Step 4: Commit**

```bash
git add scripts/sql/0004_notification_trigger.sql
git commit -m "feat(contribute): pg trigger enqueues SMS notifications on nearby incidents"
```

---

### Task 19: Notify-contributors cron route

**Files:**
- Create: `apps/web/app/api/cron/notify-contributors/route.ts`
- Modify: `apps/web/vercel.json`

- [ ] **Step 1: Implement the route**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { sendSms } from "@/lib/contribute/sms";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!env.CRON_SECRET || auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = adminClient();
  const { data: queued, error } = await supabase
    .from("contributor_notifications")
    .select("id, body, contributor_id, contributors(contact_phone)")
    .eq("status", "queued")
    .limit(50);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!queued || queued.length === 0) {
    return NextResponse.json({ sent: 0 });
  }

  let sent = 0;
  let failed = 0;
  for (const row of queued) {
    const phone = (row.contributors as { contact_phone: string } | null)?.contact_phone;
    if (!phone) {
      await supabase
        .from("contributor_notifications")
        .update({ status: "failed", error: "missing_phone" })
        .eq("id", row.id);
      failed++;
      continue;
    }
    const result = await sendSms({ to: phone, body: row.body });
    await supabase
      .from("contributor_notifications")
      .update({
        status: result.status,
        channel: result.channel,
        sent_at: result.status === "sent" ? new Date().toISOString() : null,
        error: result.error ?? null,
      })
      .eq("id", row.id);
    if (result.status === "sent") sent++;
    else failed++;
  }
  return NextResponse.json({ sent, failed });
}
```

- [ ] **Step 2: Register the cron in vercel.json**

Open `apps/web/vercel.json`. It currently has one cron entry. Add a second:

```json
{
  "crons": [
    { "path": "/api/cron/sync-cameras", "schedule": "0 9 * * *" },
    { "path": "/api/cron/notify-contributors", "schedule": "*/1 * * * *" }
  ]
}
```

Vercel Hobby allows daily-only crons, so for hobby deployments change the second schedule to `0 * * * *` (hourly). For Pro, the every-minute schedule is correct.

- [ ] **Step 3: Update middleware matcher**

Confirm `apps/web/middleware.ts` already excludes `/api/cron`. (It does.) No change needed — the existing `api/cron` exclusion covers `api/cron/notify-contributors`.

- [ ] **Step 4: Smoke test**

After Task 18 enqueued at least one notification row, call:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/notify-contributors
```

Expected JSON: `{ "sent": 1, "failed": 0 }`. Verify in DB:

```ts
mcp__supabase__execute_sql({
  project_id: "stfxqaocnyhkumapmbjw",
  query: "SELECT status, channel, sent_at, error FROM contributor_notifications ORDER BY created_at DESC LIMIT 1;",
})
```

Expected: `status='sent'`, `channel='log'` (assuming no Twilio env), `sent_at` non-null.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/cron/notify-contributors/route.ts apps/web/vercel.json
git commit -m "feat(contribute): cron drains queued SMS notifications via Twilio or log"
```

---

### Task 20: Single-incident detail page (`/c/[token]/i/[incident_id]`)

**Files:**
- Create: `apps/web/app/c/[token]/i/[incident_id]/page.tsx`

- [ ] **Step 1: Implement**

```tsx
import { notFound } from "next/navigation";
import { adminClient } from "@/lib/supabase/admin";
import { getContributor } from "../../layout";

export const dynamic = "force-dynamic";

export default async function ContributorIncidentPage({
  params,
}: {
  params: Promise<{ token: string; incident_id: string }>;
}) {
  const { token, incident_id } = await params;
  const contributor = await getContributor(token);
  if (!contributor) notFound();

  const supabase = adminClient();
  const { data: incident } = await supabase
    .from("incidents")
    .select("id, title, severity, notes, created_at")
    .eq("id", incident_id)
    .maybeSingle();
  if (!incident) notFound();

  const { data: cams } = await supabase
    .from("cameras")
    .select("id, description")
    .eq("contributor_id", contributor.id);

  return (
    <article className="space-y-6 p-6">
      <header>
        <h1 className="font-mono text-sm uppercase tracking-widest">{incident.title}</h1>
        <p className="mt-1 font-mono text-[10px] text-neutral-500">
          {incident.severity} · {new Date(incident.created_at).toLocaleString()}
        </p>
      </header>
      <section>
        <h2 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          Your cameras (potential contributors)
        </h2>
        <ul className="divide-y divide-neutral-200 border border-neutral-200">
          {(cams ?? []).map((c) => (
            <li key={c.id} className="p-3 font-mono text-xs">
              {c.description}
            </li>
          ))}
        </ul>
      </section>
      {incident.notes && (
        <section>
          <h2 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            Notes
          </h2>
          <p className="font-mono text-xs">{incident.notes}</p>
        </section>
      )}
    </article>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/c/[token]/i/
git commit -m "feat(contribute): /c/[token]/i/[incident_id] detail page"
```

---

### Task 21: Workspace test run + final smoke

**Files:** none

- [ ] **Step 1: Full workspace typecheck + test**

```bash
set -a; source apps/web/.env.local; set +a
pnpm typecheck
pnpm test
```

Expected: both exit 0. Test suite includes the four new contribute unit tests (token, code, sms, ratelimit) — should report at least 12 new test assertions on top of the existing 6.

- [ ] **Step 2: Full build**

```bash
pnpm build
```

Expected: success.

- [ ] **Step 3: Manual end-to-end demo run**

1. POST to `/api/contribute` with valid body. Server log shows the SMS body with the 6-digit code.
2. Open `/c/<token>/verify`, enter the code. Redirected to `/c/<token>`.
3. Dashboard shows the camera as `Active`.
4. Insert a synthetic incident in Supabase at the contributor's lat/lng (Task 18 smoke step). Confirm a row in `contributor_notifications` with `status='queued'`.
5. Curl the notify-contributors cron route. Confirm row updates to `status='sent'`.
6. Refresh the dashboard. "Recent activity" shows the notification.
7. Click `Remove me` → confirm. Dashboard 404s on refresh.

- [ ] **Step 4: Commit any final tweaks**

If anything was off, fix it and commit. If the demo passes cleanly:

```bash
git add -A
git commit -m "chore: open-contribution end-to-end smoke verified" --allow-empty
```

---

## Validation checklist (run at the end)

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0; contribute unit tests pass (token, code, sms, ratelimit)
- [ ] `pnpm build` produces `.next` output successfully
- [ ] POST `/api/contribute` with valid body creates a contributor + camera, returns the dashboard URL, and the SMS body is logged
- [ ] POST `/api/contribute/verify` with the correct code flips `verified_at` and `cameras.is_active`
- [ ] Visiting `/c/[token]` renders the dashboard for a verified contributor
- [ ] Inserting a synthetic incident near the contributor enqueues a row in `contributor_notifications`
- [ ] The notify-contributors cron route drains queued rows; `status='sent'` afterwards
- [ ] POST `/api/contribute/remove` 404s the dashboard on next visit and sets `cameras.is_active = false`

## Out of scope (deferred)

- Per-camera on/off toggle in the dashboard (FK + endpoint exist; UI affordance is a follow-up)
- Real `camera_policies` table (the Python enforcer's concern; we expose `DEFAULT_POLICY` for handoff)
- Policy editor UI
- Bulk camera registration
- Camera health monitoring beyond the wall's "no signal" heuristic
- HLS tunneling for cameras behind NAT
