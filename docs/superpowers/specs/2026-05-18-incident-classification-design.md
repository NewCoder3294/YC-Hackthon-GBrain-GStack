# Incident classification — design (Spec C)

**Status:** designed, not yet implemented
**Date:** 2026-05-18
**Motivation:** Today the `request_camera_access` enforcer matches
`blocked_incident_types` via a word-boundary regex against the incident
title (migration 0010). That's honest enough to avoid the
"`fight` matches `firefighter rescue`" bug, but the homeowner is still
typing keywords against unstructured free-text. Production needs a
structured classification — both for accurate policy gating and for any
future cross-incident analytics, aggregates, or trend lines.

## Out of scope (covered elsewhere)
- The enforcer RPC itself — already calls `incidents.title`; will swap to
  `incidents.category` once the column lands.
- The dispatcher decision flow.

## In scope

1. New `incidents.category text` column with a CHECK constraint against a
   small enum: `traffic | property | violence | weapons | crowd | drug |
   suspicious | medical | other`.
2. Writer updates (every ingest path that inserts into `incidents`):
   - `packages/openclaw-worker` → set `category` when fusing signals
   - `apps/web/app/api/cron/correlate` → set from upstream signal types
   - `scripts/seed-demo.ts` → set on the demo incident
   - Live-incident sync paths that derive incidents from CAD calls →
     map from CAD call type to category
3. Backfill: one-time `UPDATE incidents SET category = <inferred>` SQL,
   driven by title keywords. Anything ambiguous → `other`.
4. Enforcer swap: migration 0011 updates `request_camera_access` to
   match `lower(incidents.category) = ANY(blocked_categories)` —
   exact match on the enum, no regex.
5. Policy editor UI: dropdown of category enum values instead of the
   current free-form `blocked_incident_types: string[]` input. Renames
   the column to `blocked_categories` for clarity.
6. Migration of existing `blocked_incident_types` data: best-effort map
   from existing keywords ("fight" → "violence", etc.); anything that
   doesn't map gets dropped with a logged warning.

## Architectural notes

- Keep `category` nullable for backwards compatibility — writers can
  ship the rename ahead of the column. UI degrades gracefully if NULL.
- `category` is intentionally coarse (9 values). Sub-categorisation
  ("battery vs aggravated assault") belongs to a separate `subcategory`
  column or `category_tags` join table — out of scope for v1.
- The enum is exposed to the policy editor as a static array; if
  Postgres CHECK and the TS enum drift, that's a bug — share via a
  generated types file in `packages/db`.

## Sequencing

1. Migration 0011: add column + CHECK + index.
2. Drizzle schema + types regen.
3. Update writers (one PR each: correlator, openclaw, seed).
4. Backfill migration 0012.
5. Enforcer swap migration 0013 + RPC contract tests.
6. Policy editor UI rewrite + data migration of `blocked_incident_types`
   → `blocked_categories`.

## Why deferred

Spec A and Spec B both unblock immediate work. Spec C touches the
correlator and OpenClaw worker (Python + TS), the policy UI, and a
backfill — five separate review surfaces. Better landed in its own
planning + execution cycle than glommed onto the policy-enforcer
work. The word-boundary regex in migration 0010 holds the line until
this lands.
