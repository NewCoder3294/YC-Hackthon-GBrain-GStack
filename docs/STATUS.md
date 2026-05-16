# Repo scope vs. WatchDog system

This repo (`caltrans-cctv`) implements **the dispatcher-side web app**:
Next.js 15, Tailwind, Supabase, Drizzle. It is the "Surfaces" layer in
TRD §1 — primarily Alex's track in TRD §6.

The TRD describes a wider system with components this repo does not contain:

| TRD component | Stack in TRD | Where it lives |
|---|---|---|
| YOLOv8 camera detector | Python | not in this repo |
| 911 transcript generator | Python | not in this repo |
| Correlator / fusion engine | Python (FastAPI) | not in this repo |
| GBrain integration | Python + Supabase | not in this repo |
| Policy-as-code enforcer | Python | not in this repo |
| Dispatcher UI | Next.js | **this repo** |
| Citizen audit dashboard | Next.js | **this repo** (planned) |

If you're picking up a non-dispatcher track, ask Nick where that code lives
before assuming it's here. If you're working in this repo, the relevant
sections of the TRD are §1 (Architecture), §3 (Data model — incidents,
cameras, policies, access_events), §5.1 (Dispatcher fusion timeline),
§5.2 (Citizen audit dashboard), §6 (your interface contract with the other
tracks), and §10 (failure-mode fallbacks the UI must support).

The Next.js phase plans in `superpowers/plans/` (P1–P6) are the concrete
execution plan for this repo specifically.
