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
