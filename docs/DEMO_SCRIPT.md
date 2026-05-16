# WatchDog — Demo Script

**Format:** 3-minute live walkthrough + Q&A. Backup video recorded by hour 11.
**Presenter:** TBD (recommend the person who can deliver the Fusus and GBrain one-liners cleanly under pressure).

---

## The scenario

It is 02:14 on a Saturday in San Francisco's Mission District. A streetlight camera registered by the city detects rapid movement and what its pose model classifies as fighting at Mission and 16th. Eleven seconds later, a 911 call comes in from the same block; the caller hangs up before describing the incident. Two minutes later, a citizen using the WatchDog reporting form submits a note saying she saw two men arguing outside the BART entrance.

Without WatchDog, the SFPD shift supervisor sees three things in three systems and has to manually correlate. With WatchDog, she sees one ranked incident with all three signals attached and a context panel telling her this corner has had four similar alerts in the last month, three of which were dismissed as the same group of regulars arguing outside the bar at closing time. She holds the dispatch, requests camera footage to confirm, and within thirty seconds is able to make an informed call.

Parallel to that: the streetlight camera in question belongs to a homeowner who registered it under a "balanced" policy. She wakes up Sunday morning, opens her WatchDog citizen dashboard, and sees exactly what happened: SFPD queried her camera at 02:17, the query was allowed under exigent-circumstances given the severity score, and the outcome was "dismissed alert, no enforcement action."

That round trip is the demo.

## The script

### Opening (0:00 – 0:25) — frame the problem

> "Existing public-safety platforms are dashboards. They aggregate feeds and sell exclusive access to police. None of them have a memory, and none of them give the people whose cameras are being queried any visibility into how their data is used. WatchDog adds both. We're built on GBrain, which is the institutional memory layer, and a policy-as-code consent layer that the camera owner controls.
>
> I'll show you one incident end to end, from signal arrival, through dispatcher decision, through the citizen's view of what happened."

(Pull up the dispatcher view, queue empty.)

### Signals arrive (0:25 – 0:55) — show ingestion

> "It's 02:14. A camera at Mission and 16th detects fighting."

(A new signal appears in the queue. The camera tile lights up. Show the YOLOv8 bounding box on the looped video for 2 seconds.)

> "Eleven seconds later, a 911 hangup from the same block."

(Second signal appears, queue updates to show "2 signals correlated".)

> "Two minutes later, a citizen report through our web form, same location."

(Third signal lands. The incident is now ranked #1 in the queue, marked "high severity, 3 signals".)

### Dispatcher view (0:55 – 1:35) — show fusion and GBrain context

(Click on the incident.)

> "This is what a shift supervisor sees. The three signals on a timeline. The camera clip, playable inline. The 911 audio transcript. The citizen report. And down here, the part nobody else has."

(Scroll to "Prior Context" panel.)

> "GBrain has surfaced four similar incidents at this corner in the last month. Three of them were dismissed by dispatchers after review. The pattern was the same: late-night fight-detection at Mission and 16th, no follow-up enforcement. The system has learned this is the bar-closing crowd, and it's surfacing that context to the supervisor before she decides anything.
>
> She still has to decide. Watch."

(Click "Hold — request camera footage to verify." Reason field: "matches recurring false-positive pattern, verify before dispatch.")

> "That decision just got written back to GBrain. The next time this signal combination shows up at this corner, the system will surface this dismissal too."

### Citizen side (1:35 – 2:15) — the differentiator

> "But that camera at Mission and 16th belongs to someone. Let me show you what she sees."

(Switch tabs to the citizen audit dashboard, logged in as the camera owner.)

> "Here's her dashboard. Every query against her camera, ever. Last night, SFPD requested footage at 02:17. Click for detail."

(Click the row.)

> "Requesting officer, badge number, the incident reference, the legal basis claimed (exigent circumstances, severity-based), the policy version that was active at the time, and the actual clip that was pulled. She can play it. And here at the bottom: the outcome. Dismissed alert, no enforcement action.
>
> No incumbent shows this. Fusus doesn't. Flock doesn't. Ring tried something like this and shut it down in 2024 because they couldn't reconcile police access with consumer trust. Our answer is that the consent isn't a checkbox, it's enforced as code."

(Click the policy editor.)

> "She can tighten the policy right now. Warrant required for any query, no exigent override."

(Toggle the warrant_requirement from `exigent_ok` to `always`.)

(Switch back to dispatcher view. Click "request access" on a new incident at the same camera.)

> "Now watch what happens dispatcher-side when the same officer tries to pull footage."

(Denial message appears: "blocked by owner policy — warrant required.")

(Switch back to citizen view. The denied request is now in her audit log.)

> "She sees the denied request too. The audit is symmetric."

### Close (2:15 – 2:45) — the thesis

> "Three claims. WatchDog correlates fragmented signals so dispatchers can triage faster. It builds institutional memory in GBrain so the system gets smarter every shift instead of resetting. And it gives the people contributing cameras the same visibility into how their data is used that the police have. The first claim is table stakes. The second is what we think GBrain is uniquely good at. The third is the part nobody is building, and the part that makes this defensible."

(Hold on a final screen showing both UIs side by side.)

### Reserved final 15 seconds

For "Garry's List is about telling people what's actually happening; this is that thesis applied to surveillance," if it lands naturally. Skip if the demo ran long.

## Q&A preparation

### "Isn't this just Fusus?"

> "Fusus is a closed network sold to police. We add a memory layer they don't have and a citizen-side audit layer they have a structural commercial interest in never building. Their buyer is the department. Our buyer is the department and our user includes the homeowner whose camera is being queried."

### "What does GBrain actually do here?"

> "GBrain is the institutional memory. Every reviewed incident, every dispatcher decision, every false-positive pattern, every neighborhood baseline is a GBrain record. When a new incident comes in, we query GBrain at display time so the supervisor sees relevant prior context before she decides. Without GBrain, the prior-context panel is empty. The system would still triage, but it wouldn't get smarter."

### "How is this not predictive policing?"

> "Predictive policing scores people. We don't score people. We correlate signals in space and time and surface prior context about places and patterns. No risk scores attached to humans appear anywhere in the UI. There's no facial recognition. There's no gang database. The pattern memory is about signal combinations and locations, not identities."

### "What about the Peregrine situation in Durham?"

> "Durham pulled Peregrine because it was a black box. Auditability was claimed but not demonstrable. Our entire citizen-side dashboard exists because we expect to be in that hearing, and we want to be able to hand the city council a working transparency layer instead of a policy document."

### "What stops SFPD from just always claiming exigent circumstances?"

> "Two things. Every claim is logged with the officer ID and the incident reference, so a pattern of exigent claims by one officer that don't lead to enforcement actions is visible in the audit log. And the homeowner can set warrant-always, which removes the exigent override entirely. You saw it work."

### "How do you get camera owners to opt in?"

> "Not our problem to solve in 12 hours. Plausible answers include partnership with merchant associations, BID-level programs, and the obvious commercial pitch: 'your camera will be queried by police anyway if there's an incident on your block; do you want that to happen through a process you control with full visibility, or through a process you find out about via subpoena?' But this is a v2 go-to-market question, not an architecture question."

### "What's the business model?"

> "SaaS license to the department, priced per dispatcher seat. The citizen layer is free to the homeowner, mandatory to deploy. We see ourselves as a tier above Fusus and Flock, with built-in regulatory defense as part of the product. Pricing target similar to current RTCC tooling."

### "Why hasn't anyone built this?"

> "Because the incumbents' business model is exclusivity of police access to camera data, and the citizen-side transparency layer directly undermines that. Building this requires either being a new entrant or having a different ideological starting point than the existing players. We're the first one we know of, and we think the regulatory direction (post-Ring-2024, post-Durham, AB 1215) makes the next wave of procurement winnable by the platform that solves transparency before being forced to."

## Things that will go wrong and what to do

**The camera detection lags or stutters during demo.** Don't wait. Move on to the 911 signal. The detection will catch up. If it never does, the prerecorded video has the camera moment.

**A judge asks something nobody has prepped for.** Default answer: "Honest answer is we haven't built that yet. Here's how we'd think about it." Never bluff. Bluffing in front of YC judges is the actual cardinal sin.

**Someone asks about facial recognition during Q&A.** Answer is one sentence: "We don't do it. California AB 1215. Not in v1, not on the roadmap."

**The dispatcher UI crashes mid-demo.** Pivot to the citizen view. The citizen view is the differentiator anyway and is the screen the judges will remember. Buy time on the dispatcher view via the recorded backup.

**Someone challenges the GBrain dependency as fake.** Pull up the GBrain CLI live. Show records being written. The seed data and the live-written records should both be visible. This is why we don't fake the GBrain integration even under time pressure.

## Final pre-demo checklist (hour 11:45)

- [ ] Two browser windows open: dispatcher view, citizen view. Both logged in.
- [ ] Both views on hot-reload-friendly dev servers; restarts under 5 seconds.
- [ ] Camera feed playing on loop. Detection events flowing.
- [ ] GBrain seeded with 30+ prior records. Verify the prior-context panel populates for the demo scenario.
- [ ] Demo scenario script timing rehearsed: signal sequence must complete within 30 seconds of "it's 02:14."
- [ ] Backup video is in a tab, queued, audio level set.
- [ ] Phone hotspot ready in case the venue wifi degrades.
- [ ] Water for the presenter. This is the most-forgotten one.
