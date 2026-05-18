# Policy enforcer + decision wiring — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the schema, RPC, UI wiring, and seed needed to make the DEMO_SCRIPT round-trip (dispatcher Holds → GBrain learns → citizen sees the audit row, including a denial after the homeowner tightens policy) work end-to-end.

**Architecture:** Add two tables (`camera_policies`, `camera_access_events`) + one Postgres function (`request_camera_access`) as the single enforcement choke point. Render the existing `DecisionPanel` on `/incidents/[id]`, fan a Hold decision out to incident-linked cameras through the RPC, and add a per-camera `Request footage` flow on both the incident detail page and `/live/[id]`. Seed one Mission & 16th contributor camera + five public wall-fill cams + a pre-staged signal trio.

**Tech Stack:** Next.js 15 (App Router) + TypeScript strict, Drizzle ORM + raw Postgres migration, Supabase (Postgres + Auth + Realtime), Zod, Vitest, @playwright/test.

**Spec:** `docs/superpowers/specs/2026-05-18-policy-enforcer-blockers-design.md`

---

### Task 1: Migration — tables + RPC + RLS

**Files:**
- Create: `packages/db/migrations/0008_camera_policies.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- packages/db/migrations/0008_camera_policies.sql
-- camera_policies: opt-in homeowner policy. One row per consented camera.
CREATE TABLE IF NOT EXISTS "camera_policies" (
  "camera_id"              uuid PRIMARY KEY REFERENCES "cameras"("id") ON DELETE CASCADE,
  "geofence_radius_m"      int NOT NULL CHECK ("geofence_radius_m" BETWEEN 50 AND 5000),
  "window_start_local"     text CHECK ("window_start_local" ~ '^\d{2}:\d{2}$'),
  "window_end_local"       text CHECK ("window_end_local"   ~ '^\d{2}:\d{2}$'),
  "warrant_required"       boolean NOT NULL DEFAULT false,
  "exigent_allowed"        boolean NOT NULL DEFAULT true,
  "blocked_incident_types" text[]  NOT NULL DEFAULT '{}',
  "updated_at"             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "camera_access_events" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "camera_id"       uuid NOT NULL REFERENCES "cameras"("id") ON DELETE CASCADE,
  "contributor_id"  uuid          REFERENCES "contributors"("id") ON DELETE SET NULL,
  "incident_id"     uuid          REFERENCES "incidents"("id")    ON DELETE SET NULL,
  "accessed_by"     text NOT NULL,
  "legal_basis"     text NOT NULL CHECK ("legal_basis" IN ('standing_consent','exigent','warrant','public_domain')),
  "reason"          text,
  "allowed"         boolean NOT NULL,
  "denial_reason"   text,
  "policy_snapshot" jsonb,
  "occurred_at"     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "camera_access_events_camera_time_idx"
  ON "camera_access_events" ("camera_id", "occurred_at" DESC);
CREATE INDEX IF NOT EXISTS "camera_access_events_incident_idx"
  ON "camera_access_events" ("incident_id") WHERE "incident_id" IS NOT NULL;

-- RLS
ALTER TABLE "camera_policies"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "camera_access_events"   ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS by default in Supabase; no permissive
-- policies are required for server-side access. Deny by default for
-- anon and authenticated roles.

-- Realtime so the citizen audit table redraws on insert.
ALTER PUBLICATION supabase_realtime ADD TABLE "camera_access_events";

-- Time-window helper handles overnight windows (e.g. 22:00 → 06:00).
CREATE OR REPLACE FUNCTION time_in_window(t time, w_start time, w_end time)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN w_start <= w_end THEN t BETWEEN w_start AND w_end
    ELSE t >= w_start OR t <= w_end
  END
$$;

-- The policy-as-code enforcer. All UI / server actions / workers call this.
CREATE OR REPLACE FUNCTION request_camera_access(
  p_camera_id   uuid,
  p_incident_id uuid,
  p_accessed_by text,
  p_legal_basis text,
  p_reason      text,
  p_has_warrant boolean DEFAULT false,
  p_is_exigent  boolean DEFAULT false
) RETURNS TABLE (
  event_id        uuid,
  allowed         boolean,
  denial_reason   text,
  policy_snapshot jsonb
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pol         camera_policies%ROWTYPE;
  v_contrib_id  uuid;
  v_inc_title   text;
  v_local_now   time;
  v_allowed     boolean := true;
  v_denial      text;
  v_snapshot    jsonb;
  v_basis       text := p_legal_basis;
BEGIN
  SELECT contributor_id INTO v_contrib_id FROM cameras WHERE id = p_camera_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'camera_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_contrib_id IS NULL THEN
    v_basis := 'public_domain';
  ELSE
    SELECT * INTO v_pol FROM camera_policies WHERE camera_id = p_camera_id;
    IF FOUND THEN
      v_snapshot := to_jsonb(v_pol);

      IF p_incident_id IS NOT NULL
         AND array_length(v_pol.blocked_incident_types, 1) > 0 THEN
        SELECT lower(title) INTO v_inc_title FROM incidents WHERE id = p_incident_id;
        IF v_inc_title IS NOT NULL AND EXISTS (
          SELECT 1 FROM unnest(v_pol.blocked_incident_types) AS kw
          WHERE v_inc_title LIKE '%' || lower(kw) || '%'
        ) THEN
          v_allowed := false;
          v_denial  := 'blocked_incident_type';
        END IF;
      END IF;

      IF v_allowed AND v_pol.warrant_required AND NOT p_has_warrant
         AND NOT (v_pol.exigent_allowed AND p_is_exigent) THEN
        v_allowed := false;
        v_denial  := 'warrant_required';
      END IF;

      IF v_allowed AND v_pol.window_start_local IS NOT NULL THEN
        v_local_now := (now() AT TIME ZONE 'America/Los_Angeles')::time;
        IF NOT time_in_window(v_local_now,
                              v_pol.window_start_local::time,
                              v_pol.window_end_local::time) THEN
          v_allowed := false;
          v_denial  := 'outside_time_window';
        END IF;
      END IF;
    END IF;
  END IF;

  INSERT INTO camera_access_events
    (camera_id, contributor_id, incident_id, accessed_by, legal_basis,
     reason, allowed, denial_reason, policy_snapshot)
  VALUES
    (p_camera_id, v_contrib_id, p_incident_id, p_accessed_by, v_basis,
     p_reason, v_allowed, v_denial, v_snapshot)
  RETURNING id INTO event_id;

  allowed := v_allowed;
  denial_reason := v_denial;
  policy_snapshot := v_snapshot;
  RETURN NEXT;
END $$;

GRANT EXECUTE ON FUNCTION request_camera_access TO service_role;
GRANT EXECUTE ON FUNCTION time_in_window TO service_role;
```

- [ ] **Step 2: Apply migration locally via Supabase**

```bash
# Pull DATABASE_URL out of apps/web/.env.local
export DATABASE_URL=$(grep '^DATABASE_URL=' apps/web/.env.local | cut -d= -f2- | tr -d '"')
psql "$DATABASE_URL" -f packages/db/migrations/0008_camera_policies.sql
```

Expected: `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE`, `ALTER PUBLICATION`, `CREATE FUNCTION`, `GRANT` notices. No errors.

- [ ] **Step 3: Verify tables and RPC exist**

```bash
psql "$DATABASE_URL" -c "\d camera_policies"
psql "$DATABASE_URL" -c "\d camera_access_events"
psql "$DATABASE_URL" -c "\df request_camera_access"
```

Expected: both tables listed with the columns from the spec; function `request_camera_access` returns `record`.

- [ ] **Step 4: Commit**

```bash
git add packages/db/migrations/0008_camera_policies.sql
git commit -m "feat(db): camera_policies + access_events + request_camera_access RPC"
```

---

### Task 2: Drizzle schema additions

**Files:**
- Modify: `packages/db/src/schema.ts` (append two new table exports)
- Test: `packages/db/src/schema.test.ts` (new, type-only smoke)

- [ ] **Step 1: Write the failing test**

`packages/db/src/schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { cameraPolicies, cameraAccessEvents } from "./schema";

describe("camera policy schema", () => {
  it("exposes cameraPolicies columns", () => {
    expect(Object.keys((cameraPolicies as unknown as { _: { columns: object } })._.columns))
      .toEqual(expect.arrayContaining([
        "cameraId", "geofenceRadiusM", "windowStartLocal", "windowEndLocal",
        "warrantRequired", "exigentAllowed", "blockedIncidentTypes", "updatedAt",
      ]));
  });

  it("exposes cameraAccessEvents columns", () => {
    expect(Object.keys((cameraAccessEvents as unknown as { _: { columns: object } })._.columns))
      .toEqual(expect.arrayContaining([
        "id", "cameraId", "contributorId", "incidentId", "accessedBy",
        "legalBasis", "reason", "allowed", "denialReason", "policySnapshot",
        "occurredAt",
      ]));
  });
});
```

- [ ] **Step 2: Run test, confirm it fails**

```bash
cd packages/db && pnpm vitest run src/schema.test.ts
```

Expected: FAIL with `"cameraPolicies" is not exported`.

- [ ] **Step 3: Add exports at the end of `packages/db/src/schema.ts`**

```ts
export const cameraPolicies = pgTable("camera_policies", {
  cameraId: uuid("camera_id")
    .primaryKey()
    .references(() => cameras.id, { onDelete: "cascade" }),
  geofenceRadiusM: integer("geofence_radius_m").notNull(),
  windowStartLocal: text("window_start_local"),
  windowEndLocal: text("window_end_local"),
  warrantRequired: boolean("warrant_required").notNull().default(false),
  exigentAllowed: boolean("exigent_allowed").notNull().default(true),
  blockedIncidentTypes: text("blocked_incident_types")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const cameraAccessEvents = pgTable(
  "camera_access_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cameraId: uuid("camera_id")
      .notNull()
      .references(() => cameras.id, { onDelete: "cascade" }),
    contributorId: uuid("contributor_id").references(() => contributors.id, {
      onDelete: "set null",
    }),
    incidentId: uuid("incident_id").references(() => incidents.id, {
      onDelete: "set null",
    }),
    accessedBy: text("accessed_by").notNull(),
    legalBasis: text("legal_basis", {
      enum: ["standing_consent", "exigent", "warrant", "public_domain"],
    }).notNull(),
    reason: text("reason"),
    allowed: boolean("allowed").notNull(),
    denialReason: text("denial_reason"),
    policySnapshot: jsonb("policy_snapshot"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    cameraTimeIdx: index("camera_access_events_camera_time_idx").on(
      t.cameraId,
      t.occurredAt.desc(),
    ),
    incidentIdx: index("camera_access_events_incident_idx").on(t.incidentId),
  }),
);
```

Also add to the top imports if missing: `import { sql } from "drizzle-orm";`

- [ ] **Step 4: Run test, confirm pass**

```bash
cd packages/db && pnpm vitest run src/schema.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema.ts packages/db/src/schema.test.ts
git commit -m "feat(db): drizzle exports for cameraPolicies + cameraAccessEvents"
```

---

### Task 3: RPC contract tests

**Files:**
- Create: `packages/db/test/rpc-policy.test.ts`

Tests run against the same Supabase project (the migrations have already been applied in Task 1). Use the service role client.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/db/test/rpc-policy.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key, { auth: { persistSession: false } });

interface RpcResult {
  event_id: string;
  allowed: boolean;
  denial_reason: string | null;
  policy_snapshot: Record<string, unknown> | null;
}

let publicCameraId: string;       // contributor_id = null
let contributorCameraId: string;  // contributor + policy
let contributorId: string;
let incidentId: string;

beforeAll(async () => {
  // Seed a contributor
  const { data: c } = await supabase.from("contributors").insert({
    name: "RPC Test Owner",
    contact_phone: `+1555${Math.floor(Math.random() * 10_000_000).toString().padStart(7, "0")}`,
    token: `rpc-test-${Date.now()}`,
    verified_at: new Date().toISOString(),
  }).select("id").single();
  contributorId = c!.id;

  // Public camera
  const { data: pub } = await supabase.from("cameras").insert({
    caltrans_id: `pub-${Date.now()}`,
    district: 4, route: "I-test", description: "RPC public test",
    lat: 37.77, lng: -122.42, stream_url: "test://", stream_type: "hls",
  }).select("id").single();
  publicCameraId = pub!.id;

  // Contributor camera
  const { data: priv } = await supabase.from("cameras").insert({
    caltrans_id: `priv-${Date.now()}`,
    district: 4, route: "I-test", description: "RPC private test",
    lat: 37.77, lng: -122.42, stream_url: "test://", stream_type: "hls",
    contributor_id: contributorId,
  }).select("id").single();
  contributorCameraId = priv!.id;

  // Incident
  const { data: inc } = await supabase.from("incidents").insert({
    title: "RPC test fight detection",
    severity: "med",
    created_by: "00000000-0000-0000-0000-000000000000",
  }).select("id").single();
  incidentId = inc!.id;
});

afterAll(async () => {
  await supabase.from("camera_access_events").delete().in("camera_id", [publicCameraId, contributorCameraId]);
  await supabase.from("camera_policies").delete().eq("camera_id", contributorCameraId);
  await supabase.from("incidents").delete().eq("id", incidentId);
  await supabase.from("cameras").delete().in("id", [publicCameraId, contributorCameraId]);
  await supabase.from("contributors").delete().eq("id", contributorId);
});

async function call(args: Record<string, unknown>): Promise<RpcResult> {
  const { data, error } = await supabase.rpc("request_camera_access", args);
  if (error) throw new Error(error.message);
  return (data as RpcResult[])[0];
}

describe("request_camera_access", () => {
  it("public camera ⇒ allowed, public_domain", async () => {
    const res = await call({
      p_camera_id: publicCameraId,
      p_incident_id: incidentId,
      p_accessed_by: "test:public",
      p_legal_basis: "standing_consent",
      p_reason: "unit test",
    });
    expect(res.allowed).toBe(true);
    expect(res.denial_reason).toBeNull();
    expect(res.policy_snapshot).toBeNull();

    const { data: ev } = await supabase
      .from("camera_access_events")
      .select("legal_basis").eq("id", res.event_id).single();
    expect(ev!.legal_basis).toBe("public_domain");
  });

  it("contributor camera with no policy row ⇒ allowed, basis preserved", async () => {
    const res = await call({
      p_camera_id: contributorCameraId,
      p_incident_id: incidentId,
      p_accessed_by: "test:nopolicy",
      p_legal_basis: "standing_consent",
      p_reason: "unit test",
    });
    expect(res.allowed).toBe(true);
    expect(res.denial_reason).toBeNull();
    expect(res.policy_snapshot).toBeNull();
  });

  it("warrant_required without warrant or exigent ⇒ denied", async () => {
    await supabase.from("camera_policies").upsert({
      camera_id: contributorCameraId,
      geofence_radius_m: 200,
      warrant_required: true,
      exigent_allowed: true,
      blocked_incident_types: [],
    });
    const res = await call({
      p_camera_id: contributorCameraId,
      p_incident_id: incidentId,
      p_accessed_by: "test:warrant",
      p_legal_basis: "standing_consent",
      p_reason: "unit test",
    });
    expect(res.allowed).toBe(false);
    expect(res.denial_reason).toBe("warrant_required");
    expect(res.policy_snapshot).not.toBeNull();
  });

  it("warrant_required with exigent_allowed + is_exigent ⇒ allowed", async () => {
    const res = await call({
      p_camera_id: contributorCameraId,
      p_incident_id: incidentId,
      p_accessed_by: "test:exigent",
      p_legal_basis: "exigent",
      p_reason: "unit test",
      p_is_exigent: true,
    });
    expect(res.allowed).toBe(true);
    expect(res.denial_reason).toBeNull();
  });

  it("blocked_incident_types keyword match ⇒ denied", async () => {
    await supabase.from("camera_policies").upsert({
      camera_id: contributorCameraId,
      geofence_radius_m: 200,
      warrant_required: false,
      exigent_allowed: true,
      blocked_incident_types: ["fight detection"],
    });
    const res = await call({
      p_camera_id: contributorCameraId,
      p_incident_id: incidentId,
      p_accessed_by: "test:blocked",
      p_legal_basis: "standing_consent",
      p_reason: "unit test",
    });
    expect(res.allowed).toBe(false);
    expect(res.denial_reason).toBe("blocked_incident_type");
  });

  it("outside time window ⇒ denied", async () => {
    // Pick a 1-minute window that does NOT include the current local time.
    const nowLocal = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
    const future = new Date(nowLocal.getTime() + 60_000);
    const farFuture = new Date(nowLocal.getTime() + 120_000);
    const pad = (n: number) => n.toString().padStart(2, "0");
    const start = `${pad(future.getHours())}:${pad(future.getMinutes())}`;
    const end   = `${pad(farFuture.getHours())}:${pad(farFuture.getMinutes())}`;

    await supabase.from("camera_policies").upsert({
      camera_id: contributorCameraId,
      geofence_radius_m: 200,
      window_start_local: start,
      window_end_local: end,
      warrant_required: false,
      exigent_allowed: true,
      blocked_incident_types: [],
    });
    const res = await call({
      p_camera_id: contributorCameraId,
      p_incident_id: incidentId,
      p_accessed_by: "test:window",
      p_legal_basis: "standing_consent",
      p_reason: "unit test",
    });
    expect(res.allowed).toBe(false);
    expect(res.denial_reason).toBe("outside_time_window");

    // Cleanup window for subsequent runs
    await supabase.from("camera_policies").upsert({
      camera_id: contributorCameraId,
      geofence_radius_m: 200,
      window_start_local: null,
      window_end_local: null,
      warrant_required: false,
      exigent_allowed: true,
      blocked_incident_types: [],
    });
  });
});
```

- [ ] **Step 2: Run tests, confirm they pass against the live migration**

```bash
cd packages/db && pnpm vitest run test/rpc-policy.test.ts
```

Expected: 6/6 PASS. Service role env vars must be present in shell — pull from `apps/web/.env.local`:

```bash
export SUPABASE_URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' ../../apps/web/.env.local | cut -d= -f2-)
export SUPABASE_SERVICE_ROLE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' ../../apps/web/.env.local | cut -d= -f2-)
```

- [ ] **Step 3: Commit**

```bash
git add packages/db/test/rpc-policy.test.ts
git commit -m "test(db): contract tests for request_camera_access RPC"
```

---

### Task 4: API route — POST /api/incidents/[id]/request-camera-access

**Files:**
- Create: `apps/web/app/api/incidents/[id]/request-camera-access/route.ts`
- Test: `apps/web/app/api/incidents/[id]/request-camera-access/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/app/api/incidents/[id]/request-camera-access/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();
const rpc = vi.fn();
const adminRpc = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  adminClient: () => ({ rpc: adminRpc }),
}));

import { POST } from "./route";

function makeReq(body: unknown) {
  return new Request("http://x/api/incidents/abc/request-camera-access", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/incidents/[id]/request-camera-access", () => {
  beforeEach(() => {
    getUser.mockReset();
    adminRpc.mockReset();
  });

  it("401 when not signed in", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeReq({}) as never, { params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }) });
    expect(res.status).toBe(401);
  });

  it("400 when body invalid", async () => {
    getUser.mockResolvedValue({ data: { user: { email: "d@x", id: "u1" } } });
    const res = await POST(makeReq({ cameraId: "not-a-uuid" }) as never, { params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }) });
    expect(res.status).toBe(400);
  });

  it("forwards to RPC and returns its result", async () => {
    getUser.mockResolvedValue({ data: { user: { email: "d@x", id: "u1" } } });
    adminRpc.mockResolvedValue({
      data: [{ event_id: "e1", allowed: true, denial_reason: null, policy_snapshot: null }],
      error: null,
    });
    const res = await POST(
      makeReq({
        cameraId: "11111111-1111-1111-1111-111111111111",
        legalBasis: "standing_consent",
        reason: "test",
      }) as never,
      { params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.allowed).toBe(true);
    expect(adminRpc).toHaveBeenCalledWith("request_camera_access", expect.objectContaining({
      p_camera_id: "11111111-1111-1111-1111-111111111111",
      p_incident_id: "00000000-0000-0000-0000-000000000000",
      p_accessed_by: "dispatcher:d@x",
      p_legal_basis: "standing_consent",
    }));
  });
});
```

- [ ] **Step 2: Run test — should fail with no route module**

```bash
cd apps/web && pnpm vitest run app/api/incidents/\[id\]/request-camera-access/route.test.ts
```

Expected: FAIL with `Cannot find module './route'`.

- [ ] **Step 3: Implement the route**

```ts
// apps/web/app/api/incidents/[id]/request-camera-access/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  cameraId:   z.string().uuid(),
  legalBasis: z.enum(["standing_consent", "exigent", "warrant"]),
  reason:     z.string().min(1).max(500),
  hasWarrant: z.boolean().default(false),
  isExigent:  z.boolean().default(false),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: incidentId } = await params;
  const supaUser = await createClient();
  const { data: { user } } = await supaUser.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const b = parsed.data;

  const admin = adminClient();
  const { data, error } = await admin.rpc("request_camera_access", {
    p_camera_id:   b.cameraId,
    p_incident_id: incidentId,
    p_accessed_by: `dispatcher:${user.email ?? user.id}`,
    p_legal_basis: b.legalBasis,
    p_reason:      b.reason,
    p_has_warrant: b.hasWarrant,
    p_is_exigent:  b.isExigent,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json((data as unknown[])[0] ?? null);
}
```

- [ ] **Step 4: Run test, confirm pass**

```bash
cd apps/web && pnpm vitest run app/api/incidents/\[id\]/request-camera-access/route.test.ts
```

Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/incidents/\[id\]/request-camera-access/
git commit -m "feat(api): POST /api/incidents/[id]/request-camera-access wrapper"
```

---

### Task 5: API route — POST /api/cameras/[id]/request-access (no incident context)

**Files:**
- Create: `apps/web/app/api/cameras/[id]/request-access/route.ts`
- Test: `apps/web/app/api/cameras/[id]/request-access/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();
const adminRpc = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  adminClient: () => ({ rpc: adminRpc }),
}));

import { POST } from "./route";

function makeReq(body: unknown) {
  return new Request("http://x/api/cameras/abc/request-access", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/cameras/[id]/request-access", () => {
  beforeEach(() => { getUser.mockReset(); adminRpc.mockReset(); });

  it("401 when not signed in", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeReq({}) as never, { params: Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" }) });
    expect(res.status).toBe(401);
  });

  it("calls RPC with null incident", async () => {
    getUser.mockResolvedValue({ data: { user: { email: "d@x", id: "u1" } } });
    adminRpc.mockResolvedValue({
      data: [{ event_id: "e1", allowed: false, denial_reason: "warrant_required", policy_snapshot: {} }],
      error: null,
    });
    const res = await POST(
      makeReq({ legalBasis: "standing_consent", reason: "ad-hoc" }) as never,
      { params: Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" }) },
    );
    expect(res.status).toBe(200);
    expect(adminRpc).toHaveBeenCalledWith("request_camera_access", expect.objectContaining({
      p_camera_id: "11111111-1111-1111-1111-111111111111",
      p_incident_id: null,
    }));
  });
});
```

- [ ] **Step 2: Run test — should fail**

```bash
cd apps/web && pnpm vitest run app/api/cameras/\[id\]/request-access/route.test.ts
```

Expected: FAIL `Cannot find module './route'`.

- [ ] **Step 3: Implement the route**

```ts
// apps/web/app/api/cameras/[id]/request-access/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  legalBasis: z.enum(["standing_consent", "exigent", "warrant"]),
  reason:     z.string().min(1).max(500),
  hasWarrant: z.boolean().default(false),
  isExigent:  z.boolean().default(false),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: cameraId } = await params;
  const supaUser = await createClient();
  const { data: { user } } = await supaUser.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const b = parsed.data;

  const admin = adminClient();
  const { data, error } = await admin.rpc("request_camera_access", {
    p_camera_id:   cameraId,
    p_incident_id: null,
    p_accessed_by: `dispatcher:${user.email ?? user.id}`,
    p_legal_basis: b.legalBasis,
    p_reason:      b.reason,
    p_has_warrant: b.hasWarrant,
    p_is_exigent:  b.isExigent,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json((data as unknown[])[0] ?? null);
}
```

- [ ] **Step 4: Run test, confirm pass**

```bash
cd apps/web && pnpm vitest run app/api/cameras/\[id\]/request-access/route.test.ts
```

Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/cameras/\[id\]/request-access/
git commit -m "feat(api): POST /api/cameras/[id]/request-access wrapper"
```

---

### Task 6: Server-action fan-out on Hold

**Files:**
- Modify: `apps/web/app/(app)/kg/actions.ts` (`recordDecision`)
- Modify or create: `apps/web/app/(app)/kg/actions.test.ts`

- [ ] **Step 1: Locate the existing `recordDecision`**

Inspect:

```bash
sed -n '60,110p' apps/web/app/\(app\)/kg/actions.ts
```

You will edit between the existing `await writeReviewedIncidentPage(...)` call (inside `try {}`) and the `revalidatePath` block.

- [ ] **Step 2: Add the fan-out, after the GBrain write try/catch and before `revalidatePath(\"/kg\")`**

```ts
  if (parsed.outcome === "hold") {
    try {
      const { data: cams } = await supabase
        .from("clips")
        .select("camera_id")
        .eq("incident_id", parsed.incidentId);
      const uniqueCameras = [
        ...new Set((cams ?? []).map((c) => c.camera_id as string)),
      ];
      await Promise.all(
        uniqueCameras.map((cameraId) =>
          supabase.rpc("request_camera_access", {
            p_camera_id: cameraId,
            p_incident_id: parsed.incidentId,
            p_accessed_by: `dispatcher:${parsed.reviewer}`,
            p_legal_basis: "standing_consent",
            p_reason: parsed.reason ?? "hold: pending corroboration",
            p_has_warrant: false,
            p_is_exigent: false,
          }),
        ),
      );
    } catch (e) {
      // Don't let an access-request failure block the decision itself.
      console.error(
        "[recordDecision] hold fan-out failed:",
        e instanceof Error ? e.message : e,
      );
    }
  }
```

- [ ] **Step 3: Add an action test**

If `apps/web/app/(app)/kg/actions.test.ts` already exists, append; otherwise create:

```ts
import { describe, it, expect, vi } from "vitest";

const rpc = vi.fn();
const upsert = vi.fn().mockResolvedValue({ error: null });
const select = vi.fn();
const from = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from,
    rpc,
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { recordDecision } from "./actions";

describe("recordDecision Hold fan-out", () => {
  it("calls request_camera_access once per linked camera on hold", async () => {
    rpc.mockResolvedValue({ data: [{ event_id: "e1" }], error: null });

    const fromImpl = (table: string) => {
      if (table === "decisions") return { upsert };
      if (table === "incidents") {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: { title: "x", severity: "med", suspect_gang_id: null }, error: null }) }) }),
        };
      }
      if (table === "pages") {
        return { upsert: vi.fn().mockResolvedValue({ data: null, error: null }) };
      }
      if (table === "clips") {
        return {
          select: () => ({
            eq: async () => ({
              data: [{ camera_id: "cam-1" }, { camera_id: "cam-1" }, { camera_id: "cam-2" }],
              error: null,
            }),
          }),
        };
      }
      return {};
    };
    from.mockImplementation(fromImpl);

    await recordDecision({
      incidentId: "00000000-0000-0000-0000-000000000000",
      outcome: "hold",
      reason: "fanout test",
      reviewer: "tester",
    });

    const rpcCalls = rpc.mock.calls.filter(([name]) => name === "request_camera_access");
    expect(rpcCalls.length).toBe(2);
    const cameraIds = rpcCalls.map(([, args]) => (args as { p_camera_id: string }).p_camera_id).sort();
    expect(cameraIds).toEqual(["cam-1", "cam-2"]);
  });
});
```

- [ ] **Step 4: Run the test**

```bash
cd apps/web && pnpm vitest run app/\(app\)/kg/actions.test.ts
```

Expected: PASS. (If the existing `writeReviewedIncidentPage` makes other DB calls the mock doesn't cover, expand `fromImpl`.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/\(app\)/kg/actions.ts apps/web/app/\(app\)/kg/actions.test.ts
git commit -m "feat(kg): Hold decision fans out request_camera_access per linked camera"
```

---

### Task 7: CameraAccessRow component

**Files:**
- Create: `apps/web/app/(app)/incidents/[id]/camera-access-row.tsx`

- [ ] **Step 1: Implement the component**

```tsx
// apps/web/app/(app)/incidents/[id]/camera-access-row.tsx
"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";

interface Props {
  cameraId: string;
  cameraLabel: string;
  incidentId: string;
  isPublic: boolean;
}

type Basis = "standing_consent" | "exigent" | "warrant";

interface RpcResult {
  event_id: string;
  allowed: boolean;
  denial_reason: string | null;
}

const DENIAL_COPY: Record<string, string> = {
  warrant_required: "blocked by owner policy — warrant required",
  blocked_incident_type: "blocked by owner policy — incident type",
  outside_time_window: "blocked by owner policy — outside allowed hours",
};

export function CameraAccessRow({ cameraId, cameraLabel, incidentId, isPublic }: Props) {
  const [open, setOpen] = useState(false);
  const [basis, setBasis] = useState<Basis>("standing_consent");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<RpcResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function submit(quickPublic = false) {
    if (!quickPublic && !reason.trim()) {
      setError("reason required");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await fetch(
        `/api/incidents/${incidentId}/request-camera-access`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            cameraId,
            legalBasis: quickPublic ? "standing_consent" : basis,
            reason: quickPublic ? "public-camera ad-hoc review" : reason.trim(),
            hasWarrant: basis === "warrant",
            isExigent: basis === "exigent",
          }),
        },
      );
      if (!res.ok) {
        setError(`HTTP ${res.status}`);
        return;
      }
      const json = (await res.json()) as RpcResult;
      setResult(json);
      setOpen(false);
    });
  }

  return (
    <div className="border border-neutral-300 p-2 font-mono text-[11px]">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate">{cameraLabel}</span>
        {isPublic ? (
          <button
            type="button"
            onClick={() => submit(true)}
            disabled={pending}
            className="border border-neutral-400 px-2 py-0.5 text-[10px] uppercase tracking-widest hover:border-black disabled:opacity-50"
          >
            {pending ? "..." : "Pull public"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            disabled={pending}
            className="border border-neutral-400 px-2 py-0.5 text-[10px] uppercase tracking-widest hover:border-black"
          >
            {open ? "Cancel" : "Request footage"}
          </button>
        )}
      </div>

      {open && !isPublic && (
        <div className="mt-2 space-y-2">
          <fieldset className="space-y-1">
            <legend className="text-[9px] uppercase tracking-widest text-neutral-500">
              Legal basis
            </legend>
            {(["standing_consent", "exigent", "warrant"] as Basis[]).map((b) => (
              <label key={b} className="flex items-center gap-2 text-[10px]">
                <input
                  type="radio"
                  name={`basis-${cameraId}`}
                  checked={basis === b}
                  onChange={() => setBasis(b)}
                />
                {b.replace("_", " ")}
              </label>
            ))}
          </fieldset>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="reason / incident reference"
            className="w-full border border-neutral-300 p-1 text-[11px]"
          />
          <button
            type="button"
            onClick={() => submit()}
            disabled={pending}
            className={cn(
              "border px-2 py-1 text-[10px] uppercase tracking-widest",
              pending
                ? "border-neutral-300 text-neutral-400"
                : "border-black bg-black text-white",
            )}
          >
            {pending ? "Requesting..." : "Submit request"}
          </button>
        </div>
      )}

      {error && (
        <p className="mt-1 text-[10px] text-neutral-700">error: {error}</p>
      )}
      {result && (
        <p
          className={cn(
            "mt-1 border-l-2 pl-2 text-[10px]",
            result.allowed ? "border-black" : "border-neutral-700 italic",
          )}
        >
          {result.allowed
            ? "allowed — clip available"
            : `denied: ${DENIAL_COPY[result.denial_reason ?? ""] ?? result.denial_reason}`}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Manual sanity — does it typecheck**

```bash
cd apps/web && pnpm typecheck
```

Expected: no new errors involving this file.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(app\)/incidents/\[id\]/camera-access-row.tsx
git commit -m "feat(ui): CameraAccessRow with legal-basis + reason flow"
```

---

### Task 8: Wire DecisionPanel + CameraAccessRow into incident detail page

**Files:**
- Modify: `apps/web/app/(app)/incidents/[id]/page.tsx`

- [ ] **Step 1: Inspect the current page structure**

```bash
sed -n '1,40p' apps/web/app/\(app\)/incidents/\[id\]/page.tsx
sed -n '80,160p' apps/web/app/\(app\)/incidents/\[id\]/page.tsx
```

Identify (a) where the existing right-hand sidebar `<aside>` or sections live and (b) where the page already calls `await createClient()` for the signed-in user.

- [ ] **Step 2: Add the cameras-on-scene loader near the existing data fetches**

```ts
// In the same server-component body that already loads the incident:
const { data: clipsRows } = await supabase
  .from("clips")
  .select("camera_id, cameras:camera_id (id, description, contributor_id)")
  .eq("incident_id", incident.id);

type Linked = { id: string; description: string; contributor_id: string | null };
const seen = new Set<string>();
const linkedCameras: Linked[] = [];
for (const row of clipsRows ?? []) {
  const c = (row as unknown as { cameras: Linked }).cameras;
  if (!c || seen.has(c.id)) continue;
  seen.add(c.id);
  linkedCameras.push(c);
}

const { data: { user } } = await supabase.auth.getUser();
```

- [ ] **Step 3: Render the two new sidebar sections**

Place after the existing "Prior Context" section in the JSX:

```tsx
import { DecisionPanel } from "@/components/kg/decision-panel";
import { CameraAccessRow } from "./camera-access-row";

// ...inside the sidebar:
<section className="space-y-2">
  <h2 className="font-mono text-[10px] uppercase tracking-widest">Decision</h2>
  <DecisionPanel
    incidentId={incident.id}
    reviewerHint={user?.email ?? "dispatcher"}
  />
</section>

<section className="space-y-2">
  <h2 className="font-mono text-[10px] uppercase tracking-widest">Cameras on scene</h2>
  {linkedCameras.length === 0 ? (
    <p className="font-mono text-[10px] text-neutral-500">No linked cameras.</p>
  ) : (
    linkedCameras.map((c) => (
      <CameraAccessRow
        key={c.id}
        cameraId={c.id}
        cameraLabel={c.description}
        incidentId={incident.id}
        isPublic={!c.contributor_id}
      />
    ))
  )}
</section>
```

- [ ] **Step 4: Typecheck**

```bash
cd apps/web && pnpm typecheck
```

Expected: clean.

- [ ] **Step 5: Manual smoke — load `/incidents/<id>` on the running dev server, verify the new sections render. If `clipsRows` is empty for the seeded incident, that's expected before Task 10; only verify the Decision panel renders.**

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/\(app\)/incidents/\[id\]/page.tsx
git commit -m "feat(ui): wire DecisionPanel + CameraAccessRow on /incidents/[id]"
```

---

### Task 9: /live/[id] Request-access button

**Files:**
- Create: `apps/web/app/(app)/live/[id]/request-access-button.tsx`
- Modify: `apps/web/app/(app)/live/[id]/page.tsx`

- [ ] **Step 1: Implement the button component**

```tsx
// apps/web/app/(app)/live/[id]/request-access-button.tsx
"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";

interface Props { cameraId: string; isPublic: boolean }
type Basis = "standing_consent" | "exigent" | "warrant";

const DENIAL_COPY: Record<string, string> = {
  warrant_required: "blocked by owner policy — warrant required",
  blocked_incident_type: "blocked by owner policy — incident type",
  outside_time_window: "blocked by owner policy — outside allowed hours",
};

export function RequestAccessButton({ cameraId, isPublic }: Props) {
  const [open, setOpen] = useState(false);
  const [basis, setBasis] = useState<Basis>("standing_consent");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ allowed: boolean; denial_reason: string | null } | null>(null);

  function submit(quickPublic = false) {
    if (!quickPublic && !reason.trim()) return;
    startTransition(async () => {
      const res = await fetch(`/api/cameras/${cameraId}/request-access`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          legalBasis: quickPublic ? "standing_consent" : basis,
          reason: quickPublic ? "ad-hoc public review" : reason.trim(),
          hasWarrant: basis === "warrant",
          isExigent: basis === "exigent",
        }),
      });
      const json = await res.json();
      setResult(json);
      setOpen(false);
    });
  }

  if (isPublic) {
    return (
      <button
        type="button"
        onClick={() => submit(true)}
        disabled={pending}
        className="border border-neutral-400 px-3 py-1 font-mono text-[11px] uppercase tracking-widest hover:border-black disabled:opacity-50"
      >
        {pending ? "..." : "Pull public clip"}
      </button>
    );
  }

  return (
    <div className="space-y-2 font-mono text-[11px]">
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="border border-neutral-400 px-3 py-1 uppercase tracking-widest hover:border-black"
        >
          Request footage
        </button>
      )}
      {open && (
        <div className="space-y-2 border border-neutral-300 p-2">
          <fieldset className="space-y-1">
            {(["standing_consent", "exigent", "warrant"] as Basis[]).map((b) => (
              <label key={b} className="flex items-center gap-2 text-[10px]">
                <input type="radio" name={`basis-${cameraId}`} checked={basis === b} onChange={() => setBasis(b)} />
                {b.replace("_", " ")}
              </label>
            ))}
          </fieldset>
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="reason"
            className="w-full border border-neutral-300 p-1"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => submit()}
              disabled={pending}
              className={cn(
                "border px-2 py-1 text-[10px] uppercase tracking-widest",
                pending ? "border-neutral-300 text-neutral-400" : "border-black bg-black text-white",
              )}
            >
              {pending ? "Requesting..." : "Submit"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="border border-neutral-400 px-2 py-1 text-[10px] uppercase tracking-widest"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {result && (
        <p className={cn("border-l-2 pl-2 text-[10px]", result.allowed ? "border-black" : "border-neutral-700 italic")}>
          {result.allowed
            ? "allowed — clip available"
            : `denied: ${DENIAL_COPY[result.denial_reason ?? ""] ?? result.denial_reason}`}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Render the button on `/live/[id]`**

Open `apps/web/app/(app)/live/[id]/page.tsx`. After the section that displays camera metadata (look for `description` or the existing HLS player), add:

```tsx
import { RequestAccessButton } from "./request-access-button";

// ... where you have access to `camera`:
<div className="mt-4 border-t border-neutral-200 pt-3">
  <h2 className="mb-2 font-mono text-[10px] uppercase tracking-widest">Footage access</h2>
  <RequestAccessButton
    cameraId={camera.id}
    isPublic={!camera.contributor_id}
  />
</div>
```

Confirm `camera.contributor_id` is selected in the existing query — if not, add it.

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(app\)/live/\[id\]/
git commit -m "feat(ui): RequestAccessButton on /live/[id]"
```

---

### Task 10: Demo seed script

**Files:**
- Create: `scripts/seed-demo.ts`
- Modify: `package.json` (root) — add `"seed:demo": "tsx scripts/seed-demo.ts"`

- [ ] **Step 1: Implement the seed**

```ts
// scripts/seed-demo.ts
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const envPath = resolve(process.cwd(), "apps/web/.env.local");
try {
  const lines = readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
} catch {
  // .env.local missing — assume the env is already populated.
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const DEMO_DISPATCHER_EMAIL = "dispatcher@watchdog.local";
const DEMO_DISPATCHER_PASSWORD =
  process.env.DEMO_DISPATCHER_PASSWORD ?? "WatchDog2026!";
const DEMO_TOKEN = "demo-mission-16th";
const DEMO_LAT = 37.7651;
const DEMO_LNG = -122.4194;

async function upsertDispatcher() {
  const { data: users } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = users.users.find((u) => u.email === DEMO_DISPATCHER_EMAIL);
  if (existing) return existing.id;
  const { data, error } = await supabase.auth.admin.createUser({
    email: DEMO_DISPATCHER_EMAIL,
    password: DEMO_DISPATCHER_PASSWORD,
    email_confirm: true,
    user_metadata: { role: "dispatcher" },
  });
  if (error) throw error;
  return data.user!.id;
}

async function upsertContributor(): Promise<string> {
  const { data: existing } = await supabase
    .from("contributors").select("id").eq("token", DEMO_TOKEN).maybeSingle();
  if (existing) return existing.id;
  const { data, error } = await supabase.from("contributors").insert({
    name: "Mission & 16th Demo Owner",
    contact_phone: "+14155550100",
    contact_email: "demo-owner@watchdog.local",
    token: DEMO_TOKEN,
    verified_at: new Date().toISOString(),
  }).select("id").single();
  if (error) throw error;
  return data!.id;
}

interface CameraSeed {
  caltransId: string;
  district: number;
  route: string;
  description: string;
  lat: number;
  lng: number;
  streamUrl: string;
  contributorId: string | null;
}

const PUBLIC_WALL_CAMS: CameraSeed[] = [
  { caltransId: "demo-public-embarcadero",  district: 4, route: "embarcadero",  description: "Embarcadero & Mission",  lat: 37.7943, lng: -122.3946, streamUrl: "https://test-streams.mux.dev/x36xhzz/url_2/url_2.m3u8", contributorId: null },
  { caltransId: "demo-public-twin-peaks",   district: 4, route: "twin-peaks",   description: "Twin Peaks viewpoint",   lat: 37.7544, lng: -122.4477, streamUrl: "https://test-streams.mux.dev/x36xhzz/url_3/url_3.m3u8", contributorId: null },
  { caltransId: "demo-public-north-beach",  district: 4, route: "north-beach",  description: "Columbus & Broadway",    lat: 37.7977, lng: -122.4080, streamUrl: "https://test-streams.mux.dev/x36xhzz/url_4/url_4.m3u8", contributorId: null },
  { caltransId: "demo-public-castro",       district: 4, route: "castro",       description: "Castro & Market",        lat: 37.7619, lng: -122.4350, streamUrl: "https://test-streams.mux.dev/x36xhzz/url_5/url_5.m3u8", contributorId: null },
  { caltransId: "demo-public-soma",         district: 4, route: "soma",         description: "5th & Howard",           lat: 37.7807, lng: -122.4067, streamUrl: "https://test-streams.mux.dev/x36xhzz/url_6/url_6.m3u8", contributorId: null },
];

async function upsertCamera(seed: CameraSeed): Promise<string> {
  const { data: existing } = await supabase
    .from("cameras").select("id").eq("caltrans_id", seed.caltransId).maybeSingle();
  if (existing) return existing.id;
  const { data, error } = await supabase.from("cameras").insert({
    caltrans_id: seed.caltransId,
    district: seed.district,
    route: seed.route,
    description: seed.description,
    lat: seed.lat,
    lng: seed.lng,
    stream_url: seed.streamUrl,
    stream_type: "hls",
    is_active: true,
    contributor_id: seed.contributorId,
  }).select("id").single();
  if (error) throw error;
  return data!.id;
}

async function upsertPolicy(cameraId: string) {
  await supabase.from("camera_policies").upsert({
    camera_id: cameraId,
    geofence_radius_m: 200,
    window_start_local: null,
    window_end_local: null,
    warrant_required: false,
    exigent_allowed: true,
    blocked_incident_types: [],
    updated_at: new Date().toISOString(),
  }, { onConflict: "camera_id" });
}

async function upsertGbrainPriorPages(cameraDescription: string) {
  const slugs = [1, 2, 3].map((i) => `demo-mission-16th-prior-${i}`);
  for (const slug of slugs) {
    await supabase.from("pages").upsert({
      source_id: "watchdog",
      slug,
      kind: "reviewed_incident",
      title: `${cameraDescription} — late-night fight detection (dismissed)`,
      body: "Dispatcher reviewed and dismissed: bar-closing crowd, no enforcement action.",
      tags: ["mission-16th", "bar-closing", "dismissed", "fight-detection"],
      data: { outcome: "dismiss", camera_description: cameraDescription },
    }, { onConflict: "source_id,slug" });
  }
}

async function upsertDemoIncidentTrio(dispatcherId: string, cameraId: string) {
  // Idempotent: keyed on a deterministic title.
  const title = "Mission & 16th — fight detection (demo)";
  const { data: existing } = await supabase
    .from("incidents").select("id").eq("title", title).maybeSingle();
  let incidentId: string;
  if (existing) {
    incidentId = existing.id;
  } else {
    const { data, error } = await supabase.from("incidents").insert({
      title,
      severity: "high",
      notes: "Three corroborating signals: camera detect, 911 audio, citizen report.",
      created_by: dispatcherId,
    }).select("id").single();
    if (error) throw error;
    incidentId = data!.id;
  }

  // Ensure at least one clip exists linking incident → seeded camera.
  const { data: clip } = await supabase
    .from("clips").select("id").eq("incident_id", incidentId).eq("camera_id", cameraId).maybeSingle();
  if (!clip) {
    await supabase.from("clips").insert({
      incident_id: incidentId,
      camera_id: cameraId,
      started_at: new Date(Date.now() - 5 * 60_000).toISOString(),
      duration_s: 30,
      storage_path: "demo/mission-16th-clip.m3u8",
      thumbnail_path: "demo/mission-16th-thumb.jpg",
    });
  }

  // Pre-stage three signal_events for the same incident geo + window.
  const baseTime = new Date(Date.now() - 5 * 60_000).toISOString();
  const signals: Array<{ source_type: "camera_private" | "call_911" | "citizen_report"; source_id: string; payload: Record<string, unknown> }> = [
    { source_type: "camera_private", source_id: cameraId, payload: { detection: "fight", confidence: 0.82 } },
    { source_type: "call_911",       source_id: "demo-call-001", payload: { transcript: "shouting and a fight outside Mission and 16th" } },
    { source_type: "citizen_report", source_id: "demo-citizen-001", payload: { note: "two people fighting near the bart entrance" } },
  ];
  for (const s of signals) {
    const { data: existingSig } = await supabase
      .from("signal_events").select("id").eq("source_id", s.source_id).maybeSingle();
    if (existingSig) continue;
    await supabase.from("signal_events").insert({
      source_type: s.source_type,
      source_id: s.source_id,
      occurred_at: baseTime,
      lat: DEMO_LAT,
      lng: DEMO_LNG,
      payload: s.payload,
      confidence: 0.8,
    });
  }
  return incidentId;
}

async function main() {
  const dispatcherId = await upsertDispatcher();
  const contributorId = await upsertContributor();

  const missionCamId = await upsertCamera({
    caltransId: "demo-mission-16th",
    district: 4,
    route: "Mission",
    description: "Mission & 16th HLS",
    lat: DEMO_LAT,
    lng: DEMO_LNG,
    streamUrl: "https://test-streams.mux.dev/x36xhzz/url_0/url_0.m3u8",
    contributorId,
  });
  await upsertPolicy(missionCamId);
  await upsertGbrainPriorPages("Mission & 16th HLS");

  for (const seed of PUBLIC_WALL_CAMS) await upsertCamera(seed);

  const incidentId = await upsertDemoIncidentTrio(dispatcherId, missionCamId);

  console.log(JSON.stringify({
    dispatcherId, contributorId, missionCamId, incidentId,
    dispatcherEmail: DEMO_DISPATCHER_EMAIL,
    citizenUrl: `/c/${DEMO_TOKEN}`,
    incidentUrl: `/incidents/${incidentId}`,
  }, null, 2));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Add the npm script**

Edit root `package.json`:

```json
"scripts": {
  "seed:demo": "tsx scripts/seed-demo.ts"
}
```

(Append `seed:demo` to the existing `"scripts"` block; do not replace the block.)

- [ ] **Step 3: Run the seed**

```bash
pnpm seed:demo
```

Expected: JSON output naming the dispatcher email, contributor token, mission camera id, demo incident id, and the two URLs. Re-run it — should produce the same ids with no errors (idempotent).

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-demo.ts package.json
git commit -m "feat(seed): demo seed for Mission & 16th + 5 wall-fill public cams"
```

---

### Task 11: Playwright end-to-end suite

**Files:**
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/e2e/demo-script.spec.ts`
- Modify: `apps/web/package.json` (add `@playwright/test` devDep and `test:e2e` script)

- [ ] **Step 1: Install Playwright**

```bash
cd apps/web && pnpm add -D @playwright/test
pnpm exec playwright install chromium
```

- [ ] **Step 2: Add config**

```ts
// apps/web/playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3001",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
```

- [ ] **Step 3: Add the suite**

```ts
// apps/web/e2e/demo-script.spec.ts
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const DEMO_EMAIL = "dispatcher@watchdog.local";
const DEMO_PASSWORD = process.env.DEMO_DISPATCHER_PASSWORD ?? "WatchDog2026!";
const DEMO_TOKEN = "demo-mission-16th";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(DEMO_EMAIL);
  await page.getByLabel(/password/i).fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL((u) => !u.pathname.endsWith("/login"));
}

async function getSeededIncidentId(): Promise<string> {
  const { data } = await supabase
    .from("incidents")
    .select("id")
    .eq("title", "Mission & 16th — fight detection (demo)")
    .single();
  return data!.id;
}

test.describe("DEMO_SCRIPT round-trip", () => {
  test("Hold writes decisions + access_events; citizen sees it; policy tighten denies", async ({ page, context }) => {
    const incidentId = await getSeededIncidentId();
    await signIn(page);

    // 1. Open incident, see Prior Context + Decision panel + Cameras on scene.
    await page.goto(`/incidents/${incidentId}`);
    await expect(page.getByRole("heading", { name: /decision/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /cameras on scene/i })).toBeVisible();
    await page.screenshot({ path: "test-results/01-incident-detail.png", fullPage: true });

    // 2. Click Hold, type reason, submit.
    await page.getByRole("button", { name: /^hold$/i }).click();
    await page.getByPlaceholder(/why/i).fill("matches recurring false-positive pattern, verify before dispatch.");
    await page.getByRole("button", { name: /save|submit decision/i }).click();
    await expect(page.getByText(/saved|recorded/i)).toBeVisible({ timeout: 5000 });

    // 3. Assert DB state.
    const { data: decisions } = await supabase
      .from("decisions").select("outcome").eq("incident_id", incidentId);
    expect(decisions!.some((d) => d.outcome === "hold")).toBe(true);

    const { data: events } = await supabase
      .from("camera_access_events").select("id, allowed").eq("incident_id", incidentId);
    expect(events!.length).toBeGreaterThanOrEqual(1);

    // 4. Open citizen tab.
    const citizen = await context.newPage();
    await citizen.goto(`/c/${DEMO_TOKEN}`);
    await expect(citizen.getByText(/Mission & 16th HLS/i)).toBeVisible();
    await citizen.screenshot({ path: "test-results/02-citizen-audit.png", fullPage: true });

    // 5. Toggle warrant_required = true via the policy editor.
    const warrantCheckbox = citizen.getByLabel(/warrant required/i);
    if (!(await warrantCheckbox.isChecked())) await warrantCheckbox.check();
    await citizen.getByRole("button", { name: /save policy|update/i }).click();
    await expect(citizen.getByText(/saved|updated/i)).toBeVisible({ timeout: 5000 });

    // 6. Back to dispatcher: request footage again with standing_consent — expect denial.
    await page.goto(`/incidents/${incidentId}`);
    await page.getByRole("button", { name: /request footage/i }).first().click();
    await page.getByPlaceholder(/reason/i).fill("ad-hoc request post-policy tighten");
    await page.getByRole("button", { name: /submit request/i }).click();
    await expect(page.getByText(/denied:.*warrant_required/i)).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: "test-results/03-dispatcher-denied.png", fullPage: true });

    // 7. Citizen tab now shows the denial row.
    await citizen.reload();
    await expect(citizen.getByText(/warrant/i)).toBeVisible();
    await citizen.screenshot({ path: "test-results/04-citizen-denial.png", fullPage: true });
  });
});
```

- [ ] **Step 4: Add scripts to `apps/web/package.json`**

```json
"scripts": {
  "test:e2e": "playwright test"
}
```

(Append, don't replace.)

- [ ] **Step 5: Run the suite against the dev server**

Ensure `pnpm dev` is running on port 3001 (the session started one already). In a new terminal:

```bash
cd apps/web && E2E_BASE_URL=http://localhost:3001 pnpm test:e2e
```

Expected: 1/1 PASS plus four screenshots in `apps/web/test-results/`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/playwright.config.ts apps/web/e2e/ apps/web/package.json apps/web/pnpm-lock.yaml ../../pnpm-lock.yaml
git commit -m "test(e2e): playwright suite covering DEMO_SCRIPT round-trip"
```

---

### Task 12: Final typecheck + line-by-line review

- [ ] **Step 1: Run full typecheck**

```bash
cd ~/caltrans-cctv && pnpm typecheck
```

Expected: zero errors. Fix any introduced by the edits.

- [ ] **Step 2: Run full vitest suite**

```bash
pnpm test
```

Expected: all green.

- [ ] **Step 3: Line-by-line review pass**

For every file created or modified in Tasks 1–11, open it and check against:

- No `any`, no `as any`. Zod at API boundaries.
- No hardcoded color classes (`bg-red-*`, `text-green-*`, etc.). Project is monochrome.
- All Supabase calls error-handled, no thrown promises.
- New UI renders sensibly with empty data (`linkedCameras.length === 0` already covered; verify the citizen path too).
- No `// TODO`, no commented-out scaffolding.

Notes go into the commit message of Step 4 if anything was tightened.

- [ ] **Step 4: Commit any review-driven tightenings**

```bash
git add -u
git commit -m "chore: line-by-line review tightenings" || echo "no review changes"
```

---

## Self-review against the spec

- §Scope item 1 (tables + RLS) → Task 1.
- §Scope item 2 (RPC) → Task 1 + Task 3.
- §Scope item 3 (DecisionPanel wiring + Hold fan-out) → Task 6 + Task 8.
- §Scope item 4 (incident-scoped + camera-scoped API routes) → Task 4 + Task 5.
- §Scope item 5 (CameraAccessRow + RequestAccessButton) → Task 7 + Task 9.
- §Scope item 6 (demo seed) → Task 10.
- §Scope item 7 (unit + integration + Playwright + line-by-line) → Tasks 2, 3, 4, 5, 6, 11, 12.
- §Risks open question (`category` vs `title`) → resolved in Task 1 RPC (title substring match).
- §Risks open question (`signal_events.incident_id`) → resolved in Task 6 + Task 8 (use `clips` join).

No placeholder text. No undefined type references — every type is shown in code blocks where it's introduced.
