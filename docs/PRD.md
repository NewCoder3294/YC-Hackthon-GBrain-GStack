# WatchDog — Product Requirements Document

**Hackathon:** GStack x GBrain (YC), May 16 2026
**Team:** Nick, Hari, Alex, Advaidh, Ishan
**Demo jurisdiction:** San Francisco Police Department
**Version:** 1.0 (hackathon scope)

---

## 1. Vision

WatchDog is an incident-fusion layer for municipal police departments that correlates live camera feeds, 911 audio, and citizen reports into a ranked queue for human dispatchers, with two structural choices that distinguish it from every incumbent: persistent institutional memory via GBrain (so the system gets smarter with every reviewed incident rather than resetting at shift change), and a citizen-facing audit dashboard with policy-as-code consent enforcement (so the camera owner has symmetric visibility into how their data is used).

The thesis in one sentence: existing platforms (Fusus, Flock, Motorola CommandCentral) aggregate feeds and sell exclusive access to police; WatchDog adds a memory layer and a citizen-side transparency layer that the incumbents have a structural commercial interest in never building.

## 2. The problem we're actually solving

We are not claiming to surface the 62% of unreported violent crime. That stat describes a problem cameras don't solve. The real problem is signal fragmentation: a 911 hangup at 23:47, a streetlight camera catching a fight three blocks away at 23:49, a Citizen-app post at 23:52, and a ShotSpotter ping at 23:54 currently sit in four separate systems watched by four separate humans. The dispatcher who needs to make a call has no unified view, no learned context from prior similar incidents, and no way to know that the silver sedan at the scene tonight is the same plate flagged at a different block last week.

WatchDog correlates those signals, ranks them, and surfaces them to a human dispatcher with prior context attached. Parallel to that, the camera owners who contributed feeds can see exactly which queries hit their data, by whom, and why.

## 3. Users

**Primary user (dispatcher side):** SFPD shift supervisor at a Real-Time Crime Center. Mid-career officer, screen-fatigued, juggling multiple tools, accountable for response decisions. Cares about: triage speed, defensibility of decisions, ability to justify dispatch choices to command and to the public.

**Primary user (citizen side):** San Francisco homeowner or small-business owner who has opted to share camera footage with SFPD under specified conditions. Cares about: knowing who accessed their footage and why, retaining granular control, evidence that their consent isn't being overrun.

**Out of scope for v1:** rank-and-file patrol officers (they consume dispatch decisions, they don't operate WatchDog), oversight boards and IGs (the audit log supports their work but they're not a primary user), and any non-California jurisdiction.

## 4. Scope: what we are and are not building in 12 hours

### In scope (must work, end-to-end)

- **Live camera detection.** One demo camera running an off-the-shelf object/event detector against a looped video file, producing real detection events into the fusion pipeline. Honest claim: "the system processes live camera feeds."
- **Multi-modal ingestion.** Three input types feeding the fusion layer: camera detection events, 911 call transcripts (synthetic, generated via TTS or scripted), and citizen reports submitted through a simple web form.
- **Incident fusion and ranking.** Correlation logic that joins signals across feeds within configurable spatial and temporal windows, producing ranked incident records with severity scoring.
- **GBrain memory layer.** Every reviewed incident, every dispatcher decision (act / dismiss / hold), every false-positive pattern, every neighborhood baseline gets written to GBrain. Future incidents are enriched at query time with relevant prior context surfaced from GBrain.
- **Dispatcher fusion timeline.** Ranked queue UI showing live incidents, each expandable to reveal contributing signals, GBrain-surfaced prior context, and a decision panel.
- **Citizen audit dashboard.** Camera-owner-facing view showing every access event against their feed, with full provenance: querying agency, badge number, incident reference, legal basis, footage actually pulled, outcome.
- **Policy-as-code consent layer.** Camera owners set policies (geofence, time-of-day, incident-type filters, warrant requirements) that are enforced as constraints at query time. Changes take effect immediately and are themselves logged.
- **OpenContribution registration flow.** A camera owner can register a new feed, set initial policies, and see their first audit log entry.

### Out of scope (named explicitly so we don't drift)

- Real RTSP / live video streaming infrastructure. The demo camera reads from a looped file.
- Real 911 audio. We use synthetic transcripts and scripted scenarios.
- Facial recognition of any kind. Not in v1, not in v2, not ever. California AB 1215. We detect objects, vehicles, and events, not people.
- Predictive identification of "gang members" or any other persons-of-interest classification. We detect coordinated incidents in space and time. The distinction is load-bearing.
- Autodispatch as a default behavior. Every alert is decision-supported, not decision-replacing. A future severity-tier gate for autodispatch is mentioned in v2 but not built.
- Ring/Nest integration. Mocked as "neighbor uploaded clip" in the demo. Real consumer doorbell integration is regulated dead territory after Ring's 2024 RFA shutdown and the 2026 Ring-Flock cancellation.
- Mobile app for citizen reports. Web form only.
- Multi-agency / federated deployment. SFPD only.

## 5. Core surfaces

### 5.1 Dispatcher fusion timeline

The primary screen. Left panel: a vertically scrolling ranked queue of active incidents, color-coded by severity, with a one-line summary and the count of contributing signals (e.g., "Possible assault — Mission & 16th — 3 signals — 02:14"). Top of the queue is the highest-ranked open incident.

Right panel, when an incident is selected: a timeline of contributing signals showing what came in when (camera detection at 02:14:03, 911 hangup at 02:14:11, citizen report at 02:15:42), with each signal expandable to show source detail. Below the timeline, a "Prior Context" section surfaced by GBrain: similar incidents at this location, recent false-positive patterns for this signal combination, neighborhood baseline ("this corner has averaged 0.4 violent calls per week over the last 90 days; current week is at 3"). Below that, the decision panel: Act / Hold / Dismiss buttons, each requiring a brief reason that gets written back to GBrain.

The "Dismiss" button is the most important UI element on this screen. It must be one click, must require a reason, and must visibly write to GBrain so the system learns. Demonstrating a dismissal is the move that separates this from a Fusus clone.

### 5.2 Citizen audit dashboard

The differentiator screen. A logged-in camera owner sees a reverse-chronological list of access events against their registered cameras. Each row: timestamp, querying agency (SFPD), badge or analyst ID, incident reference, claimed legal basis (warrant / exigent / standing consent under policy), footage clip pulled (viewable inline), and outcome (contributed to arrest / contributed to dismissed alert / open).

Aggregate stats at top: queries this month, breakdown by agency, breakdown by outcome (especially: how many access events led to no enforcement action, which is the honest answer that no incumbent shows).

Policy controls live on the same page: editable geofence, time windows, incident-type filters, warrant requirement toggle. Changes are saved, take immediate effect on subsequent queries, and appear as their own entries in the audit log.

### 5.3 OpenContribution registration

Minimal flow. A new camera owner provides location, camera type (mocked, since we're not doing real integration), and selects a starting policy profile (we'll ship three: strict, balanced, permissive, with the option to customize). On completion, they land on the audit dashboard with one synthetic past access event already populated so the screen isn't empty.

## 6. Success criteria

### For the hackathon judges

- A clean three-minute demo that walks through one incident from signal arrival through dispatcher decision through citizen-side audit entry, end to end.
- A defensible answer to "isn't this just Fusus?" delivered in one sentence by every team member.
- A defensible answer to "what does GBrain actually do here?" delivered in one sentence by every team member.
- A working policy change on the citizen side that visibly affects what a subsequent query can pull.

### For ourselves (does the product hold up to prodding)

- A judge can ask "show me a false positive" and we can pull one up that shows dispatcher dismissal feeding back into GBrain.
- A judge can ask "what does the homeowner see right now if SFPD queries their camera?" and we can demonstrate it live.
- A judge can ask "what stops SFPD from just querying everything?" and the policy-as-code layer enforces the answer in front of them.

## 7. What v2 looks like (post-hackathon north star)

We're not building these but agreeing on them now keeps the team aligned past Sunday:

- Real RTSP ingestion with a Frigate-style edge layer.
- Cross-jurisdictional federation (Bay Area regional deployment).
- Genuinely independent third-party audit of the GBrain query logs (the "policy-as-code for surveillance access" thesis turned into a product line for civilian oversight boards).
- A protocol spec for citizen-owned camera data, vendor-neutral, that any RTCC platform could implement. This is the Garry's-List-aligned long-term play.
- A formal severity-tier framework for limited autodispatch on narrow, statutorily-permitted call types (officer-down, corroborated gunshot).

## 8. Non-goals

We will not pursue, even if asked by judges:

- Selling to private security firms or HOAs in v1. SFPD is the buyer; broadening the buyer set dilutes every design decision.
- Building a small-jurisdiction "RTCC in a box." Real gap in the market, wrong wedge for us.
- Generalized oversight analytics (Truleo-style officer behavior monitoring). Adjacent good idea, different product.

## 9. Risks and how we're handling them

**The "predictive policing" framing kills us in the Q&A.** Mitigated by precision: we surface signals and prior context, we do not score persons. No risk scores attached to humans appear anywhere in the UI.

**Demo data feels staged.** Mitigated by writing the demo script first (see DEMO_SCRIPT.md) and generating data to fit a realistic narrative arc, not a triumphant one. The false-positive dismissal in the demo is the proof that we're not cherry-picking.

**A judge with civil-liberties background corners us on Toledo / Durham / CalGang.** Mitigated by leading with Durham as our reference case ("Peregrine's contract was pulled because it was a black box; here's the box opened") rather than waiting to be asked.

**GBrain is being used as decoration.** Mitigated by making GBrain's contribution a visible, demonstrable part of the dispatcher screen. If GBrain were removed, the "Prior Context" panel would be empty. Judges should be able to see that dependency.
