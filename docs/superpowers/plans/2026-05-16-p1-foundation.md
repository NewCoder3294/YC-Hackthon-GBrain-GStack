# P1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the monorepo, database schema, CalTrans D4 catalog sync, auth, and monochrome design system so teammates can begin P2 (Live Wall), P3 (Buffer), P4 (Map), and P5 (Incidents) in parallel.

**Architecture:** pnpm workspace monorepo. `apps/web` is a Next.js 15 App Router app deployed to Vercel. `packages/db` owns Drizzle schema + a typed Supabase client. `packages/sync` exports a nightly job invoked from a Next.js route handler driven by Vercel Cron. Supabase provides Postgres, Storage, and Auth.

**Tech Stack:** pnpm, Turborepo, Next.js 15, React 19, TypeScript (strict), Tailwind v4, shadcn/ui, Drizzle ORM, Supabase (Postgres + Auth + Storage), Vitest, Playwright, Vercel Cron.

---

## File Structure

```
caltrans-cctv/
├── apps/
│   └── web/
│       ├── app/
│       │   ├── (auth)/
│       │   │   ├── login/page.tsx
│       │   │   └── layout.tsx
│       │   ├── (app)/
│       │   │   ├── layout.tsx              # auth-gated shell w/ top nav
│       │   │   ├── page.tsx                # Live Wall placeholder
│       │   │   ├── map/page.tsx            # Map placeholder
│       │   │   └── incidents/page.tsx      # Incidents placeholder
│       │   ├── api/
│       │   │   └── cron/sync-cameras/route.ts
│       │   ├── layout.tsx                  # root (fonts, providers)
│       │   └── globals.css                 # Tailwind v4 + tokens
│       ├── components/
│       │   ├── ui/                          # shadcn primitives (button, input, etc.)
│       │   ├── app-shell/top-nav.tsx
│       │   └── app-shell/nav-link.tsx
│       ├── lib/
│       │   ├── supabase/server.ts          # server client factory
│       │   ├── supabase/browser.ts         # browser client factory
│       │   └── env.ts                       # zod-validated env
│       ├── middleware.ts                    # auth gating
│       ├── next.config.ts
│       ├── tailwind.config.ts
│       ├── tsconfig.json
│       └── package.json
├── packages/
│   ├── db/
│   │   ├── src/
│   │   │   ├── schema.ts                   # Drizzle tables
│   │   │   ├── client.ts                   # typed db client
│   │   │   └── index.ts
│   │   ├── migrations/                      # generated SQL
│   │   ├── drizzle.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   └── sync/
│       ├── src/
│       │   ├── caltrans.ts                 # parse CalTrans GeoJSON
│       │   ├── caltrans.test.ts
│       │   ├── sync.ts                     # upsert cameras to db
│       │   ├── sync.test.ts
│       │   └── index.ts
│       ├── tsconfig.json
│       └── package.json
├── .github/workflows/ci.yml
├── .nvmrc
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── package.json
└── README.md
```

---

### Task 1: Monorepo scaffold

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.nvmrc`, `.gitignore`

- [ ] **Step 1: Pin Node version**

Create `.nvmrc`:
```
20.18.0
```

- [ ] **Step 2: Create root package.json**

Create `package.json`:
```json
{
  "name": "caltrans-cctv",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck",
    "db:generate": "pnpm --filter @caltrans/db generate",
    "db:migrate": "pnpm --filter @caltrans/db migrate"
  },
  "devDependencies": {
    "turbo": "^2.1.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 3: Define workspace**

Create `pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 4: Configure Turborepo**

Create `turbo.json`:
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": [".next/**", "dist/**"] },
    "dev": { "cache": false, "persistent": true },
    "lint": {},
    "typecheck": { "dependsOn": ["^build"] },
    "test": { "dependsOn": ["^build"] }
  }
}
```

- [ ] **Step 5: Base TS config**

Create `tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true
  }
}
```

- [ ] **Step 6: Gitignore**

Create `.gitignore`:
```
node_modules
.next
dist
.turbo
.env
.env.local
.DS_Store
*.log
coverage
.vercel
```

- [ ] **Step 7: Install and commit**

```bash
pnpm install
git add -A
git commit -m "chore: scaffold pnpm + turborepo monorepo"
```

Expected: `pnpm install` succeeds, lockfile generated.

---

### Task 2: Database package (Drizzle + schema)

**Files:**
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/drizzle.config.ts`, `packages/db/src/schema.ts`, `packages/db/src/client.ts`, `packages/db/src/index.ts`

- [ ] **Step 1: Package manifest**

Create `packages/db/package.json`:
```json
{
  "name": "@caltrans/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./schema": "./src/schema.ts"
  },
  "scripts": {
    "generate": "drizzle-kit generate",
    "migrate": "drizzle-kit migrate",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "drizzle-orm": "^0.36.0",
    "postgres": "^3.4.5"
  },
  "devDependencies": {
    "drizzle-kit": "^0.28.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: TS config**

Create `packages/db/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Drizzle config**

Create `packages/db/drizzle.config.ts`:
```ts
import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL },
  strict: true,
});
```

- [ ] **Step 4: Define schema**

Create `packages/db/src/schema.ts`:
```ts
import {
  pgTable,
  uuid,
  text,
  integer,
  doublePrecision,
  numeric,
  boolean,
  timestamp,
  primaryKey,
} from "drizzle-orm/pg-core";

export const cameras = pgTable("cameras", {
  id: uuid("id").primaryKey().defaultRandom(),
  caltransId: text("caltrans_id").notNull().unique(),
  district: integer("district").notNull(),
  route: text("route").notNull(),
  direction: text("direction"),
  mileMarker: numeric("mile_marker"),
  description: text("description").notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  streamUrl: text("stream_url").notNull(),
  streamType: text("stream_type", { enum: ["hls", "mjpeg"] }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const incidents = pgTable("incidents", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  notes: text("notes"),
  severity: text("severity", { enum: ["low", "med", "high"] })
    .notNull()
    .default("low"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdBy: uuid("created_by").notNull(),
});

export const clips = pgTable("clips", {
  id: uuid("id").primaryKey().defaultRandom(),
  incidentId: uuid("incident_id").references(() => incidents.id, {
    onDelete: "set null",
  }),
  cameraId: uuid("camera_id")
    .notNull()
    .references(() => cameras.id),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  durationS: integer("duration_s").notNull(),
  storagePath: text("storage_path").notNull(),
  thumbnailPath: text("thumbnail_path").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const clipTags = pgTable(
  "clip_tags",
  {
    clipId: uuid("clip_id")
      .notNull()
      .references(() => clips.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.clipId, t.tag] }) }),
);

export const userCameraPins = pgTable(
  "user_camera_pins",
  {
    userId: uuid("user_id").notNull(),
    cameraId: uuid("camera_id")
      .notNull()
      .references(() => cameras.id, { onDelete: "cascade" }),
    layoutName: text("layout_name").notNull().default("default"),
    position: integer("position").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.cameraId, t.layoutName] }),
  }),
);

export type Camera = typeof cameras.$inferSelect;
export type NewCamera = typeof cameras.$inferInsert;
export type Incident = typeof incidents.$inferSelect;
export type Clip = typeof clips.$inferSelect;
```

- [ ] **Step 5: DB client factory**

Create `packages/db/src/client.ts`:
```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export function createDb(connectionString: string) {
  const queryClient = postgres(connectionString, { prepare: false });
  return drizzle(queryClient, { schema });
}

export type Db = ReturnType<typeof createDb>;
```

- [ ] **Step 6: Package index**

Create `packages/db/src/index.ts`:
```ts
export * from "./schema.js";
export * from "./client.js";
```

- [ ] **Step 7: Install deps**

```bash
pnpm install
```

Expected: `drizzle-orm`, `drizzle-kit`, `postgres` resolve.

- [ ] **Step 8: Typecheck**

```bash
pnpm --filter @caltrans/db typecheck
```

Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(db): drizzle schema for cameras, incidents, clips, tags, pins"
```

---

### Task 3: Generate migrations + RLS policies

**Files:**
- Create: `packages/db/migrations/0000_*.sql` (generated), `packages/db/migrations/0001_rls.sql`

- [ ] **Step 1: Generate baseline migration**

```bash
DATABASE_URL="postgres://placeholder" pnpm --filter @caltrans/db generate
```

Expected: a file `packages/db/migrations/0000_<adjective>_<noun>.sql` is created containing `CREATE TABLE` statements for all five tables.

- [ ] **Step 2: Write RLS migration**

Create `packages/db/migrations/0001_rls.sql`:
```sql
-- Enable RLS
ALTER TABLE cameras ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE clips ENABLE ROW LEVEL SECURITY;
ALTER TABLE clip_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_camera_pins ENABLE ROW LEVEL SECURITY;

-- Cameras: any authenticated user can read; only service role writes.
CREATE POLICY "cameras_read_authenticated" ON cameras
  FOR SELECT TO authenticated USING (true);

-- Incidents: any authenticated user reads + writes.
CREATE POLICY "incidents_read_authenticated" ON incidents
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "incidents_insert_authenticated" ON incidents
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "incidents_update_owner" ON incidents
  FOR UPDATE TO authenticated USING (auth.uid() = created_by);
CREATE POLICY "incidents_delete_owner" ON incidents
  FOR DELETE TO authenticated USING (auth.uid() = created_by);

-- Clips: any authenticated user reads + writes.
CREATE POLICY "clips_read_authenticated" ON clips
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "clips_insert_authenticated" ON clips
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "clips_update_authenticated" ON clips
  FOR UPDATE TO authenticated USING (true);

-- Clip tags: read public, write by any authenticated user.
CREATE POLICY "clip_tags_read_authenticated" ON clip_tags
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "clip_tags_write_authenticated" ON clip_tags
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- User pins: per-user isolation.
CREATE POLICY "pins_read_own" ON user_camera_pins
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "pins_write_own" ON user_camera_pins
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(db): generate baseline migration and add RLS policies"
```

---

### Task 4: Supabase project setup (manual + env scaffolding)

**Files:**
- Create: `apps/web/.env.example`, `README.md`

- [ ] **Step 1: Document Supabase setup**

Update `README.md`:
````markdown
# CalTrans CCTV Dashboard

## One-time Supabase setup

1. Create a new project at https://supabase.com (region: us-west).
2. From the project Settings → Database → Connection string, copy the **Transaction Pooler** URL → `DATABASE_URL`.
3. From Settings → API, copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server-only, never expose)
4. Create a Storage bucket named `clips` (private). Add a second bucket `thumbnails` (public).
5. Apply migrations:
   ```bash
   DATABASE_URL=... pnpm db:migrate
   ```
6. Generate a strong CRON secret: `openssl rand -hex 32` → `CRON_SECRET`.

## Local development

```bash
cp apps/web/.env.example apps/web/.env.local
# fill in values from Supabase
pnpm dev
```
````

- [ ] **Step 2: Env example**

Create `apps/web/.env.example`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
CRON_SECRET=
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs: supabase setup instructions and env template"
```

---

### Task 5: CalTrans D4 catalog sync — parser

**Files:**
- Create: `packages/sync/package.json`, `packages/sync/tsconfig.json`, `packages/sync/src/caltrans.ts`, `packages/sync/src/caltrans.test.ts`, `packages/sync/vitest.config.ts`

- [ ] **Step 1: Package manifest**

Create `packages/sync/package.json`:
```json
{
  "name": "@caltrans/sync",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@caltrans/db": "workspace:*",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: TS config**

Create `packages/sync/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Vitest config**

Create `packages/sync/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node" } });
```

- [ ] **Step 4: Write failing test for parser**

Create `packages/sync/src/caltrans.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseCalTransResponse } from "./caltrans.js";

const fixture = {
  data: [
    {
      cctv: {
        index: "TVD04--001",
        recordTimestamp: { recordDate: "2026-05-15", recordTime: "23:00:00" },
        location: {
          district: "04",
          countyName: "ALAMEDA",
          routeName: "880",
          routeSuffix: "N",
          nearbyPlace: "23RD AVE",
          longitude: "-122.234",
          latitude: "37.789",
          milepost: "32.10",
          elevation: "20",
        },
        inService: "True",
        imageData: {
          imageDescription: "I-880 N @ 23RD AVE",
          streamingVideoURL:
            "https://cwwp2.dot.ca.gov/data/d4/cctv/image/tvd04001/tvd04001.stream/playlist.m3u8",
          static: { currentImageURL: "" },
        },
      },
    },
    {
      cctv: {
        index: "TVD04--002",
        recordTimestamp: { recordDate: "2026-05-15", recordTime: "23:00:00" },
        location: {
          district: "04",
          countyName: "SAN MATEO",
          routeName: "101",
          routeSuffix: "S",
          nearbyPlace: "WHIPPLE",
          longitude: "-122.211",
          latitude: "37.490",
          milepost: "10.5",
          elevation: "30",
        },
        inService: "False",
        imageData: {
          imageDescription: "US-101 S @ WHIPPLE",
          streamingVideoURL: "",
          static: {
            currentImageURL:
              "https://cwwp2.dot.ca.gov/data/d4/cctv/image/tvd04002/tvd04002.jpg",
          },
        },
      },
    },
  ],
};

describe("parseCalTransResponse", () => {
  it("parses HLS stream cameras", () => {
    const cameras = parseCalTransResponse(fixture);
    expect(cameras[0]).toMatchObject({
      caltransId: "TVD04--001",
      district: 4,
      route: "I-880",
      direction: "N",
      description: "I-880 N @ 23RD AVE",
      streamType: "hls",
      isActive: true,
    });
    expect(cameras[0]!.lat).toBeCloseTo(37.789);
    expect(cameras[0]!.lng).toBeCloseTo(-122.234);
  });

  it("falls back to MJPEG when no streaming URL", () => {
    const cameras = parseCalTransResponse(fixture);
    expect(cameras[1]!.streamType).toBe("mjpeg");
    expect(cameras[1]!.isActive).toBe(false);
    expect(cameras[1]!.streamUrl).toContain(".jpg");
  });

  it("derives route prefix from numeric route", () => {
    const cameras = parseCalTransResponse(fixture);
    expect(cameras[0]!.route).toBe("I-880");
    expect(cameras[1]!.route).toBe("US-101");
  });

  it("skips entries with no usable stream URL", () => {
    const empty = {
      data: [
        {
          cctv: {
            index: "TVD04--999",
            recordTimestamp: { recordDate: "", recordTime: "" },
            location: {
              district: "04",
              countyName: "",
              routeName: "1",
              routeSuffix: "",
              nearbyPlace: "",
              longitude: "0",
              latitude: "0",
              milepost: "0",
              elevation: "0",
            },
            inService: "True",
            imageData: {
              imageDescription: "",
              streamingVideoURL: "",
              static: { currentImageURL: "" },
            },
          },
        },
      ],
    };
    expect(parseCalTransResponse(empty)).toEqual([]);
  });
});
```

- [ ] **Step 5: Run test, expect failure**

```bash
pnpm --filter @caltrans/sync test
```

Expected: FAIL — `parseCalTransResponse` not defined.

- [ ] **Step 6: Implement parser**

Create `packages/sync/src/caltrans.ts`:
```ts
import { z } from "zod";
import type { NewCamera } from "@caltrans/db";

const cctvSchema = z.object({
  index: z.string(),
  location: z.object({
    district: z.string(),
    routeName: z.string(),
    routeSuffix: z.string().optional().default(""),
    nearbyPlace: z.string().optional().default(""),
    longitude: z.string(),
    latitude: z.string(),
    milepost: z.string().optional().default(""),
  }),
  inService: z.string(),
  imageData: z.object({
    imageDescription: z.string().optional().default(""),
    streamingVideoURL: z.string().optional().default(""),
    static: z
      .object({ currentImageURL: z.string().optional().default("") })
      .optional()
      .default({ currentImageURL: "" }),
  }),
});

const responseSchema = z.object({
  data: z.array(z.object({ cctv: cctvSchema })),
});

function routePrefix(routeName: string): string {
  const n = Number(routeName);
  if (!Number.isFinite(n)) return routeName;
  // US numbered highways are 101, 50, 395, etc. Interstates are 5, 80, 280, 580, 680, 880, 980.
  const interstates = new Set([5, 80, 205, 238, 280, 380, 405, 505, 580, 680, 780, 880, 980]);
  if (interstates.has(n)) return `I-${n}`;
  if (n === 101 || n === 50 || n === 395) return `US-${n}`;
  return `SR-${n}`;
}

export function parseCalTransResponse(input: unknown): NewCamera[] {
  const parsed = responseSchema.parse(input);
  const cameras: NewCamera[] = [];

  for (const { cctv } of parsed.data) {
    const hls = cctv.imageData.streamingVideoURL.trim();
    const mjpeg = cctv.imageData.static.currentImageURL.trim();
    if (!hls && !mjpeg) continue;

    const lat = Number(cctv.location.latitude);
    const lng = Number(cctv.location.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) continue;

    cameras.push({
      caltransId: cctv.index,
      district: Number(cctv.location.district),
      route: routePrefix(cctv.location.routeName),
      direction: cctv.location.routeSuffix || null,
      mileMarker: cctv.location.milepost || null,
      description:
        cctv.imageData.imageDescription ||
        `${routePrefix(cctv.location.routeName)} ${cctv.location.routeSuffix} @ ${cctv.location.nearbyPlace}`.trim(),
      lat,
      lng,
      streamUrl: hls || mjpeg,
      streamType: hls ? "hls" : "mjpeg",
      isActive: cctv.inService.toLowerCase() === "true",
    });
  }

  return cameras;
}
```

Create `packages/sync/src/index.ts`:
```ts
export * from "./caltrans.js";
export * from "./sync.js";
```

- [ ] **Step 7: Install + run test**

```bash
pnpm install
pnpm --filter @caltrans/sync test
```

Expected: PASS (all 4 tests).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(sync): parse CalTrans D4 CCTV GeoJSON into Camera rows"
```

---

### Task 6: CalTrans D4 catalog sync — upsert

**Files:**
- Create: `packages/sync/src/sync.ts`, `packages/sync/src/sync.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/sync/src/sync.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { syncCameras } from "./sync.js";
import type { NewCamera } from "@caltrans/db";

const sample: NewCamera = {
  caltransId: "TVD04--001",
  district: 4,
  route: "I-880",
  direction: "N",
  mileMarker: "32.10",
  description: "I-880 N @ 23RD AVE",
  lat: 37.789,
  lng: -122.234,
  streamUrl: "https://example.com/playlist.m3u8",
  streamType: "hls",
  isActive: true,
};

describe("syncCameras", () => {
  it("fetches, parses, and upserts cameras", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              cctv: {
                index: sample.caltransId,
                recordTimestamp: { recordDate: "", recordTime: "" },
                location: {
                  district: "04",
                  countyName: "ALAMEDA",
                  routeName: "880",
                  routeSuffix: "N",
                  nearbyPlace: "23RD AVE",
                  longitude: "-122.234",
                  latitude: "37.789",
                  milepost: "32.10",
                  elevation: "20",
                },
                inService: "True",
                imageData: {
                  imageDescription: "I-880 N @ 23RD AVE",
                  streamingVideoURL: sample.streamUrl,
                  static: { currentImageURL: "" },
                },
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const upserts: NewCamera[] = [];
    const fakeDb = {
      insert: () => ({
        values: (rows: NewCamera[]) => ({
          onConflictDoUpdate: () => {
            upserts.push(...rows);
            return Promise.resolve();
          },
        }),
      }),
    };

    const result = await syncCameras({
      db: fakeDb as never,
      fetch: fakeFetch as never,
      url: "https://caltrans/d4.json",
    });

    expect(result.count).toBe(1);
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({
      caltransId: "TVD04--001",
      route: "I-880",
      streamType: "hls",
    });
    expect(fakeFetch).toHaveBeenCalledWith("https://caltrans/d4.json", expect.any(Object));
  });

  it("throws on non-200 response", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(new Response("nope", { status: 503 }));
    await expect(
      syncCameras({
        db: {} as never,
        fetch: fakeFetch as never,
        url: "https://x",
      }),
    ).rejects.toThrow(/503/);
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
pnpm --filter @caltrans/sync test
```

Expected: FAIL — `syncCameras` not exported.

- [ ] **Step 3: Implement sync**

Create `packages/sync/src/sync.ts`:
```ts
import { cameras, type Db } from "@caltrans/db";
import { sql } from "drizzle-orm";
import { parseCalTransResponse } from "./caltrans.js";

export const CALTRANS_D4_URL =
  "https://cwwp2.dot.ca.gov/data/d4/cctv/cctvStatusD04.json";

export interface SyncDeps {
  db: Db;
  fetch: typeof globalThis.fetch;
  url?: string;
}

export async function syncCameras(
  deps: SyncDeps,
): Promise<{ count: number; syncedAt: Date }> {
  const url = deps.url ?? CALTRANS_D4_URL;
  const res = await deps.fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`CalTrans fetch failed: ${res.status}`);
  }
  const json = await res.json();
  const rows = parseCalTransResponse(json);

  if (rows.length === 0) {
    return { count: 0, syncedAt: new Date() };
  }

  await deps.db
    .insert(cameras)
    .values(rows)
    .onConflictDoUpdate({
      target: cameras.caltransId,
      set: {
        district: sql`excluded.district`,
        route: sql`excluded.route`,
        direction: sql`excluded.direction`,
        mileMarker: sql`excluded.mile_marker`,
        description: sql`excluded.description`,
        lat: sql`excluded.lat`,
        lng: sql`excluded.lng`,
        streamUrl: sql`excluded.stream_url`,
        streamType: sql`excluded.stream_type`,
        isActive: sql`excluded.is_active`,
        lastSyncedAt: sql`now()`,
      },
    });

  return { count: rows.length, syncedAt: new Date() };
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm --filter @caltrans/sync test
```

Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(sync): upsert cameras into Postgres with conflict resolution"
```

---

### Task 7: Next.js app scaffold

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.ts`, `apps/web/tailwind.config.ts`, `apps/web/postcss.config.mjs`, `apps/web/app/layout.tsx`, `apps/web/app/globals.css`, `apps/web/app/page.tsx`

- [ ] **Step 1: Package manifest**

Create `apps/web/package.json`:
```json
{
  "name": "@caltrans/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@caltrans/db": "workspace:*",
    "@caltrans/sync": "workspace:*",
    "@supabase/ssr": "^0.5.0",
    "@supabase/supabase-js": "^2.45.0",
    "clsx": "^2.1.1",
    "geist": "^1.3.1",
    "next": "15.0.0",
    "react": "19.0.0",
    "react-dom": "19.0.0",
    "tailwind-merge": "^2.5.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.0.0-beta.7",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "eslint": "^9.0.0",
    "eslint-config-next": "15.0.0",
    "tailwindcss": "^4.0.0-beta.7",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: TS config**

Create `apps/web/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Next config**

Create `apps/web/next.config.ts`:
```ts
import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  experimental: { typedRoutes: true },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cwwp2.dot.ca.gov" },
    ],
  },
};

export default config;
```

- [ ] **Step 4: PostCSS + Tailwind v4**

Create `apps/web/postcss.config.mjs`:
```js
export default { plugins: { "@tailwindcss/postcss": {} } };
```

Create `apps/web/tailwind.config.ts`:
```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: { extend: {} },
};
export default config;
```

- [ ] **Step 5: Global styles + design tokens**

Create `apps/web/app/globals.css`:
```css
@import "tailwindcss";

@theme {
  --color-background: #ffffff;
  --color-foreground: #000000;
  --color-neutral-50: #fafafa;
  --color-neutral-100: #f0f0f0;
  --color-neutral-200: #e5e5e5;
  --color-neutral-300: #d4d4d4;
  --color-neutral-500: #737373;
  --color-neutral-700: #404040;

  --font-sans: var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-geist-mono), ui-monospace, "SF Mono", monospace;

  --radius: 4px;
}

* {
  border-color: var(--color-neutral-200);
}

html,
body {
  background: var(--color-background);
  color: var(--color-foreground);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
}

::selection {
  background: var(--color-foreground);
  color: var(--color-background);
}
```

- [ ] **Step 6: Root layout with Geist fonts**

Create `apps/web/app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "CalTrans CCTV",
  description: "Bay Area traffic CCTV monitoring",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 7: Placeholder home page**

Create `apps/web/app/page.tsx`:
```tsx
export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <span className="font-mono text-sm tracking-tight">CalTrans CCTV — booting</span>
    </main>
  );
}
```

- [ ] **Step 8: Install, build, commit**

```bash
pnpm install
pnpm --filter @caltrans/web typecheck
pnpm --filter @caltrans/web build
git add -A
git commit -m "feat(web): next.js 15 + tailwind v4 + geist fonts scaffold"
```

Expected: typecheck exits 0, build emits `.next` output.

---

### Task 8: Env validation + Supabase clients

**Files:**
- Create: `apps/web/lib/env.ts`, `apps/web/lib/supabase/server.ts`, `apps/web/lib/supabase/browser.ts`

- [ ] **Step 1: Env validation**

Create `apps/web/lib/env.ts`:
```ts
import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  DATABASE_URL: z.string().url().optional(),
  CRON_SECRET: z.string().min(16).optional(),
});

export const env = schema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  DATABASE_URL: process.env.DATABASE_URL,
  CRON_SECRET: process.env.CRON_SECRET,
});
```

- [ ] **Step 2: Server-side Supabase client**

Create `apps/web/lib/supabase/server.ts`:
```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // called from a Server Component — middleware will refresh
          }
        },
      },
    },
  );
}
```

- [ ] **Step 3: Browser-side Supabase client**

Create `apps/web/lib/supabase/browser.ts`:
```ts
import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/lib/env";

export function createClient() {
  return createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(web): supabase clients (server + browser) with env validation"
```

---

### Task 9: Auth middleware + login page

**Files:**
- Create: `apps/web/middleware.ts`, `apps/web/app/(auth)/layout.tsx`, `apps/web/app/(auth)/login/page.tsx`, `apps/web/app/auth/callback/route.ts`

- [ ] **Step 1: Middleware**

Create `apps/web/middleware.ts`:
```ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname.startsWith("/login") || pathname.startsWith("/auth");

  if (!user && !isAuthRoute) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    redirect.searchParams.set("next", pathname);
    return NextResponse.redirect(redirect);
  }

  if (user && pathname === "/login") {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/";
    return NextResponse.redirect(redirect);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/cron).*)"],
};
```

- [ ] **Step 2: Auth layout**

Create `apps/web/app/(auth)/layout.tsx`:
```tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white">
      <div className="w-full max-w-sm border border-neutral-200 p-8">{children}</div>
    </main>
  );
}
```

- [ ] **Step 3: Login page**

Create `apps/web/app/(auth)/login/page.tsx`:
```tsx
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.replace(params.get("next") ?? "/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h1 className="font-mono text-sm tracking-tight">CalTrans CCTV</h1>
      <label className="block">
        <span className="block text-xs uppercase tracking-wide text-neutral-500">Email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full border border-neutral-200 px-3 py-2 font-mono text-sm focus:border-black focus:outline-none"
        />
      </label>
      <label className="block">
        <span className="block text-xs uppercase tracking-wide text-neutral-500">Password</span>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full border border-neutral-200 px-3 py-2 font-mono text-sm focus:border-black focus:outline-none"
        />
      </label>
      {error && <p className="font-mono text-xs text-black">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full border border-black bg-black px-3 py-2 font-mono text-sm text-white disabled:opacity-40"
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Auth callback (future-proof for magic links)**

Create `apps/web/app/auth/callback/route.ts`:
```ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
```

- [ ] **Step 5: Build + commit**

```bash
pnpm --filter @caltrans/web typecheck
git add -A
git commit -m "feat(web): supabase auth middleware and login page"
```

---

### Task 10: App shell (auth-gated layout + top nav)

**Files:**
- Create: `apps/web/components/app-shell/top-nav.tsx`, `apps/web/components/app-shell/nav-link.tsx`, `apps/web/app/(app)/layout.tsx`, `apps/web/app/(app)/page.tsx`, `apps/web/app/(app)/map/page.tsx`, `apps/web/app/(app)/incidents/page.tsx`
- Delete: `apps/web/app/page.tsx` (moved into `(app)` group)

- [ ] **Step 1: Nav link client component**

Create `apps/web/components/app-shell/nav-link.tsx`:
```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

interface Props {
  href: string;
  label: string;
  shortcut: string;
}

export function NavLink({ href, label, shortcut }: Props) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
  return (
    <Link
      href={href}
      className={clsx(
        "flex items-center gap-2 border-b-2 px-3 py-3 font-mono text-xs uppercase tracking-widest",
        active ? "border-black text-black" : "border-transparent text-neutral-500 hover:text-black",
      )}
    >
      <span>{label}</span>
      <span className="text-[10px] text-neutral-300">{shortcut}</span>
    </Link>
  );
}
```

- [ ] **Step 2: Top nav**

Create `apps/web/components/app-shell/top-nav.tsx`:
```tsx
import { NavLink } from "./nav-link";

export function TopNav({ email }: { email: string }) {
  return (
    <header className="flex h-12 items-center justify-between border-b border-neutral-200 px-4">
      <div className="flex items-center gap-6">
        <span className="font-mono text-xs uppercase tracking-widest">CalTrans · D4</span>
        <nav className="flex items-center gap-1">
          <NavLink href="/" label="Wall" shortcut="g w" />
          <NavLink href="/map" label="Map" shortcut="g m" />
          <NavLink href="/incidents" label="Incidents" shortcut="g i" />
        </nav>
      </div>
      <span className="font-mono text-xs text-neutral-500">{email}</span>
    </header>
  );
}
```

- [ ] **Step 3: Gated layout**

Create `apps/web/app/(app)/layout.tsx`:
```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopNav } from "@/components/app-shell/top-nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col">
      <TopNav email={user.email ?? ""} />
      <div className="flex-1">{children}</div>
    </div>
  );
}
```

- [ ] **Step 4: Placeholder pages**

Delete the old `apps/web/app/page.tsx`.

Create `apps/web/app/(app)/page.tsx`:
```tsx
export default function WallPage() {
  return (
    <section className="p-6">
      <h1 className="font-mono text-sm uppercase tracking-widest">Live Wall</h1>
      <p className="mt-2 font-mono text-xs text-neutral-500">P2 will implement the grid here.</p>
    </section>
  );
}
```

Create `apps/web/app/(app)/map/page.tsx`:
```tsx
export default function MapPage() {
  return (
    <section className="p-6">
      <h1 className="font-mono text-sm uppercase tracking-widest">Map</h1>
      <p className="mt-2 font-mono text-xs text-neutral-500">P4 will implement the map here.</p>
    </section>
  );
}
```

Create `apps/web/app/(app)/incidents/page.tsx`:
```tsx
export default function IncidentsPage() {
  return (
    <section className="p-6">
      <h1 className="font-mono text-sm uppercase tracking-widest">Incidents</h1>
      <p className="mt-2 font-mono text-xs text-neutral-500">P5 will implement the table here.</p>
    </section>
  );
}
```

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm --filter @caltrans/web typecheck
git add -A
git commit -m "feat(web): auth-gated app shell with top nav + placeholder routes"
```

---

### Task 11: Cron route + Vercel config

**Files:**
- Create: `apps/web/app/api/cron/sync-cameras/route.ts`, `vercel.json`

- [ ] **Step 1: Cron route**

Create `apps/web/app/api/cron/sync-cameras/route.ts`:
```ts
import { NextResponse, type NextRequest } from "next/server";
import { createDb } from "@caltrans/db";
import { syncCameras } from "@caltrans/sync";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!env.CRON_SECRET || auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!env.DATABASE_URL) {
    return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 500 });
  }

  const db = createDb(env.DATABASE_URL);
  try {
    const result = await syncCameras({ db, fetch });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "sync failed" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Vercel cron config**

Create `vercel.json` at repo root:
```json
{
  "crons": [
    {
      "path": "/api/cron/sync-cameras",
      "schedule": "0 9 * * *"
    }
  ]
}
```

(09:00 UTC = 01:00/02:00 PT, off-peak for CalTrans.)

- [ ] **Step 3: Manual smoke note**

Append to `README.md`:
````markdown

## Manual sync trigger

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/sync-cameras
```

Expected JSON: `{ "count": <int>, "syncedAt": "<iso>" }`
````

- [ ] **Step 4: Typecheck + commit**

```bash
pnpm --filter @caltrans/web typecheck
git add -A
git commit -m "feat(web): cron route for nightly CalTrans D4 sync + vercel.json"
```

---

### Task 12: shadcn/ui primitives baseline

**Files:**
- Create: `apps/web/components.json`, `apps/web/lib/utils.ts`, `apps/web/components/ui/button.tsx`, `apps/web/components/ui/input.tsx`

- [ ] **Step 1: shadcn config**

Create `apps/web/components.json`:
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "app/globals.css",
    "baseColor": "neutral",
    "cssVariables": false
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

- [ ] **Step 2: cn util**

Create `apps/web/lib/utils.ts`:
```ts
import clsx, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 3: Button (mono variant set)**

Create `apps/web/components/ui/button.tsx`:
```tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center font-mono text-xs uppercase tracking-widest transition-colors disabled:opacity-40 disabled:pointer-events-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-black",
  {
    variants: {
      variant: {
        primary: "bg-black text-white hover:bg-neutral-700",
        secondary: "border border-neutral-300 bg-white text-black hover:border-black",
        ghost: "text-neutral-500 hover:text-black",
      },
      size: {
        sm: "h-7 px-2",
        md: "h-9 px-3",
        lg: "h-11 px-4",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";
```

Add the dep to `apps/web/package.json` dependencies:
```
"class-variance-authority": "^0.7.0",
```

- [ ] **Step 4: Input**

Create `apps/web/components/ui/input.tsx`:
```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-9 w-full border border-neutral-200 bg-white px-3 font-mono text-sm placeholder:text-neutral-300 focus:border-black focus:outline-none",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
```

- [ ] **Step 5: Install + typecheck**

```bash
pnpm install
pnpm --filter @caltrans/web typecheck
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(web): shadcn/ui baseline (button, input) with monochrome variants"
```

---

### Task 13: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Workflow**

Create `.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9.12.0
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
        env:
          NEXT_PUBLIC_SUPABASE_URL: https://placeholder.supabase.co
          NEXT_PUBLIC_SUPABASE_ANON_KEY: placeholder_anon_key_for_build_only
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "ci: typecheck, test, build on PR + main"
```

---

### Task 14: README polish + handoff notes

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace README with full handoff content**

Replace `README.md` contents with:
````markdown
# CalTrans CCTV Dashboard

Bay Area (CalTrans District 4) CCTV monitoring + incident clipping dashboard.

- **Design spec:** `docs/superpowers/specs/2026-05-16-caltrans-cctv-dashboard-design.md`
- **P1 plan (this one):** `docs/superpowers/plans/2026-05-16-p1-foundation.md`

## Stack

- Next.js 15 (App Router) + React 19, TypeScript strict
- Tailwind v4 (monochrome tokens), shadcn/ui
- Supabase (Postgres + Storage + Auth)
- Drizzle ORM
- pnpm workspaces + Turborepo
- Vercel deploy + Vercel Cron

## Workspace layout

```
apps/web         Next.js app
packages/db      Drizzle schema + typed client
packages/sync    CalTrans catalog parser + upsert
```

## First-time setup

1. Create Supabase project. Copy URL + anon key + service role + connection string.
2. Storage: create `clips` (private) and `thumbnails` (public) buckets.
3. `cp apps/web/.env.example apps/web/.env.local` and fill in values.
4. Apply migrations:
   ```bash
   DATABASE_URL="<pooler-url>" pnpm db:migrate
   ```
5. Seed cameras (manual trigger):
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync-cameras
   ```

## Dev

```bash
pnpm dev          # all packages
pnpm test         # vitest
pnpm typecheck    # tsc --noEmit across workspace
pnpm build        # production build
```

## Parallel phases (after P1 lands)

- **P2 — Live Wall** — `apps/web/app/(app)/page.tsx`, grid view + players
- **P3 — Buffer + Clipping** — `apps/web/lib/buffer/*`, MediaRecorder + IndexedDB
- **P4 — Map** — `apps/web/app/(app)/map/page.tsx`, MapLibre
- **P5 — Incidents** — `apps/web/app/(app)/incidents/*`, table + detail
- **P6 — Polish** — keyboard shortcuts, perf, error states

Each phase has its own plan file in `docs/superpowers/plans/`.

## Aesthetic

Pure black and white. No color. Status uses iconography, weight, and motion — never hue. See the design spec § "Aesthetic Spec" for the full token set.
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: project README with stack, setup, and parallel phase pointers"
```

---

## Validation Checklist (run at the end)

- [ ] `pnpm install` clean on fresh clone
- [ ] `pnpm typecheck` exits 0 across all workspaces
- [ ] `pnpm test` exits 0 (sync parser + upsert tests pass)
- [ ] `pnpm build` produces `.next` output successfully
- [ ] Visiting `/` while signed out redirects to `/login`
- [ ] Signing in with a seeded Supabase user reaches the Wall placeholder
- [ ] `curl` to the cron route with the correct bearer token returns `{ count: > 0 }` against a real Supabase
- [ ] `cameras` table contains > 200 rows after a successful sync

## Out of Scope (handled by later plans)

- Live video grid (P2)
- Rolling buffer + clipping (P3)
- Map view (P4)
- Incidents table + detail (P5)
- Command palette + keyboard shortcuts (P6)
