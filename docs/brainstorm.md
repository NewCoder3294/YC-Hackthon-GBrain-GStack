# GStack x GBrain — Brainstorming + Notes

Origin doc for the WatchDog hackathon. Preserved as-is for context on how the
idea evolved. For current scope and architecture, see `PRD.md` and `TRD.md`.

---

## Project ideas

GBrain multi-agent support / orchestration.

## Notes (based on usage / testing)

- **GStack:** a pack of 23 Claude Code slash commands that script roles like
  CEO, eng manager, designer, QA, and release manager into your workflow
  (`/plan-ceo-review`, `/ship`, `/review`, `/qa`, etc).
- **GBrain:** a persistent memory layer for AI agents. Markdown notes get
  turned into a self-wiring knowledge graph (Postgres + pgvector) so the agent
  remembers across sessions instead of starting cold every time.

## People

- Nick — data cleaning (refer to past project)
- Hari —
- Alex —
- Adhvaidh —
- Ishan —

## WatchDog

### Relevant statistics

- 62% of violent crimes in major urban areas go completely unreported to law
  enforcement (Bureau of Justice Statistics).

### Concept

Live security cameras / feed that detects and logs a crime.

Also can add multi-modal (phone call / mobile and web app).

Detected crimes get added to a real-time / cumulative knowledge graph which
uses GBrain to do a myriad of possible things:

- **Real-time / proactive allocation** of policing resources to mitigate and
  soften crime, including detecting things like gang activity.

  Example (modeled on real LA gang violence, gang names switched out for
  generalizability):

  > Gang A has committed 3 shootings against Gang B in the last week. Gang B
  > was spotted crossing Road X at 2:30 AM. Road X, according to GBrain's
  > analysis of trends, is likely a line marker dividing Gang A and Gang B's
  > territory, so WatchDog will look at current active police / squad car
  > distribution and intelligently allocate them to possibly mitigate and
  > prevent any possible activity by Gang B.

- **Historic trend analysis** to provide better long-term allocation of police.
  This can avoid / catch underpolicing / indiscriminate policing in poorer
  regions, which has negatively affected poor families a lot in the past.

- **OpenContribution** — anybody with security cameras should be able to opt
  in and contribute / integrate into our infra.

> Note: the predictive-gang-allocation framing above was rescoped in the PRD.
> v1 surfaces signals and prior context about places and patterns; it does
> not score people. See PRD §9 "Risks."

## Action items

- Play around with GBrain x GStack (all)
- Read up on material + Gary Tan's task list (all)
- Investigate if any existing YC companies use GStack
- Produce TRD and PRD (Hari; ASAP) — done, see `PRD.md` and `TRD.md`
- Delegate roles / scope based on that — see TRD §6 "Component ownership"

## Main idea

- Company brain
- Screen recording for GBrain
- Run workflows based on knowledge graph
- Abstraction (company brain + individual-level brain)

## Side notes

- Take data cleaning from hindsight.
