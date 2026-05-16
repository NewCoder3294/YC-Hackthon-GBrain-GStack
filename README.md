# CalTrans CCTV Dashboard

Bay Area (CalTrans District 4) CCTV monitoring + incident clipping dashboard.

- **Repo:** https://github.com/NewCoder3294/YC-Hackthon-GBrain-GStack
- **Vercel:** https://vercel.com/worklessteam-9027s-projects/caltrans-cctv
- **Supabase:** https://supabase.com/dashboard/project/stfxqaocnyhkumapmbjw

## Docs

Start here in this order — each builds on the previous:

1. **[`docs/PRD.md`](docs/PRD.md)** — WatchDog product requirements. What we're
   building and why. Read first.
2. **[`docs/TRD.md`](docs/TRD.md)** — technical requirements. Architecture,
   data model, component ownership across the 5-person team.
3. **[`docs/STATUS.md`](docs/STATUS.md)** — what's in this repo vs. what lives
   elsewhere in the wider WatchDog system. Read before assuming a component
   is here.
4. **[`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md)** — the 3-minute demo
   walkthrough and Q&A prep. The whole team should be able to deliver this.
5. **[`docs/superpowers/specs/2026-05-16-caltrans-cctv-dashboard-design.md`](docs/superpowers/specs/2026-05-16-caltrans-cctv-dashboard-design.md)** —
   design spec for the dispatcher dashboard.
6. **[`docs/superpowers/plans/`](docs/superpowers/plans/)** — phase plans
   (P1 done, P2–P6 to be written as phases are claimed).
7. **[`docs/brainstorm.md`](docs/brainstorm.md)** — origin notes, kept for
   context.

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

## Teammate onboarding (5 minutes)

1. **Get added to the Supabase project, GitHub repo, and Vercel project.** Ask Nicolas.
2. **Clone + install:**
   ```bash
   git clone https://github.com/NewCoder3294/YC-Hackthon-GBrain-GStack.git caltrans-cctv
   cd caltrans-cctv
   pnpm install
   ```
3. **Pull env vars from Vercel** (one command — no manual copying):
   ```bash
   npx vercel link --yes --project caltrans-cctv
   npx vercel env pull apps/web/.env.local
   ```
   That populates `apps/web/.env.local` with everything: Supabase URL, anon key, service role, `DATABASE_URL`, and `CRON_SECRET`. No need to hunt through dashboards.
4. **Run dev:**
   ```bash
   pnpm dev
   ```
   Open http://localhost:3000 — you'll be redirected to `/login`. Sign in with a Supabase Auth user (create one in the Supabase dashboard → Authentication → Users).
5. **Seed cameras** (one-time, only if the `cameras` table is empty):
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync-cameras
   ```

## Dev commands

```bash
pnpm dev          # all packages
pnpm test         # vitest
pnpm typecheck    # tsc --noEmit across workspace
pnpm build        # production build
```

## Deploys

- **Production:** every push to `main` auto-deploys to https://caltrans-cctv.vercel.app
- **Preview:** every PR gets its own preview URL with the same env vars
- **Cron:** `/api/cron/sync-cameras` runs daily at 09:00 UTC, gated by `CRON_SECRET`

Don't merge anything to `main` without Nicolas's approval.

## Parallel phases (claim one)

After P1 (foundation, done), these can each be worked in parallel — pick one and open a branch:

- **P2 — Live Wall** — `apps/web/app/(app)/page.tsx`, grid view + HLS/MJPEG players
- **P3 — Buffer + Clipping** — `apps/web/lib/buffer/*`, MediaRecorder + IndexedDB rolling buffer
- **P4 — Map** — `apps/web/app/(app)/map/page.tsx`, MapLibre + desaturated tiles
- **P5 — Incidents** — `apps/web/app/(app)/incidents/*`, data table + detail page
- **P6 — Polish** — keyboard shortcuts, perf, empty/error states

Each phase has (or will have) its own plan file in `docs/superpowers/plans/`. Ask Nicolas before starting work on a phase that doesn't yet have a plan.

## Aesthetic — non-negotiable

Pure black and white. No color. Status uses iconography, weight, and motion — never hue. See the design spec § "Aesthetic Spec" for the full token set.

## Branch + commit conventions

- Branch names: `feat/p<N>-<short-name>` (e.g. `feat/p2-live-wall`)
- Commits: conventional commits — `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `perf:`
- Commit subject ≤72 chars, imperative mood, no period
- Tests required for parser/data-layer code; UI changes can ship without (we'll add Playwright in P6)
