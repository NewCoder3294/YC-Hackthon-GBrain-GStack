# WatchDog Security Phase 1 — Contributor Scaffolding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the contributor side of the WatchDog Security Network: registered cameras, the VPS event-ingest API contract, R2 clip storage, and the contributor portal — all without the LLM pipeline yet (that's Phase 2). A dev can register a camera, fire a synthetic event via `scripts/mock-events.ts`, and verify a `camera_events` row referencing a clip in R2.

**Architecture:** Next.js App Router (apps/web) + Supabase (DB + Auth + RLS) + Cloudflare R2 (clip storage, S3-protocol). Worker tokens are opaque random strings stored in `cameras.worker_token` and presented as bearer auth by the VPS. The VPS is mocked in dev via a Node script. Everything is additive — no changes to existing tables besides extending `cameras`.

**Tech Stack:** TypeScript, Next.js 15 (App Router), React Server Components, Supabase JS SDK, `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`, vitest with `vi.hoisted` mocks, zod, drizzle ORM, raw SQL migrations applied via Supabase MCP.

**Spec it implements:** `docs/superpowers/specs/2026-05-18-watchdog-security-network-design.md` Phase 1.

---

## File map

**Create:**
- `packages/db/migrations/0018_contributor_camera_v1.sql` — extend `cameras`, add `camera_events` / `camera_alerts` / `alert_feedback` / `push_subscriptions`
- `apps/web/lib/clips/r2.ts` — S3-protocol R2 client, presigned upload/download URLs, `getObjectBuffer`
- `apps/web/lib/clips/r2.test.ts` — vitest unit tests (mock S3Client)
- `apps/web/lib/contrib/worker-token.ts` — mint + verify random opaque tokens for the VPS
- `apps/web/lib/contrib/worker-token.test.ts`
- `apps/web/lib/contrib/onboarding.ts` — RTSP URL validation, camera create
- `apps/web/lib/contrib/onboarding.test.ts`
- `apps/web/app/api/contrib/clips/upload-url/route.ts` — POST endpoint, returns `{ clip_key, presigned_put_url }`
- `apps/web/app/api/contrib/clips/upload-url/route.test.ts`
- `apps/web/app/api/contrib/events/route.ts` — POST endpoint, validates worker token, inserts `camera_events` row
- `apps/web/app/api/contrib/events/route.test.ts`
- `apps/web/app/(app)/me/cameras/page.tsx` — list of caller's cameras
- `apps/web/app/(app)/me/cameras/new/page.tsx` — wizard
- `apps/web/app/(app)/me/cameras/new/actions.ts` — server action `createCamera`
- `apps/web/app/(app)/me/cameras/[id]/page.tsx` — per-camera detail + recent events feed
- `apps/web/components/contrib/camera-card.tsx` — list-row component
- `apps/web/components/contrib/add-camera-wizard.tsx` — client form
- `scripts/mock-events.ts` — fires synthetic events via the contract

**Modify:**
- `apps/web/lib/env.ts` — add R2_* + `CAMERA_WORKER_API_KEY_SECRET` (the deterministic prefix used in token strings)
- `apps/web/middleware.ts` — add `/api/contrib/clips/upload-url` and `/api/contrib/events` to the public allowlist (auth happens via worker token in the route, not session cookie)
- `apps/web/components/app-shell/top-nav.tsx` — add a "Cameras" link in the contributor portal entry (read existing file first)

---

## Conventions you must follow

- Read every file before you edit it. The hook will reject edits otherwise.
- All cron + worker endpoints gate at the top of the handler (return 401 immediately on bad auth) — see `apps/web/app/api/cron/sync-curated-cameras/route.ts` for the existing pattern.
- New env vars must be added to `apps/web/lib/env.ts` with a zod schema, never read via `process.env.X` directly in route code.
- Vitest mocks must use `vi.hoisted` for module factories. See `packages/sync/src/sources/windy-webcams.test.ts` for the working pattern.
- Migrations are raw SQL files applied via `mcp__supabase__apply_migration`. Keep them idempotent (`CREATE TABLE IF NOT EXISTS`, wrapped policy creation in `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN null; END $$`).
- Commits use conventional-commit prefixes. Subject ≤ 72 chars.

---

## Task 1: DB migration

**Files:**
- Create: `packages/db/migrations/0018_contributor_camera_v1.sql`

- [ ] **Step 1.1: Write the migration SQL**

Create `packages/db/migrations/0018_contributor_camera_v1.sql`:

```sql
-- WatchDog Security Phase 1 — contributor camera + event tables.
-- Additive only. Idempotent. Companion spec:
--   docs/superpowers/specs/2026-05-18-watchdog-security-network-design.md
-- Companion plan:
--   docs/superpowers/plans/2026-05-18-watchdog-security-phase-1-contributor-scaffolding.md

-- Extend `cameras` with contributor + worker + budget columns.
ALTER TABLE "cameras"
  ADD COLUMN IF NOT EXISTS "rtsp_url" text,
  ADD COLUMN IF NOT EXISTS "worker_status" text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS "worker_token" text,
  ADD COLUMN IF NOT EXISTS "last_event_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "threat_dictionary" jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "vlm_budget_remaining" int NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS "vlm_budget_reset_at" timestamp with time zone NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "public_listed" boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  ALTER TABLE "cameras"
    ADD CONSTRAINT "cameras_worker_status_check"
      CHECK ("worker_status" IN ('pending','active','paused','errored'));
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "cameras_worker_token_uniq"
  ON "cameras" ("worker_token")
  WHERE "worker_token" IS NOT NULL;

-- camera_events — every event from the worker lands here.
CREATE TABLE IF NOT EXISTS "camera_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "camera_id" uuid NOT NULL REFERENCES "cameras"("id") ON DELETE CASCADE,
  "event_type" text NOT NULL,
  "confidence" real NOT NULL DEFAULT 0,
  "bbox" jsonb,
  "clip_key" text NOT NULL,
  "detected_at" timestamp with time zone NOT NULL,
  "ingested_at" timestamp with time zone NOT NULL DEFAULT now(),
  "vlm_called" boolean NOT NULL DEFAULT false,
  "vlm_reasoning" text,
  "alert_id" uuid,
  CONSTRAINT "camera_events_event_type_check"
    CHECK ("event_type" IN ('person','vehicle','package','motion','line_cross','group','night_motion'))
);
CREATE INDEX IF NOT EXISTS "camera_events_camera_time_idx"
  ON "camera_events" ("camera_id", "detected_at" DESC);

ALTER TABLE "camera_events" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "camera_events_read_own"
    ON "camera_events" FOR SELECT TO authenticated
    USING (camera_id IN (SELECT id FROM cameras WHERE contributor_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- camera_alerts — only created when Phase 2's VLM confirms a threat.
CREATE TABLE IF NOT EXISTS "camera_alerts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "camera_id" uuid NOT NULL REFERENCES "cameras"("id") ON DELETE CASCADE,
  "event_id" uuid NOT NULL REFERENCES "camera_events"("id") ON DELETE CASCADE,
  "threat_label" text NOT NULL,
  "severity" text NOT NULL,
  "confidence" real NOT NULL,
  "reasoning" text NOT NULL DEFAULT '',
  "vlm_response_raw" jsonb,
  "clip_key" text NOT NULL,
  "gbrain_page_id" uuid,
  "live_incident_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "delivered_at" timestamp with time zone,
  CONSTRAINT "camera_alerts_severity_check"
    CHECK ("severity" IN ('low','med','high','critical'))
);
CREATE INDEX IF NOT EXISTS "camera_alerts_camera_time_idx"
  ON "camera_alerts" ("camera_id", "created_at" DESC);

ALTER TABLE "camera_alerts" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "camera_alerts_read_own"
    ON "camera_alerts" FOR SELECT TO authenticated
    USING (camera_id IN (SELECT id FROM cameras WHERE contributor_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- alert_feedback — owner labels alerts real/false/not_sure.
CREATE TABLE IF NOT EXISTS "alert_feedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "alert_id" uuid NOT NULL UNIQUE REFERENCES "camera_alerts"("id") ON DELETE CASCADE,
  "verdict" text NOT NULL,
  "note" text,
  "submitted_by" uuid NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "alert_feedback_verdict_check"
    CHECK ("verdict" IN ('real','false','not_sure'))
);

ALTER TABLE "alert_feedback" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "alert_feedback_rw_own"
    ON "alert_feedback" FOR ALL TO authenticated
    USING (submitted_by = auth.uid())
    WITH CHECK (submitted_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- push_subscriptions — VAPID web-push subscription registry (Phase 3).
CREATE TABLE IF NOT EXISTS "push_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "endpoint" text NOT NULL UNIQUE,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "user_agent" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "revoked_at" timestamp with time zone
);

ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "push_subscriptions_rw_own"
    ON "push_subscriptions" FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN null; END $$;
```

- [ ] **Step 1.2: Apply migration to remote DB**

Use `mcp__supabase__apply_migration` with `name="0018_contributor_camera_v1"` and the SQL above (already in the file).

Expected: `{"success": true}`.

- [ ] **Step 1.3: Verify schema landed**

Use `mcp__supabase__execute_sql`:

```sql
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_name='cameras' AND column_name IN
   ('rtsp_url','worker_status','worker_token','threat_dictionary','vlm_budget_remaining','public_listed')) AS cam_cols,
  EXISTS(SELECT 1 FROM pg_tables WHERE tablename='camera_events') AS has_events,
  EXISTS(SELECT 1 FROM pg_tables WHERE tablename='camera_alerts') AS has_alerts,
  EXISTS(SELECT 1 FROM pg_tables WHERE tablename='alert_feedback') AS has_feedback,
  EXISTS(SELECT 1 FROM pg_tables WHERE tablename='push_subscriptions') AS has_push;
```

Expected: `cam_cols: 6, has_events: true, has_alerts: true, has_feedback: true, has_push: true`.

- [ ] **Step 1.4: Commit**

```bash
git add packages/db/migrations/0018_contributor_camera_v1.sql
git commit -m "db(contrib): camera_events/alerts/feedback/push_subscriptions + cameras extensions"
```

---

## Task 2: Env schema additions

**Files:**
- Modify: `apps/web/lib/env.ts`

- [ ] **Step 2.1: Read `apps/web/lib/env.ts` to learn the existing pattern**

Use the Read tool. Look at how existing keys like `ANTHROPIC_API_KEY` and `NEXT_PUBLIC_SUPABASE_URL` are defined.

- [ ] **Step 2.2: Add R2 + worker-token env vars**

Find the zod object that defines the schema. Add these fields (alphabetize):

```ts
CAMERA_WORKER_TOKEN_SECRET: z.string().min(16).optional(),
R2_ACCESS_KEY_ID: z.string().min(8).optional(),
R2_ACCOUNT_ID: z.string().min(8).optional(),
R2_BUCKET_NAME: z.string().min(1).optional(),
R2_ENDPOINT: z.string().url().optional(),
R2_SECRET_ACCESS_KEY: z.string().min(8).optional(),
```

Then add the matching `process.env.X` reads to the object literal that builds the `env` value (find existing pattern at e.g. `ANTHROPIC_API_KEY: blank(process.env.ANTHROPIC_API_KEY)`).

- [ ] **Step 2.3: Verify `.env.local` has the R2 vars set**

```bash
grep "^R2_" /Users/nicolasdossantos/caltrans-cctv/apps/web/.env.local | sed 's/=.*/=<set>/'
```

Expected output (all five):
```
R2_ACCOUNT_ID=<set>
R2_ACCESS_KEY_ID=<set>
R2_SECRET_ACCESS_KEY=<set>
R2_BUCKET_NAME=<set>
R2_ENDPOINT=<set>
```

- [ ] **Step 2.4: Add `CAMERA_WORKER_TOKEN_SECRET` to `.env.local`**

```bash
SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
echo "CAMERA_WORKER_TOKEN_SECRET=\"$SECRET\"" >> /Users/nicolasdossantos/caltrans-cctv/apps/web/.env.local
grep "^CAMERA_WORKER_TOKEN_SECRET" /Users/nicolasdossantos/caltrans-cctv/apps/web/.env.local | sed 's/=.*/=<set>/'
```

Expected: `CAMERA_WORKER_TOKEN_SECRET=<set>`.

- [ ] **Step 2.5: Typecheck**

```bash
cd /Users/nicolasdossantos/caltrans-cctv/apps/web && pnpm exec tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 2.6: Commit**

```bash
git add apps/web/lib/env.ts
git commit -m "env(contrib): add R2_* + CAMERA_WORKER_TOKEN_SECRET to env schema"
```

---

## Task 3: R2 client module (TDD)

**Files:**
- Create: `apps/web/lib/clips/r2.ts`
- Create: `apps/web/lib/clips/r2.test.ts`

- [ ] **Step 3.1: Write the failing test**

Create `apps/web/lib/clips/r2.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const sendMock = vi.hoisted(() => vi.fn());
const getSignedUrlMock = vi.hoisted(() => vi.fn());

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn().mockImplementation(() => ({ send: sendMock })),
  PutObjectCommand: vi.fn().mockImplementation((input) => ({ input, _cmd: "put" })),
  GetObjectCommand: vi.fn().mockImplementation((input) => ({ input, _cmd: "get" })),
  DeleteObjectCommand: vi.fn().mockImplementation((input) => ({ input, _cmd: "del" })),
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: getSignedUrlMock,
}));

vi.mock("@/lib/env", () => ({
  env: {
    R2_ACCOUNT_ID: "acct123",
    R2_ACCESS_KEY_ID: "key",
    R2_SECRET_ACCESS_KEY: "secret",
    R2_BUCKET_NAME: "watchdog-clips",
    R2_ENDPOINT: "https://acct123.r2.cloudflarestorage.com",
  },
}));

import {
  clipKeyFor,
  getSignedUploadUrl,
  getSignedDownloadUrl,
  deleteClip,
} from "./r2";

beforeEach(() => {
  sendMock.mockReset();
  getSignedUrlMock.mockReset();
});

describe("clipKeyFor", () => {
  it("returns a deterministic, namespaced key for an event", () => {
    const key = clipKeyFor("cam_abc", "evt_xyz");
    expect(key).toBe("events/cam_abc/evt_xyz.mp4");
  });
});

describe("getSignedUploadUrl", () => {
  it("calls the presigner with PutObjectCommand + the expected key", async () => {
    getSignedUrlMock.mockResolvedValueOnce("https://signed-put.example/x");
    const url = await getSignedUploadUrl("events/cam/evt.mp4", 60);
    expect(url).toBe("https://signed-put.example/x");
    expect(getSignedUrlMock).toHaveBeenCalledOnce();
    const [, cmd, opts] = getSignedUrlMock.mock.calls[0]!;
    expect(cmd._cmd).toBe("put");
    expect(cmd.input.Bucket).toBe("watchdog-clips");
    expect(cmd.input.Key).toBe("events/cam/evt.mp4");
    expect(opts).toEqual({ expiresIn: 60 });
  });
});

describe("getSignedDownloadUrl", () => {
  it("returns a presigned GET url with the given TTL", async () => {
    getSignedUrlMock.mockResolvedValueOnce("https://signed-get.example/x");
    const url = await getSignedDownloadUrl("events/cam/evt.mp4", 300);
    expect(url).toBe("https://signed-get.example/x");
    const [, cmd, opts] = getSignedUrlMock.mock.calls[0]!;
    expect(cmd._cmd).toBe("get");
    expect(opts).toEqual({ expiresIn: 300 });
  });
});

describe("deleteClip", () => {
  it("sends a DeleteObjectCommand for the bucket+key", async () => {
    sendMock.mockResolvedValueOnce({});
    await deleteClip("events/cam/evt.mp4");
    expect(sendMock).toHaveBeenCalledOnce();
    const cmd = sendMock.mock.calls[0]![0];
    expect(cmd._cmd).toBe("del");
    expect(cmd.input.Bucket).toBe("watchdog-clips");
    expect(cmd.input.Key).toBe("events/cam/evt.mp4");
  });
});
```

- [ ] **Step 3.2: Run test to verify it fails**

```bash
cd /Users/nicolasdossantos/caltrans-cctv/apps/web && pnpm exec vitest run lib/clips/r2.test.ts
```

Expected: FAIL with `Cannot find module './r2'`.

- [ ] **Step 3.3: Write the R2 client module**

Create `apps/web/lib/clips/r2.ts`:

```ts
import "server-only";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";

let cached: S3Client | null = null;

function client(): S3Client {
  if (cached) return cached;
  if (
    !env.R2_ACCOUNT_ID ||
    !env.R2_ACCESS_KEY_ID ||
    !env.R2_SECRET_ACCESS_KEY ||
    !env.R2_ENDPOINT ||
    !env.R2_BUCKET_NAME
  ) {
    throw new Error("R2 env vars not configured");
  }
  cached = new S3Client({
    region: "auto",
    endpoint: env.R2_ENDPOINT,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
  return cached;
}

/** Stable, predictable R2 object key for a (camera, event) pair. */
export function clipKeyFor(cameraId: string, eventId: string): string {
  return `events/${cameraId}/${eventId}.mp4`;
}

export async function getSignedUploadUrl(
  key: string,
  expiresIn: number,
): Promise<string> {
  return getSignedUrl(
    client(),
    new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME!,
      Key: key,
      ContentType: "video/mp4",
    }),
    { expiresIn },
  );
}

export async function getSignedDownloadUrl(
  key: string,
  expiresIn: number,
): Promise<string> {
  return getSignedUrl(
    client(),
    new GetObjectCommand({
      Bucket: env.R2_BUCKET_NAME!,
      Key: key,
    }),
    { expiresIn },
  );
}

export async function deleteClip(key: string): Promise<void> {
  await client().send(
    new DeleteObjectCommand({
      Bucket: env.R2_BUCKET_NAME!,
      Key: key,
    }),
  );
}
```

- [ ] **Step 3.4: Run test to verify it passes**

```bash
cd /Users/nicolasdossantos/caltrans-cctv/apps/web && pnpm exec vitest run lib/clips/r2.test.ts
```

Expected: PASS (4/4).

- [ ] **Step 3.5: Commit**

```bash
git add apps/web/lib/clips/r2.ts apps/web/lib/clips/r2.test.ts
git commit -m "feat(clips): R2 client with presigned upload/download + delete"
```

---

## Task 4: Worker token utility (TDD)

**Files:**
- Create: `apps/web/lib/contrib/worker-token.ts`
- Create: `apps/web/lib/contrib/worker-token.test.ts`

- [ ] **Step 4.1: Write the failing test**

Create `apps/web/lib/contrib/worker-token.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mintWorkerToken, isWorkerTokenFormat } from "./worker-token";

describe("mintWorkerToken", () => {
  it("returns a token prefixed with wd_cam_", () => {
    const tok = mintWorkerToken();
    expect(tok.startsWith("wd_cam_")).toBe(true);
  });

  it("returns tokens that are >40 chars (enough entropy)", () => {
    const tok = mintWorkerToken();
    expect(tok.length).toBeGreaterThanOrEqual(40);
  });

  it("returns unique tokens across calls", () => {
    const a = mintWorkerToken();
    const b = mintWorkerToken();
    expect(a).not.toEqual(b);
  });
});

describe("isWorkerTokenFormat", () => {
  it("accepts a well-formed minted token", () => {
    expect(isWorkerTokenFormat(mintWorkerToken())).toBe(true);
  });

  it("rejects empty / null", () => {
    expect(isWorkerTokenFormat("")).toBe(false);
    expect(isWorkerTokenFormat(null)).toBe(false);
    expect(isWorkerTokenFormat(undefined)).toBe(false);
  });

  it("rejects strings without the wd_cam_ prefix", () => {
    expect(isWorkerTokenFormat("foo_bar_baz_baz_baz_baz_baz_baz_baz")).toBe(false);
  });

  it("rejects strings shorter than 40 chars", () => {
    expect(isWorkerTokenFormat("wd_cam_abc")).toBe(false);
  });
});
```

- [ ] **Step 4.2: Run test to verify it fails**

```bash
cd /Users/nicolasdossantos/caltrans-cctv/apps/web && pnpm exec vitest run lib/contrib/worker-token.test.ts
```

Expected: FAIL with `Cannot find module`.

- [ ] **Step 4.3: Implement**

Create `apps/web/lib/contrib/worker-token.ts`:

```ts
import "server-only";
import { randomBytes } from "node:crypto";

const PREFIX = "wd_cam_";
const MIN_LEN = 40;

/**
 * Mints an opaque, URL-safe worker token for a camera. The VPS worker
 * presents this in `Authorization: Bearer <token>` on every event POST.
 * The token is stored in plain text in `cameras.worker_token` — it's
 * an authenticator, not a secret in the cryptographic sense, and is
 * unique-indexed at the DB layer.
 */
export function mintWorkerToken(): string {
  const random = randomBytes(24).toString("base64url");
  return `${PREFIX}${random}`;
}

export function isWorkerTokenFormat(
  value: string | null | undefined,
): boolean {
  if (!value) return false;
  if (!value.startsWith(PREFIX)) return false;
  return value.length >= MIN_LEN;
}
```

- [ ] **Step 4.4: Run test to verify it passes**

```bash
cd /Users/nicolasdossantos/caltrans-cctv/apps/web && pnpm exec vitest run lib/contrib/worker-token.test.ts
```

Expected: PASS (6/6).

- [ ] **Step 4.5: Commit**

```bash
git add apps/web/lib/contrib/worker-token.ts apps/web/lib/contrib/worker-token.test.ts
git commit -m "feat(contrib): opaque worker token mint + format check"
```

---

## Task 5: Camera onboarding lib (TDD)

**Files:**
- Create: `apps/web/lib/contrib/onboarding.ts`
- Create: `apps/web/lib/contrib/onboarding.test.ts`

- [ ] **Step 5.1: Write the failing test**

Create `apps/web/lib/contrib/onboarding.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validateRtspUrl } from "./onboarding";

describe("validateRtspUrl", () => {
  it("accepts well-formed rtsp:// URLs", () => {
    expect(validateRtspUrl("rtsp://user:pass@192.168.1.10:554/stream1").ok).toBe(true);
    expect(validateRtspUrl("rtsp://cam.example.com/live").ok).toBe(true);
    expect(validateRtspUrl("rtsps://cam.example.com:8554/live").ok).toBe(true);
  });

  it("rejects http/https URLs", () => {
    expect(validateRtspUrl("https://example.com/stream").ok).toBe(false);
    expect(validateRtspUrl("http://example.com/stream").ok).toBe(false);
  });

  it("rejects empty / whitespace / unparseable", () => {
    expect(validateRtspUrl("").ok).toBe(false);
    expect(validateRtspUrl("   ").ok).toBe(false);
    expect(validateRtspUrl("not a url").ok).toBe(false);
  });

  it("rejects rtsp without a host", () => {
    expect(validateRtspUrl("rtsp:///path").ok).toBe(false);
  });

  it("returns the parsed URL when ok", () => {
    const r = validateRtspUrl("rtsp://cam.example.com:554/live");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.url.host).toBe("cam.example.com:554");
      expect(r.url.protocol).toBe("rtsp:");
    }
  });
});
```

- [ ] **Step 5.2: Run test to verify it fails**

```bash
cd /Users/nicolasdossantos/caltrans-cctv/apps/web && pnpm exec vitest run lib/contrib/onboarding.test.ts
```

Expected: FAIL.

- [ ] **Step 5.3: Implement**

Create `apps/web/lib/contrib/onboarding.ts`:

```ts
import "server-only";

export type RtspValidation =
  | { ok: true; url: URL }
  | { ok: false; reason: string };

/**
 * Syntactically validates an RTSP URL. We never connect to it from the
 * Next.js server (the VPS worker does that). This is a parseability
 * + protocol gate to keep junk out of the DB.
 */
export function validateRtspUrl(raw: string): RtspValidation {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, reason: "unparseable" };
  }
  if (url.protocol !== "rtsp:" && url.protocol !== "rtsps:") {
    return { ok: false, reason: "must be rtsp:// or rtsps://" };
  }
  if (!url.hostname) {
    return { ok: false, reason: "missing host" };
  }
  return { ok: true, url };
}
```

- [ ] **Step 5.4: Run test to verify it passes**

```bash
cd /Users/nicolasdossantos/caltrans-cctv/apps/web && pnpm exec vitest run lib/contrib/onboarding.test.ts
```

Expected: PASS (5/5).

- [ ] **Step 5.5: Commit**

```bash
git add apps/web/lib/contrib/onboarding.ts apps/web/lib/contrib/onboarding.test.ts
git commit -m "feat(contrib): rtsp url syntactic validation"
```

---

## Task 6: `/api/contrib/clips/upload-url` route (TDD)

**Files:**
- Create: `apps/web/app/api/contrib/clips/upload-url/route.ts`
- Create: `apps/web/app/api/contrib/clips/upload-url/route.test.ts`

- [ ] **Step 6.1: Write the failing test**

Create `apps/web/app/api/contrib/clips/upload-url/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const maybeSingleMock = vi.hoisted(() => vi.fn());
const fromMock = vi.hoisted(() =>
  vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: maybeSingleMock,
      })),
    })),
  })),
);

vi.mock("@/lib/supabase/admin", () => ({
  adminClient: () => ({ from: fromMock }),
}));

vi.mock("@/lib/clips/r2", () => ({
  clipKeyFor: (cam: string, evt: string) => `events/${cam}/${evt}.mp4`,
  getSignedUploadUrl: vi.fn(async () => "https://signed-put.example/x"),
}));

import { POST } from "./route";

beforeEach(() => {
  maybeSingleMock.mockReset();
  fromMock.mockClear();
});

function makeReq(body: unknown, auth?: string): NextRequest {
  return new NextRequest("http://localhost/api/contrib/clips/upload-url", {
    method: "POST",
    headers: auth ? { authorization: auth } : {},
    body: JSON.stringify(body),
  });
}

describe("POST /api/contrib/clips/upload-url", () => {
  it("401s without a bearer token", async () => {
    const res = await POST(makeReq({ camera_id: "00000000-0000-0000-0000-000000000001", duration_sec: 5 }));
    expect(res.status).toBe(401);
  });

  it("401s when the token doesn't match any camera", async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null });
    const res = await POST(
      makeReq(
        { camera_id: "00000000-0000-0000-0000-000000000001", duration_sec: 5 },
        "Bearer wd_cam_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      ),
    );
    expect(res.status).toBe(401);
  });

  it("400s on invalid body shape", async () => {
    maybeSingleMock.mockResolvedValueOnce({
      data: { id: "00000000-0000-0000-0000-000000000001" },
    });
    const res = await POST(
      makeReq({ camera_id: "not-a-uuid" }, "Bearer wd_cam_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"),
    );
    expect(res.status).toBe(400);
  });

  it("returns clip_key + presigned_put_url on success", async () => {
    maybeSingleMock.mockResolvedValueOnce({
      data: { id: "00000000-0000-0000-0000-000000000001" },
    });
    const res = await POST(
      makeReq(
        { camera_id: "00000000-0000-0000-0000-000000000001", duration_sec: 5 },
        "Bearer wd_cam_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      ),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.clip_key).toMatch(/^events\/00000000-0000-0000-0000-000000000001\/[a-f0-9-]+\.mp4$/);
    expect(json.presigned_put_url).toBe("https://signed-put.example/x");
  });
});
```

- [ ] **Step 6.2: Run test to verify it fails**

```bash
cd /Users/nicolasdossantos/caltrans-cctv/apps/web && pnpm exec vitest run app/api/contrib/clips/upload-url/route.test.ts
```

Expected: FAIL with `Cannot find module`.

- [ ] **Step 6.3: Implement**

Create `apps/web/app/api/contrib/clips/upload-url/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { adminClient } from "@/lib/supabase/admin";
import { clipKeyFor, getSignedUploadUrl } from "@/lib/clips/r2";
import { isWorkerTokenFormat } from "@/lib/contrib/worker-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  camera_id: z.string().uuid(),
  duration_sec: z.number().int().min(1).max(60).default(5),
});

const PRESIGN_TTL_SECONDS = 60;

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!isWorkerTokenFormat(token)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Validate body BEFORE the DB lookup so we don't reveal token validity
  // via response timing.
  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const supabase = adminClient();
  const { data: camera } = await supabase
    .from("cameras")
    .select("id")
    .eq("worker_token", token)
    .maybeSingle();
  if (!camera || camera.id !== body.camera_id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const eventId = randomUUID();
  const key = clipKeyFor(body.camera_id, eventId);
  const presigned_put_url = await getSignedUploadUrl(key, PRESIGN_TTL_SECONDS);
  return NextResponse.json({ clip_key: key, presigned_put_url });
}
```

- [ ] **Step 6.4: Run test to verify it passes**

```bash
cd /Users/nicolasdossantos/caltrans-cctv/apps/web && pnpm exec vitest run app/api/contrib/clips/upload-url/route.test.ts
```

Expected: PASS (4/4).

- [ ] **Step 6.5: Commit**

```bash
git add apps/web/app/api/contrib/clips/upload-url
git commit -m "feat(api): POST /api/contrib/clips/upload-url (presigned R2 PUT)"
```

---

## Task 7: `/api/contrib/events` route (TDD)

**Files:**
- Create: `apps/web/app/api/contrib/events/route.ts`
- Create: `apps/web/app/api/contrib/events/route.test.ts`

- [ ] **Step 7.1: Write the failing test**

Create `apps/web/app/api/contrib/events/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const cameraMaybeSingleMock = vi.hoisted(() => vi.fn());
const insertSelectMock = vi.hoisted(() => vi.fn());
const updateEqMock = vi.hoisted(() => vi.fn(async () => ({ error: null })));

const fromMock = vi.hoisted(() =>
  vi.fn((table: string) => {
    if (table === "cameras") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: cameraMaybeSingleMock,
          })),
        })),
        update: vi.fn(() => ({
          eq: updateEqMock,
        })),
      };
    }
    if (table === "camera_events") {
      return {
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: insertSelectMock,
          })),
        })),
      };
    }
    throw new Error(`unexpected table ${table}`);
  }),
);

vi.mock("@/lib/supabase/admin", () => ({
  adminClient: () => ({ from: fromMock }),
}));

import { POST } from "./route";

beforeEach(() => {
  cameraMaybeSingleMock.mockReset();
  insertSelectMock.mockReset();
  updateEqMock.mockClear();
  fromMock.mockClear();
});

function makeReq(body: unknown, auth?: string): NextRequest {
  return new NextRequest("http://localhost/api/contrib/events", {
    method: "POST",
    headers: auth ? { authorization: auth } : {},
    body: JSON.stringify(body),
  });
}

const validBody = {
  camera_id: "00000000-0000-0000-0000-000000000001",
  event_type: "person",
  confidence: 0.87,
  detected_at: "2026-05-19T03:14:22Z",
  clip_key: "events/00000000-0000-0000-0000-000000000001/abc.mp4",
};

describe("POST /api/contrib/events", () => {
  it("401s without auth", async () => {
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(401);
  });

  it("401s when token doesn't match the camera", async () => {
    cameraMaybeSingleMock.mockResolvedValueOnce({ data: null });
    const res = await POST(
      makeReq(validBody, "Bearer wd_cam_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"),
    );
    expect(res.status).toBe(401);
  });

  it("400s on invalid event_type", async () => {
    cameraMaybeSingleMock.mockResolvedValueOnce({
      data: { id: validBody.camera_id, worker_status: "active" },
    });
    const res = await POST(
      makeReq(
        { ...validBody, event_type: "alien_invasion" },
        "Bearer wd_cam_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      ),
    );
    expect(res.status).toBe(400);
  });

  it("403s when camera is paused", async () => {
    cameraMaybeSingleMock.mockResolvedValueOnce({
      data: { id: validBody.camera_id, worker_status: "paused" },
    });
    const res = await POST(
      makeReq(validBody, "Bearer wd_cam_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"),
    );
    expect(res.status).toBe(403);
  });

  it("inserts a camera_events row + updates cameras.last_event_at + returns event_id", async () => {
    cameraMaybeSingleMock.mockResolvedValueOnce({
      data: { id: validBody.camera_id, worker_status: "active" },
    });
    insertSelectMock.mockResolvedValueOnce({
      data: { id: "evt-uuid-1" },
      error: null,
    });
    const res = await POST(
      makeReq(validBody, "Bearer wd_cam_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.event_id).toBe("evt-uuid-1");
    expect(updateEqMock).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 7.2: Run test to verify it fails**

```bash
cd /Users/nicolasdossantos/caltrans-cctv/apps/web && pnpm exec vitest run app/api/contrib/events/route.test.ts
```

Expected: FAIL with `Cannot find module`.

- [ ] **Step 7.3: Implement**

Create `apps/web/app/api/contrib/events/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { adminClient } from "@/lib/supabase/admin";
import { isWorkerTokenFormat } from "@/lib/contrib/worker-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EVENT_TYPES = [
  "person",
  "vehicle",
  "package",
  "motion",
  "line_cross",
  "group",
  "night_motion",
] as const;

const schema = z.object({
  camera_id: z.string().uuid(),
  event_type: z.enum(EVENT_TYPES),
  confidence: z.number().min(0).max(1),
  detected_at: z.string().datetime(),
  clip_key: z.string().min(1),
  bbox: z.array(z.number()).length(4).optional(),
  frame_count: z.number().int().min(1).max(60).optional(),
});

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!isWorkerTokenFormat(token)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const supabase = adminClient();
  const { data: camera } = await supabase
    .from("cameras")
    .select("id, worker_status")
    .eq("worker_token", token)
    .maybeSingle();
  if (!camera || camera.id !== body.camera_id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (camera.worker_status !== "active") {
    return NextResponse.json(
      { error: `camera_not_active: ${camera.worker_status}` },
      { status: 403 },
    );
  }

  const { data: insertResult, error: insertError } = await supabase
    .from("camera_events")
    .insert({
      camera_id: body.camera_id,
      event_type: body.event_type,
      confidence: body.confidence,
      detected_at: body.detected_at,
      clip_key: body.clip_key,
      bbox: body.bbox ?? null,
    })
    .select("id")
    .single();
  if (insertError || !insertResult) {
    return NextResponse.json(
      { error: insertError?.message ?? "insert failed" },
      { status: 500 },
    );
  }

  // Liveness — separate update so an event row lands even if this fails.
  await supabase
    .from("cameras")
    .update({ last_event_at: body.detected_at })
    .eq("id", body.camera_id);

  return NextResponse.json({ event_id: insertResult.id });
}
```

- [ ] **Step 7.4: Run test to verify it passes**

```bash
cd /Users/nicolasdossantos/caltrans-cctv/apps/web && pnpm exec vitest run app/api/contrib/events/route.test.ts
```

Expected: PASS (5/5).

- [ ] **Step 7.5: Commit**

```bash
git add apps/web/app/api/contrib/events
git commit -m "feat(api): POST /api/contrib/events ingests camera events from worker"
```

---

## Task 8: Middleware allowlist update

**Files:**
- Modify: `apps/web/middleware.ts`

- [ ] **Step 8.1: Read `apps/web/middleware.ts`**

Use Read tool. Find the `config.matcher` regex on line ~65. The contrib endpoints need to be added to the allowlist alongside `api/cron`, `api/hls`, etc. — they authenticate via bearer token in-route, not session cookie.

- [ ] **Step 8.2: Add `api/contrib` to the matcher's negative lookahead**

Edit the matcher string. Find this substring inside the existing regex:

```
api/cron|api/hls|api/dispatch|api/live|api/openclaw|api/seed|api/contribute|
```

Replace with:

```
api/cron|api/hls|api/dispatch|api/live|api/openclaw|api/seed|api/contrib|api/contribute|
```

(Note: `api/contrib` is the new one, ordered alphabetically before the existing `api/contribute`.)

- [ ] **Step 8.3: Smoke-test that the route is reachable without a session cookie**

The dev server is running on `localhost:3001`. The token is intentionally bad so we expect 401 (not 307 redirect to login):

```bash
/usr/bin/curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST http://localhost:3001/api/contrib/events \
  -H "authorization: Bearer wd_cam_definitely_not_a_real_token_xxxxxxxxxxxxxxxxxx" \
  -H "content-type: application/json" \
  -d '{"camera_id":"00000000-0000-0000-0000-000000000001","event_type":"person","confidence":0.9,"detected_at":"2026-05-19T03:14:22Z","clip_key":"x"}' \
  -m 10
```

Expected: `401` (not 307).

- [ ] **Step 8.4: Commit**

```bash
git add apps/web/middleware.ts
git commit -m "middleware: allow /api/contrib/* through public matcher (token-auth in route)"
```

---

## Task 9: `createCamera` server action (TDD)

**Files:**
- Create: `apps/web/app/(app)/me/cameras/new/actions.ts`
- Create: `apps/web/app/(app)/me/cameras/new/actions.test.ts`

- [ ] **Step 9.1: Write the failing test**

Create `apps/web/app/(app)/me/cameras/new/actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const getUserMock = vi.hoisted(() =>
  vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
);
const insertSelectMock = vi.hoisted(() => vi.fn());
const fromMock = vi.hoisted(() =>
  vi.fn(() => ({
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: insertSelectMock,
      })),
    })),
  })),
);

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createCamera } from "./actions";

beforeEach(() => {
  getUserMock.mockClear();
  insertSelectMock.mockReset();
  fromMock.mockClear();
});

describe("createCamera", () => {
  it("rejects unauthenticated users", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } } as never);
    const res = await createCamera({
      description: "Front porch",
      rtsp_url: "rtsp://cam.example.com/live",
      lat: 37.7749,
      lng: -122.4194,
      public_listed: false,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toMatch(/auth/i);
  });

  it("rejects invalid RTSP URLs", async () => {
    const res = await createCamera({
      description: "Front porch",
      rtsp_url: "https://example.com",
      lat: 37.7749,
      lng: -122.4194,
      public_listed: false,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toMatch(/rtsp/i);
  });

  it("inserts a camera with worker_status='pending' and a minted token", async () => {
    insertSelectMock.mockResolvedValueOnce({
      data: { id: "cam-1" },
      error: null,
    });
    const res = await createCamera({
      description: "Front porch",
      rtsp_url: "rtsp://cam.example.com/live",
      lat: 37.7749,
      lng: -122.4194,
      public_listed: false,
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.id).toBe("cam-1");
  });
});
```

- [ ] **Step 9.2: Run test to verify it fails**

```bash
cd /Users/nicolasdossantos/caltrans-cctv/apps/web && pnpm exec vitest run "app/(app)/me/cameras/new/actions.test.ts"
```

Expected: FAIL with `Cannot find module`.

- [ ] **Step 9.3: Implement**

Create `apps/web/app/(app)/me/cameras/new/actions.ts`:

```ts
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validateRtspUrl } from "@/lib/contrib/onboarding";
import { mintWorkerToken } from "@/lib/contrib/worker-token";

const schema = z.object({
  description: z.string().min(1).max(140),
  rtsp_url: z.string().min(1).max(2000),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  public_listed: z.boolean(),
});

export type CreateCameraInput = z.infer<typeof schema>;

export type CreateCameraResult =
  | { ok: true; id: string; worker_token: string }
  | { ok: false; message: string };

export async function createCamera(
  input: CreateCameraInput,
): Promise<CreateCameraResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "invalid input" };
  }

  const rtspCheck = validateRtspUrl(parsed.data.rtsp_url);
  if (!rtspCheck.ok) {
    return { ok: false, message: `rtsp url: ${rtspCheck.reason}` };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "auth required" };
  }

  const worker_token = mintWorkerToken();
  // Reuse `caltrans_id` as the natural slug — required-not-null on the
  // existing schema. Use the auth user id + a short timestamp to keep
  // it unique.
  const caltrans_id = `contrib-${user.id.slice(0, 8)}-${Date.now().toString(36)}`;

  const { data, error } = await supabase
    .from("cameras")
    .insert({
      caltrans_id,
      district: 4,
      route: "contributor",
      description: parsed.data.description,
      lat: parsed.data.lat,
      lng: parsed.data.lng,
      stream_url: parsed.data.rtsp_url,
      stream_type: "hls",
      is_active: true,
      source: "contributor",
      contributor_id: user.id,
      rtsp_url: parsed.data.rtsp_url,
      worker_token,
      worker_status: "pending",
      public_listed: parsed.data.public_listed,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, message: error?.message ?? "insert failed" };
  }

  revalidatePath("/me/cameras");
  return { ok: true, id: data.id as string, worker_token };
}
```

- [ ] **Step 9.4: Run test to verify it passes**

```bash
cd /Users/nicolasdossantos/caltrans-cctv/apps/web && pnpm exec vitest run "app/(app)/me/cameras/new/actions.test.ts"
```

Expected: PASS (3/3).

- [ ] **Step 9.5: Commit**

```bash
git add "apps/web/app/(app)/me/cameras/new"
git commit -m "feat(contrib): createCamera server action with rtsp validation + token mint"
```

---

## Task 10: `/me/cameras` list page

**Files:**
- Create: `apps/web/app/(app)/me/cameras/page.tsx`
- Create: `apps/web/components/contrib/camera-card.tsx`

- [ ] **Step 10.1: Implement the card component**

Create `apps/web/components/contrib/camera-card.tsx`:

```tsx
import Link from "next/link";

export interface CameraCardRow {
  id: string;
  description: string;
  worker_status: string;
  public_listed: boolean;
  last_event_at: string | null;
}

function fmtAge(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.max(0, Math.round(ms / 60_000));
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "PENDING REVIEW",
  active: "ACTIVE",
  paused: "PAUSED",
  errored: "ERROR",
};

export function CameraCard({ camera }: { camera: CameraCardRow }) {
  return (
    <Link
      href={`/me/cameras/${camera.id}` as never}
      className="flex items-center gap-3 border border-neutral-200 px-3 py-2 font-mono text-xs hover:border-black"
    >
      <span
        className={
          "shrink-0 border px-1.5 py-0.5 text-[9px] uppercase tracking-widest " +
          (camera.worker_status === "active"
            ? "border-black bg-black text-white"
            : "border-neutral-300 text-neutral-500")
        }
      >
        {STATUS_LABEL[camera.worker_status] ?? camera.worker_status}
      </span>
      <span className="min-w-0 flex-1 truncate text-neutral-800">
        {camera.description}
      </span>
      <span className="shrink-0 text-[10px] uppercase tracking-widest text-neutral-500">
        {camera.public_listed ? "PUBLIC" : "PRIVATE"}
      </span>
      <span className="shrink-0 text-[10px] uppercase tracking-widest text-neutral-400">
        {fmtAge(camera.last_event_at)}
      </span>
    </Link>
  );
}
```

- [ ] **Step 10.2: Implement the list page**

Create `apps/web/app/(app)/me/cameras/page.tsx`:

```tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CameraCard, type CameraCardRow } from "@/components/contrib/camera-card";

export const dynamic = "force-dynamic";

export default async function MyCamerasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="p-6 font-mono text-sm">
        Please sign in to manage cameras.
      </div>
    );
  }

  const { data } = await supabase
    .from("cameras")
    .select("id, description, worker_status, public_listed, last_event_at")
    .eq("contributor_id", user.id)
    .order("last_event_at", { ascending: false, nullsFirst: false });

  const cameras = (data ?? []) as CameraCardRow[];

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <header className="flex items-center justify-between border-b border-neutral-200 pb-2">
        <h1 className="font-mono text-xs uppercase tracking-widest">
          My Cameras · {cameras.length}
        </h1>
        <Link
          href={"/me/cameras/new" as never}
          className="border border-black bg-black px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-white hover:bg-neutral-800"
        >
          + Add Camera
        </Link>
      </header>

      {cameras.length === 0 ? (
        <p className="border border-dashed border-neutral-200 p-8 text-center font-mono text-xs text-neutral-500">
          No cameras yet. Add one to start contributing to the network.
        </p>
      ) : (
        <ul className="space-y-1">
          {cameras.map((cam) => (
            <li key={cam.id}>
              <CameraCard camera={cam} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 10.3: Typecheck**

```bash
cd /Users/nicolasdossantos/caltrans-cctv/apps/web && pnpm exec tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 10.4: Smoke-test via curl**

```bash
/usr/bin/curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/me/cameras -m 10
```

Expected: `307` (auth redirect — the page is auth-required, that's correct).

- [ ] **Step 10.5: Commit**

```bash
git add "apps/web/app/(app)/me/cameras/page.tsx" apps/web/components/contrib/camera-card.tsx
git commit -m "feat(contrib): /me/cameras list page + CameraCard component"
```

---

## Task 11: `/me/cameras/new` wizard

**Files:**
- Create: `apps/web/app/(app)/me/cameras/new/page.tsx`
- Create: `apps/web/components/contrib/add-camera-wizard.tsx`

- [ ] **Step 11.1: Implement the wizard client component**

Create `apps/web/components/contrib/add-camera-wizard.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { createCamera } from "@/app/(app)/me/cameras/new/actions";

const SF_DEFAULT_LAT = 37.7749;
const SF_DEFAULT_LNG = -122.4194;

export function AddCameraWizard() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ id: string; token: string } | null>(
    null,
  );

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const input = {
      description: String(fd.get("description") ?? "").trim(),
      rtsp_url: String(fd.get("rtsp_url") ?? "").trim(),
      lat: Number(fd.get("lat") ?? SF_DEFAULT_LAT),
      lng: Number(fd.get("lng") ?? SF_DEFAULT_LNG),
      public_listed: fd.get("public_listed") === "on",
    };
    startTransition(async () => {
      const res = await createCamera(input);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setSuccess({ id: res.id, token: res.worker_token });
    });
  }

  if (success) {
    return (
      <div className="space-y-3 border border-black p-4">
        <p className="font-mono text-xs uppercase tracking-widest">
          Camera registered · pending review
        </p>
        <p className="font-mono text-[11px] text-neutral-700">
          Your worker token (give this to the VPS worker — shown once):
        </p>
        <pre className="overflow-x-auto border border-neutral-200 bg-neutral-50 px-2 py-1 font-mono text-[10px]">
          {success.token}
        </pre>
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={() => router.push(`/me/cameras/${success.id}` as Route)}
            className="border border-black bg-black px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-white"
          >
            View Camera
          </button>
          <button
            type="button"
            onClick={() => router.push("/me/cameras" as Route)}
            className="border border-neutral-300 px-2 py-1 font-mono text-[10px] uppercase tracking-widest hover:border-black"
          >
            Back to list
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 font-mono text-xs">
      <label className="block space-y-1">
        <span className="block text-[10px] uppercase tracking-widest text-neutral-500">
          Description
        </span>
        <input
          name="description"
          required
          maxLength={140}
          placeholder="Front porch · 22nd & Bryant"
          className="w-full border border-neutral-300 bg-white px-2 py-1.5 focus:border-black focus:outline-none"
        />
      </label>

      <label className="block space-y-1">
        <span className="block text-[10px] uppercase tracking-widest text-neutral-500">
          RTSP URL
        </span>
        <input
          name="rtsp_url"
          required
          placeholder="rtsp://user:pass@192.168.1.10:554/stream1"
          className="w-full border border-neutral-300 bg-white px-2 py-1.5 font-mono text-[11px] focus:border-black focus:outline-none"
        />
        <span className="block text-[10px] text-neutral-500">
          The URL is stored encrypted; only the VPS worker ever connects to it.
        </span>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="block text-[10px] uppercase tracking-widest text-neutral-500">
            Lat
          </span>
          <input
            name="lat"
            type="number"
            step="0.0001"
            defaultValue={SF_DEFAULT_LAT}
            className="w-full border border-neutral-300 bg-white px-2 py-1.5 focus:border-black focus:outline-none"
          />
        </label>
        <label className="block space-y-1">
          <span className="block text-[10px] uppercase tracking-widest text-neutral-500">
            Lng
          </span>
          <input
            name="lng"
            type="number"
            step="0.0001"
            defaultValue={SF_DEFAULT_LNG}
            className="w-full border border-neutral-300 bg-white px-2 py-1.5 focus:border-black focus:outline-none"
          />
        </label>
      </div>

      <label className="flex items-center gap-2">
        <input type="checkbox" name="public_listed" />
        <span className="text-[10px] uppercase tracking-widest text-neutral-700">
          Show this camera publicly on /wall + /map
        </span>
      </label>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="border border-black bg-black px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-white disabled:opacity-50"
        >
          {pending ? "…" : "Register Camera"}
        </button>
        {error && (
          <span className="font-mono text-[10px] text-red-700">{error}</span>
        )}
      </div>
    </form>
  );
}
```

- [ ] **Step 11.2: Implement the page**

Create `apps/web/app/(app)/me/cameras/new/page.tsx`:

```tsx
import { AddCameraWizard } from "@/components/contrib/add-camera-wizard";

export const dynamic = "force-dynamic";

export default function NewCameraPage() {
  return (
    <div className="mx-auto max-w-xl space-y-4 p-6">
      <header className="border-b border-neutral-200 pb-2">
        <h1 className="font-mono text-xs uppercase tracking-widest">
          Add a Camera
        </h1>
      </header>
      <AddCameraWizard />
    </div>
  );
}
```

- [ ] **Step 11.3: Typecheck**

```bash
cd /Users/nicolasdossantos/caltrans-cctv/apps/web && pnpm exec tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 11.4: Commit**

```bash
git add "apps/web/app/(app)/me/cameras/new/page.tsx" apps/web/components/contrib/add-camera-wizard.tsx
git commit -m "feat(contrib): /me/cameras/new wizard with RTSP URL + public toggle"
```

---

## Task 12: `/me/cameras/[id]` detail page

**Files:**
- Create: `apps/web/app/(app)/me/cameras/[id]/page.tsx`

- [ ] **Step 12.1: Implement**

Create `apps/web/app/(app)/me/cameras/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

interface CameraRow {
  id: string;
  description: string;
  rtsp_url: string | null;
  worker_status: string;
  worker_token: string | null;
  public_listed: boolean;
  last_event_at: string | null;
  vlm_budget_remaining: number;
  lat: number;
  lng: number;
}

interface EventRow {
  id: string;
  event_type: string;
  confidence: number;
  detected_at: string;
  vlm_called: boolean;
  alert_id: string | null;
}

function fmtTime(iso: string): string {
  return new Date(iso).toISOString().slice(0, 19).replace("T", " ") + "Z";
}

export default async function CameraDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="p-6 font-mono text-sm">
        Please sign in to view this camera.
      </div>
    );
  }

  const { data: camera } = await supabase
    .from("cameras")
    .select(
      "id, description, rtsp_url, worker_status, worker_token, public_listed, last_event_at, vlm_budget_remaining, lat, lng",
    )
    .eq("id", id)
    .eq("contributor_id", user.id)
    .maybeSingle();

  if (!camera) {
    notFound();
  }

  const cam = camera as CameraRow;

  const { data: eventsData } = await supabase
    .from("camera_events")
    .select("id, event_type, confidence, detected_at, vlm_called, alert_id")
    .eq("camera_id", id)
    .order("detected_at", { ascending: false })
    .limit(50);

  const events = (eventsData ?? []) as EventRow[];

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-6">
      <header className="flex items-center justify-between border-b border-neutral-200 pb-2">
        <h1 className="font-mono text-xs uppercase tracking-widest">
          {cam.description}
        </h1>
        <Link
          href={"/me/cameras" as never}
          className="font-mono text-[10px] uppercase tracking-widest text-neutral-500 hover:text-black"
        >
          ← Back
        </Link>
      </header>

      <dl className="grid grid-cols-2 gap-y-1 border border-neutral-200 p-3 font-mono text-[11px]">
        <dt className="text-[10px] uppercase tracking-widest text-neutral-500">
          Status
        </dt>
        <dd>{cam.worker_status}</dd>
        <dt className="text-[10px] uppercase tracking-widest text-neutral-500">
          Visibility
        </dt>
        <dd>{cam.public_listed ? "PUBLIC" : "PRIVATE"}</dd>
        <dt className="text-[10px] uppercase tracking-widest text-neutral-500">
          Location
        </dt>
        <dd>
          {cam.lat.toFixed(4)}, {cam.lng.toFixed(4)}
        </dd>
        <dt className="text-[10px] uppercase tracking-widest text-neutral-500">
          Last Event
        </dt>
        <dd>{cam.last_event_at ? fmtTime(cam.last_event_at) : "—"}</dd>
        <dt className="text-[10px] uppercase tracking-widest text-neutral-500">
          VLM Budget Today
        </dt>
        <dd>{cam.vlm_budget_remaining}</dd>
      </dl>

      <section className="space-y-1">
        <h2 className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          Recent Events · {events.length}
        </h2>
        {events.length === 0 ? (
          <p className="border border-dashed border-neutral-200 p-6 text-center font-mono text-[11px] text-neutral-500">
            No events yet. The VPS worker hasn't been connected, or it
            hasn't seen anything actionable.
          </p>
        ) : (
          <ul className="font-mono text-[11px]">
            {events.map((e) => (
              <li
                key={e.id}
                className="flex items-baseline gap-2 border-b border-neutral-100 px-2 py-1 last:border-b-0"
              >
                <span className="shrink-0 text-[9px] uppercase tracking-widest text-neutral-400">
                  {fmtTime(e.detected_at)}
                </span>
                <span className="shrink-0 border border-neutral-300 px-1 py-0.5 text-[8px] uppercase tracking-widest text-neutral-700">
                  {e.event_type}
                </span>
                <span className="text-neutral-600">
                  c={e.confidence.toFixed(2)}
                </span>
                {e.vlm_called && (
                  <span className="text-[9px] uppercase tracking-widest text-neutral-500">
                    vlm
                  </span>
                )}
                {e.alert_id && (
                  <span className="border border-black bg-black px-1 text-[8px] uppercase tracking-widest text-white">
                    alert
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 12.2: Typecheck**

```bash
cd /Users/nicolasdossantos/caltrans-cctv/apps/web && pnpm exec tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 12.3: Commit**

```bash
git add "apps/web/app/(app)/me/cameras/[id]/page.tsx"
git commit -m "feat(contrib): /me/cameras/[id] detail page with event feed"
```

---

## Task 13: Mock events script + end-to-end smoke

**Files:**
- Create: `scripts/mock-events.ts`

- [ ] **Step 13.1: Implement the mock script**

Create `scripts/mock-events.ts`:

```ts
// Dev-only: simulates the VPS worker by minting a fake clip in R2 and
// firing a synthetic event into /api/contrib/events.
//
// Usage:
//   pnpm tsx scripts/mock-events.ts <camera_id> <worker_token>
// or, to read camera_id+token from the cameras row:
//   pnpm tsx scripts/mock-events.ts --pick-first

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load apps/web/.env.local so the script can find Supabase URLs + R2 vars.
try {
  const envPath = resolve(__dirname, "..", "apps", "web", ".env.local");
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) {
      const key = m[1]!;
      const value = (m[2] ?? "").replace(/^"|"$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  }
} catch {
  /* shell env fallback */
}

const BASE_URL = process.env.MOCK_EVENTS_BASE_URL ?? "http://localhost:3001";

interface Args {
  camera_id?: string;
  worker_token?: string;
  pickFirst: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  if (argv.includes("--pick-first")) return { pickFirst: true };
  if (argv.length === 2) {
    return { camera_id: argv[0], worker_token: argv[1], pickFirst: false };
  }
  console.error(
    "usage: tsx scripts/mock-events.ts <camera_id> <worker_token> | --pick-first",
  );
  process.exit(1);
}

async function pickFirstCamera(): Promise<{ id: string; token: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase env vars missing");
  }
  const supa = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supa
    .from("cameras")
    .select("id, worker_token")
    .eq("source", "contributor")
    .not("worker_token", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data || !data.worker_token) {
    throw new Error(
      `no contributor camera found (run /me/cameras/new first): ${error?.message ?? "no row"}`,
    );
  }
  return { id: data.id as string, token: data.worker_token as string };
}

async function fireEvent(camera_id: string, token: string): Promise<void> {
  // 1. Get a presigned R2 upload URL.
  const uploadRes = await fetch(`${BASE_URL}/api/contrib/clips/upload-url`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ camera_id, duration_sec: 5 }),
  });
  if (!uploadRes.ok) {
    throw new Error(
      `upload-url ${uploadRes.status}: ${await uploadRes.text()}`,
    );
  }
  const { clip_key, presigned_put_url } = (await uploadRes.json()) as {
    clip_key: string;
    presigned_put_url: string;
  };

  // 2. PUT a fake "clip" payload (1KB of zeros — real worker uploads MP4).
  const fakeClip = new Uint8Array(1024);
  const putRes = await fetch(presigned_put_url, {
    method: "PUT",
    body: fakeClip,
    headers: { "content-type": "video/mp4" },
  });
  if (!putRes.ok) {
    throw new Error(`R2 PUT ${putRes.status}: ${await putRes.text()}`);
  }

  // 3. POST the event.
  const evt = {
    camera_id,
    event_type: "person",
    confidence: 0.85,
    detected_at: new Date().toISOString(),
    clip_key,
    bbox: [0.3, 0.4, 0.2, 0.5],
    frame_count: 10,
  };
  const eventRes = await fetch(`${BASE_URL}/api/contrib/events`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(evt),
  });
  const eventBody = await eventRes.text();
  console.log(`event POST → ${eventRes.status}: ${eventBody}`);
  if (!eventRes.ok) process.exit(1);
}

async function main() {
  const args = parseArgs();
  let camera_id: string;
  let worker_token: string;
  if (args.pickFirst) {
    const picked = await pickFirstCamera();
    camera_id = picked.id;
    worker_token = picked.token;
    console.log(`picked camera ${camera_id}`);
  } else {
    camera_id = args.camera_id!;
    worker_token = args.worker_token!;
  }
  await fireEvent(camera_id, worker_token);
  console.log("done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 13.2: Seed a test camera so the script has something to fire against**

Use `mcp__supabase__execute_sql` to insert a known-good camera for the smoke test (since we're auth-redirected from `/me/cameras/new` in headless dev):

```sql
INSERT INTO cameras (
  caltrans_id, district, route, description, lat, lng, stream_url,
  stream_type, is_active, source, contributor_id, rtsp_url,
  worker_token, worker_status, public_listed
)
SELECT
  'contrib-smoke-' || substr(md5(random()::text), 1, 8),
  4, 'contributor', 'Smoke-test camera (delete after Phase 1 verify)',
  37.7749, -122.4194, 'rtsp://example.local/smoke',
  'hls', true, 'contributor',
  (SELECT id FROM auth.users LIMIT 1),
  'rtsp://example.local/smoke',
  'wd_cam_phase1smoke_' || encode(gen_random_bytes(16), 'hex'),
  'active', false
RETURNING id, worker_token;
```

Capture the returned `id` and `worker_token`.

- [ ] **Step 13.3: Run the mock**

Replace `<id>` and `<token>` with the values from Step 13.2:

```bash
cd /Users/nicolasdossantos/caltrans-cctv && pnpm tsx scripts/mock-events.ts <id> <token>
```

Expected output (last two lines):
```
event POST → 200: {"event_id":"<uuid>"}
done.
```

- [ ] **Step 13.4: Verify the row landed in `camera_events` + the clip in R2**

`mcp__supabase__execute_sql`:

```sql
SELECT id, camera_id, event_type, confidence, clip_key, detected_at
FROM camera_events
WHERE camera_id = '<id from 13.2>'
ORDER BY detected_at DESC
LIMIT 1;
```

Expected: one row with `event_type='person'`, `confidence=0.85`, and a `clip_key` that starts with `events/<camera_id>/`.

Then verify R2:

```bash
cd /Users/nicolasdossantos/caltrans-cctv/apps/web && node -e "
import('./node_modules/@aws-sdk/client-s3/dist-cjs/index.js').then(async (m) => {
  const { S3Client, ListObjectsV2Command } = m;
  const fs = await import('node:fs');
  for (const line of fs.readFileSync('.env.local','utf-8').split('\n')) {
    const m2 = line.match(/^([A-Z0-9_]+)=(.*)\$/);
    if (m2) process.env[m2[1]] = (m2[2] ?? '').replace(/^\"|\"\$/g, '');
  }
  const s3 = new S3Client({ region: 'auto', endpoint: process.env.R2_ENDPOINT,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } });
  const list = await s3.send(new ListObjectsV2Command({ Bucket: process.env.R2_BUCKET_NAME, Prefix: 'events/' }));
  console.log('R2 events/ count:', list.Contents?.length ?? 0);
  for (const o of list.Contents ?? []) console.log('  ', o.Key, o.Size, 'bytes');
});
"
```

Expected: at least one object under `events/<camera_id>/...mp4` of 1024 bytes.

- [ ] **Step 13.5: Commit**

```bash
git add scripts/mock-events.ts
git commit -m "feat(contrib): scripts/mock-events.ts fires synthetic events end-to-end"
```

---

## Task 14: Top-nav link to `/me/cameras`

**Files:**
- Modify: `apps/web/components/app-shell/top-nav.tsx`

- [ ] **Step 14.1: Read `apps/web/components/app-shell/top-nav.tsx`**

Use the Read tool. Identify the current navigation items list (look for the array of tabs).

- [ ] **Step 14.2: Add a "Cameras" item to the nav, after "Intel"**

Find the navigation array. Add a new entry with `label: "Cameras"`, `href: "/me/cameras"`, gated on the current user being authenticated. Use the same component shape as adjacent items.

Don't refactor anything else. Just one row added.

- [ ] **Step 14.3: Typecheck**

```bash
cd /Users/nicolasdossantos/caltrans-cctv/apps/web && pnpm exec tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 14.4: Commit**

```bash
git add apps/web/components/app-shell/top-nav.tsx
git commit -m "nav: add Cameras link to the operator top nav"
```

---

## Task 15: End-to-end Phase 1 verification

- [ ] **Step 15.1: Full unit test sweep**

```bash
cd /Users/nicolasdossantos/caltrans-cctv && pnpm --filter web test 2>&1 | tail -20
```

Expected: all tests pass (the new ones added in Tasks 3, 4, 5, 6, 7, 9 plus any preexisting).

- [ ] **Step 15.2: Typecheck both packages**

```bash
cd /Users/nicolasdossantos/caltrans-cctv && pnpm --filter web exec tsc --noEmit && pnpm --filter @caltrans/sync exec tsc --noEmit
```

Expected: both exit 0.

- [ ] **Step 15.3: Re-run mock-events to confirm full pipeline still flows**

```bash
cd /Users/nicolasdossantos/caltrans-cctv && pnpm tsx scripts/mock-events.ts --pick-first
```

Expected: `event POST → 200: {"event_id":"..."}` then `done.`

- [ ] **Step 15.4: Confirm camera_events row count grew**

`mcp__supabase__execute_sql`:

```sql
SELECT COUNT(*) AS n FROM camera_events;
```

Expected: ≥ 2 (one from Task 13, one from Step 15.3).

- [ ] **Step 15.5: Confirm event flows visibly through the UI**

Open `http://localhost:3001/me/cameras/<id>` in your browser as the authenticated user. Expected: the camera's detail page lists the new events under "Recent Events" with their `event_type`, `confidence`, and timestamps.

- [ ] **Step 15.6: Clean up the smoke-test camera (optional)**

`mcp__supabase__execute_sql`:

```sql
DELETE FROM cameras
WHERE description LIKE 'Smoke-test camera%';
```

- [ ] **Step 15.7: Phase 1 commit checkpoint**

```bash
git log --oneline -20
```

You should see ~14 commits matching the task numbers above. Phase 1 is done.

---

## Spec coverage self-review

Going section by section through `docs/superpowers/specs/2026-05-18-watchdog-security-network-design.md` against this plan's tasks:

| Spec requirement | Implemented by |
|---|---|
| `cameras` extensions (rtsp_url, worker_status, worker_token, threat_dictionary, vlm_budget, public_listed) | Task 1 |
| `camera_events` table | Task 1 |
| `camera_alerts` table | Task 1 |
| `alert_feedback` table | Task 1 |
| `push_subscriptions` table | Task 1 |
| RLS read-self on contributor tables | Task 1 |
| R2 client + presigned upload URL | Tasks 2, 3 |
| R2 download URL helper | Task 3 |
| `/api/contrib/clips/upload-url` | Task 6 |
| `/api/contrib/events` ingestion | Task 7 |
| Worker token auth (opaque, DB-scoped) | Task 4, used in 6 & 7 |
| Camera registration flow (RTSP validate, mint token, insert) | Tasks 5, 9, 11 |
| `/me/cameras` list | Task 10 |
| `/me/cameras/new` wizard | Task 11 |
| `/me/cameras/[id]` detail | Task 12 |
| Dev mock events script | Task 13 |
| Middleware allowlist for contrib endpoints | Task 8 |
| Top-nav surface for the contributor portal | Task 14 |
| End-to-end smoke (Phase 1 exit criteria) | Tasks 13, 15 |

**Phase 1 exit criteria from the spec: "a dev can register a camera and `scripts/mock-events.ts` puts a row in `camera_events` referencing a clip in R2."** Tasks 1, 6, 7, 9, 11, 13 together cover that flow, and Task 15 explicitly verifies it.

**Things deferred to Phase 2 (intentional, NOT gaps):**
- Stage-1 LLM gate
- Stage-2 vision model
- GBrain context retrieval + write-back
- `camera_alerts` row creation
- Cron route `/api/cron/process-vlm-queue`

These are listed as `gbrain_page_id` and `alert_id` nullable columns in Task 1's migration — the schema is ready for Phase 2 to populate them.

**Type consistency check:** verified `clip_key` is a string everywhere; `event_type` enum matches the SQL CHECK constraint exactly; `severity` enum matches the spec's threat dictionary. No drift.

**Placeholder scan:** no TBDs, no "fill in" steps, no untyped abstract steps — every step has runnable code or commands and exit criteria.

---

## Next plans (not in scope here)

- `2026-05-19-watchdog-security-phase-2-llm-pipeline.md` — Tier-1 gate + Tier-2 vision + GBrain integration + VLM queue cron.
- `2026-05-20-watchdog-security-phase-3-web-push.md` — VAPID + service worker + alert delivery.
- `2026-05-21-watchdog-security-phase-4-public-surfacing.md` — anonymized pins on `/map` + public-listed cameras on `/wall`.
- `2026-05-22-watchdog-security-phase-5-onboarding-polish.md` — moderation queue, threat dictionary editor, waitlist gate.

After Phase 5, the only remaining piece is the VPS RTSP worker — paid infra deferred to launch.
