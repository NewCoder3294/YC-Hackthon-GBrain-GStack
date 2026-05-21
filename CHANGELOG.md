# Changelog

All notable changes to WatchDog will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 1.0.0 (2026-05-21)


### Features

* /feed tab — SF crime news in a dedicated UI ([568327e](https://github.com/NewCoder3294/watchdog/commit/568327e505c0319d245162f83ff6d0f8d400c9bb))
* /openclaw realtime tab + flip worker default to fusion mode ([7ecaba4](https://github.com/NewCoder3294/watchdog/commit/7ecaba46fba62025d638096c218c52458cccf5fe))
* **api:** policy-enforcer wrappers for incident + ad-hoc camera requests ([8447188](https://github.com/NewCoder3294/watchdog/commit/84471887c9c1369d906fcea328a2ce9770efc13e))
* **audit:** visibility-aware live refresh on /c/[token] ([9a8dd7c](https://github.com/NewCoder3294/watchdog/commit/9a8dd7c58db63487d56a9c5e89dc6a55594c13bb))
* **auth:** dispatcher role gate on enforcer routes + recordDecision ([c53fa54](https://github.com/NewCoder3294/watchdog/commit/c53fa54154570094c79c3b384fb48e0f588856d3))
* **baseline:** GBrain pages/tags upsert writer (ON CONFLICT source_id,slug) ([c2f2480](https://github.com/NewCoder3294/watchdog/commit/c2f2480feca162dee3b183f023a0092d424fb281))
* **baseline:** pure DataSF→neighborhood metrics aggregation + disparity ([f5222c7](https://github.com/NewCoder3294/watchdog/commit/f5222c72f7da935d8e78cb25a638366176ed3052))
* **baseline:** pure GBrain page builder (baseline/rollup/disparity) ([ed48047](https://github.com/NewCoder3294/watchdog/commit/ed4804713f1c4c87690be90507d81cacd3ee1f6a))
* **baseline:** worker IO shell + baseline script wiring ([323e527](https://github.com/NewCoder3294/watchdog/commit/323e527ec4fb366640eb3c89f2487d82e6cf6e58))
* **cameras:** curated SF camera catalog + source provenance column ([816b505](https://github.com/NewCoder3294/watchdog/commit/816b505e0a6be0a5dfa54cc3525148ec2190e9d5))
* **cameras:** Windy Webcams source + cron + provider_metadata column ([2811038](https://github.com/NewCoder3294/watchdog/commit/2811038f220bb1a5ae819b35e1eb9720895a04b3))
* **cockpit:** boxed widget grid with draggable layout + 7 new panels ([d83fd85](https://github.com/NewCoder3294/watchdog/commit/d83fd85e3d739739f0877970de9c9f8a3ba3fe5e))
* **cockpit:** drop Shift Posture stub for real Traffic Disruptions panel ([2b27521](https://github.com/NewCoder3294/watchdog/commit/2b2752199a33f19fc6e34adea161854d0e512c4c))
* **cockpit:** Phase 1 — sidebar with Live Feed + 3 awaiting-backend stubs ([cc31fe9](https://github.com/NewCoder3294/watchdog/commit/cc31fe93dedf77102fe67b6cbc64d4a3f889945f))
* **cockpit:** repoint aggregations to real live_incidents ([6926611](https://github.com/NewCoder3294/watchdog/commit/6926611f33f2257ef1cf182f7beb20d1d72b20bc))
* **cockpit:** wire SF Brief AI synthesis panel ([9dd6d36](https://github.com/NewCoder3294/watchdog/commit/9dd6d36c6b6e9632f3ecd0aff56f18d01438173c))
* **contribute:** /c/[token]/verify code-entry page ([a520975](https://github.com/NewCoder3294/watchdog/commit/a520975e6368e21645538ccc26f2218598b7d1b0))
* **contribute:** public /contribute registration page + form ([f97f67a](https://github.com/NewCoder3294/watchdog/commit/f97f67a64aa92e19f9289047936e8547c8bb4dd9))
* **correlate:** adjudicator seam + 4-factor score (T6-T7) ([b5c6833](https://github.com/NewCoder3294/watchdog/commit/b5c68335964ac861c418febd188a1dbd3299f2ac))
* **correlate:** config, types, geo, window normalization (T1-T3) ([a2a175c](https://github.com/NewCoder3294/watchdog/commit/a2a175ca7072c18a7d54398dfa5ed0ae18ea3be0))
* **correlate:** FTS-friendly priority phrasing + surface incidents as KG nodes ([26ea1e2](https://github.com/NewCoder3294/watchdog/commit/26ea1e2162c7cacdd354a1b8fff5d01c7570aa9d))
* **correlate:** incident page builder + GBrain writer (T8-T9) ([de889eb](https://github.com/NewCoder3294/watchdog/commit/de889eb847a7af0d343f6f9a2da2fa72c7d3fdae))
* **correlate:** neighborhood context + greedy clustering (T4-T5) ([793ce9f](https://github.com/NewCoder3294/watchdog/commit/793ce9f673037a6625ee5bd09f4d3e96a5a19e25))
* **correlate:** pipeline orchestrator + CLI worker + exports (T10-T11) ([f22c7b1](https://github.com/NewCoder3294/watchdog/commit/f22c7b17e9e22b3bd63e59bf656ecc2b1608ca3c))
* DataSF producer + GBrain neighborhood-baseline rollup + signal-collapse component ([2d87f06](https://github.com/NewCoder3294/watchdog/commit/2d87f0675fdb38e465d1dc8fb9bd347f6436bdc7))
* **db:** camera_policies + access_events + request_camera_access RPC ([9e79df7](https://github.com/NewCoder3294/watchdog/commit/9e79df749fe649b31deb5eb94c379b6a8c3a7c33))
* **db:** drizzle exports for cameraPolicies + cameraAccessEvents ([1d1d668](https://github.com/NewCoder3294/watchdog/commit/1d1d668dda7d961a14c13a2b206af36adca17bbc))
* **db:** drizzle schema for cameras, incidents, clips, tags, pins ([b63d794](https://github.com/NewCoder3294/watchdog/commit/b63d79453408000dc533750ff18f2beee9c28879))
* **db:** env_signals table for multi-kind environmental layer ([23a4f0b](https://github.com/NewCoder3294/watchdog/commit/23a4f0bf154ab025cdacdcfc8fd135f7889a7431))
* **db:** generate baseline migration and add RLS policies ([aa8aef1](https://github.com/NewCoder3294/watchdog/commit/aa8aef1f0191ceda7f6ab2bc4d5db2e455080ebe))
* **dispatch:** drop in 40 real SFPD scanner audio files + filename meta ([b97a431](https://github.com/NewCoder3294/watchdog/commit/b97a43193cdc731cda1b2982bd2faa145f942282))
* **env:** wire env_signals through page → cockpit → map (Batch B finish) ([7382d2f](https://github.com/NewCoder3294/watchdog/commit/7382d2fa22ca3ec9d0ff0ab737c1c416fa98dddc))
* every flagged incident must have a Claude description ([211061f](https://github.com/NewCoder3294/watchdog/commit/211061f38498d40284efa9e47794d852db758294))
* **feed:** inline iframe of the source article in the detail pane ([c951ac8](https://github.com/NewCoder3294/watchdog/commit/c951ac8aeec96dd8838b84c4e244ea07ecf9ca36))
* **gbrain:** prior-context on /incidents/[id] + decision -&gt; page writeback ([7238bab](https://github.com/NewCoder3294/watchdog/commit/7238bab7d316d6ff65df20b7c20589cf0fa6936d))
* **gbrain:** wire WatchDog to real GBrain in project Supabase ([72bb768](https://github.com/NewCoder3294/watchdog/commit/72bb76868730600fed58670fe2135f510bcfd076))
* **geocode:** nightly backfill for coord-less live_incidents ([0e5ec95](https://github.com/NewCoder3294/watchdog/commit/0e5ec95dfebf4f4efe88fc6def5139379e0079f7))
* harden WatchDog launch surface ([c94cd34](https://github.com/NewCoder3294/watchdog/commit/c94cd349905605f605396b12ceaafd427b5d8469))
* hidden dark mode toggle + default /openclaw to show all ([36c0d16](https://github.com/NewCoder3294/watchdog/commit/36c0d16045d4ddc680f387ddc35029fc848a33cd))
* **incidents:** surface dispatch audio entries in the incidents table ([d709a65](https://github.com/NewCoder3294/watchdog/commit/d709a654552b304314208096646dddb3e2ebefaf))
* ingestion layer — Caltrans camera detector + 911 trigger + signal_events ([318b570](https://github.com/NewCoder3294/watchdog/commit/318b5701988c7a1543d918f287386f8c5a6ee582))
* **ingestion:** DataSF SFPD incident reports producer (4th Layer-1 source) ([35ff670](https://github.com/NewCoder3294/watchdog/commit/35ff67075987ace0a060f364f30286fd8999e599))
* **ingestion:** db:stats signal_events verification script ([be14aec](https://github.com/NewCoder3294/watchdog/commit/be14aec3109c48244a5abcad90617e33d551e4c3))
* **ingestion:** Hari's multi-modal Layer-1 ingestion (TS) ([a2bd8e5](https://github.com/NewCoder3294/watchdog/commit/a2bd8e515837df091782e0f26572fa8bcf7d32db))
* **ingestion:** one-shot db:apply migration runner ([e516159](https://github.com/NewCoder3294/watchdog/commit/e5161590e5013cf49c6682b0ee0c18f76fb4c5e4))
* **interpretation:** correlator + incident ranker, rebuilt on reverted main ([152d78b](https://github.com/NewCoder3294/watchdog/commit/152d78bfa96cc32d4d62aa6e8c95fe6ea220a14b))
* **kg:** annotate every node with derived neighborhood ([f246bc2](https://github.com/NewCoder3294/watchdog/commit/f246bc24e152702aba4b66ccbafd6566016a8fdb))
* **kg:** Ask GBrain synthesizes grounded answers from the live graph ([99a4736](https://github.com/NewCoder3294/watchdog/commit/99a4736ab91a49555816139ce0db969a3be0be84))
* **kg:** bounded radial neighborhood detail component ([ba04ee0](https://github.com/NewCoder3294/watchdog/commit/ba04ee067d65e980f295ecff734d3847f909b4b5))
* **kg:** buildDetail spine + per-kind stubs ([1a210e5](https://github.com/NewCoder3294/watchdog/commit/1a210e517c671e6e67fe6efcb96e0f5c9ea2f800))
* **kg:** buildOverview neighborhood aggregation ([7116150](https://github.com/NewCoder3294/watchdog/commit/71161501fb38d268d5bbd1e312daa4f6a4d8a342))
* **kg:** cluster/stub/view types + KgNode.neighborhood ([8488647](https://github.com/NewCoder3294/watchdog/commit/848864761e85e33a3055bb9c1c6269ee099deaae))
* **kg:** debounce realtime refresh to avoid event thrash ([e120c72](https://github.com/NewCoder3294/watchdog/commit/e120c72fb264253e540d2f805e3b82de8d33ac2e))
* **kg:** geographic overview map component ([1363fc3](https://github.com/NewCoder3294/watchdog/commit/1363fc358917c5c578bd264bb182eebff4bfedf8))
* **kg:** Hold decision fans out to request_camera_access per linked camera ([d77b7b9](https://github.com/NewCoder3294/watchdog/commit/d77b7b99f8162adc7f55dd24f5e4739318e44d59))
* **kg:** hook GBrain to Supabase with auto-fire alerts + writeback ([4356086](https://github.com/NewCoder3294/watchdog/commit/4356086e91176651d6e705c5ea003b123c48e489))
* **kg:** hotspot geometry primitives (nearest, match, project) ([4f81e51](https://github.com/NewCoder3294/watchdog/commit/4f81e512ea14e245904cd0917842f6af05fde706))
* **kg:** pure resolveNeighborhood with context maps ([5c83851](https://github.com/NewCoder3294/watchdog/commit/5c8385144bf3a2a4485096d33bf04cf79c99a08d))
* **kg:** slim orchestrator, delete 450-iteration force sim ([bd66d33](https://github.com/NewCoder3294/watchdog/commit/bd66d3331f5a48fc278c25a81e8bb697f134ade4))
* **kg:** stub click-to-expand in detail; delete orphaned kg-toolbar; label/severity polish ([8e04e43](https://github.com/NewCoder3294/watchdog/commit/8e04e43a2ff9f1f03ca7c4984d96ced790e71524))
* **landing:** 3-stream model, BJS hook stat, real-data framing, interactive Decision section ([ca49d10](https://github.com/NewCoder3294/watchdog/commit/ca49d1092c1056fd44cfeed3682b9d63d0bbedb3))
* **landing:** fix mirror-step diagram width + live countdown + 62% reveal ([52ac786](https://github.com/NewCoder3294/watchdog/commit/52ac78697b6576d3f03d1ad4fb338dc754386e17))
* **landing:** scroll-triggered reveals + bigger Memory diagram + tighter hook copy ([159b12b](https://github.com/NewCoder3294/watchdog/commit/159b12b74b4af3bc5ddd5f29c2fb69fc6238b9a2))
* **map:** add SF crime news layer (news_incidents table + seed + map UI) ([95f7e3f](https://github.com/NewCoder3294/watchdog/commit/95f7e3febbeeba626384639791a85c5f3f832802))
* **map:** batch C scaffolds — state encoder, time scrubber, layer toggles, detail sheet, permalink, clustering helper, polygon draw ([fecfc66](https://github.com/NewCoder3294/watchdog/commit/fecfc6636774b9e8523e489772b72e1b1931a687))
* **map:** batch C scaffolds — state encoder, time scrubber, layer toggles, detail sheet, permalink, clustering helper, polygon draw ([2049c90](https://github.com/NewCoder3294/watchdog/commit/2049c90c35bed7df1b5c83b414d669a2c023b9cb))
* **map:** export current filtered view as CSV / GeoJSON ([1368706](https://github.com/NewCoder3294/watchdog/commit/1368706f792ed2b8dcd5a36e8f249897e75e2fdd))
* **map:** GBrain natural-language ask bar + URL-encoded MapFilter ([b633117](https://github.com/NewCoder3294/watchdog/commit/b63311744da3b951fffcf1b6b3fcbf5121936061))
* **map:** live event feed (bottom-right) with KG-style predictions ([7358be0](https://github.com/NewCoder3294/watchdog/commit/7358be0e28373db89f11ec6078c63476635e6807))
* **map:** live event feed sourced from real SF incidents (PR [#6](https://github.com/NewCoder3294/watchdog/issues/6) pipeline) ([06c0c71](https://github.com/NewCoder3294/watchdog/commit/06c0c71e6b59c5c2f6e9287bf5f9bc4b6d2dbd6b))
* **map:** real SF dispatch call pins with TTS audio panel + WatchDog logo ([8f35f63](https://github.com/NewCoder3294/watchdog/commit/8f35f63c53d67404710e97126524ad0dbac4d062))
* **map:** saved views + map_annotations schema ([c501a9b](https://github.com/NewCoder3294/watchdog/commit/c501a9b12ffc372c6e39c30729ec364af29608a3))
* **map:** signal-collapse animation (Option B, real-data-gated) + BLOCKER spec ([046bd4c](https://github.com/NewCoder3294/watchdog/commit/046bd4c3b4bd8b4b7db3fa70a471d8e8b83a2e76))
* **map:** Top Priority overlay panel + incident centroid coords ([2d53e91](https://github.com/NewCoder3294/watchdog/commit/2d53e912379d2ae213d4dfc8e9cf84f18b8a470e))
* **nav:** collapse 9 operator tabs to 4 + cluster sub-nav ([239fe5d](https://github.com/NewCoder3294/watchdog/commit/239fe5da73dac1548d8d97314d53a686a4208d14))
* open contribution — public camera-owner onboarding + verification + dashboard (rebased) ([#12](https://github.com/NewCoder3294/watchdog/issues/12)) ([6913507](https://github.com/NewCoder3294/watchdog/commit/691350770e195defebfa43cc7eb5901c9284dfee))
* **openclaw-worker:** LLM enrichment funnel + better UI ([5b7a2ec](https://github.com/NewCoder3294/watchdog/commit/5b7a2ece788b74ce67980891df60d823b88fd9a0))
* **openclaw-worker:** the OpenClaw side of the OpenClaw &lt;-&gt; WatchDog contract ([db5716e](https://github.com/NewCoder3294/watchdog/commit/db5716e8c1bf5d797049086ef79827a8b5a1ce99))
* **openclaw:** redesign feed UI ([f7720e0](https://github.com/NewCoder3294/watchdog/commit/f7720e0f5b7940f3425aae2f184b7a7586b6fd36))
* probe camera liveness in sync cron + richer incident detail UX ([c9ef87e](https://github.com/NewCoder3294/watchdog/commit/c9ef87ef0452861ed13084954b6fb5448b00b0af))
* real SFPD scanner audio with simulated streaming + native playback ([cbe18a3](https://github.com/NewCoder3294/watchdog/commit/cbe18a39216cc4d68520bd9facfa39b15e88484e))
* redesign /enrichment + add semantic color accents across app ([37eae7b](https://github.com/NewCoder3294/watchdog/commit/37eae7b9b0f21639e1cf6f54e3deac88cbf54c5d))
* **release:** open the OSINT dashboard to SF residents ([fe99452](https://github.com/NewCoder3294/watchdog/commit/fe9945201231f9c4ff9eb68d16b7c45850b37888))
* **retention:** archive live_incidents older than 90 days ([b883161](https://github.com/NewCoder3294/watchdog/commit/b883161ae9a2249652c36491fb442d4006f6794c))
* **seed:** demo seed for Mission & 16th + five public wall-fill cams ([cbcdb58](https://github.com/NewCoder3294/watchdog/commit/cbcdb580ebf66df52ca554ae185d6972bb333227))
* **sync:** add PG&E residential outages source ([2198316](https://github.com/NewCoder3294/watchdog/commit/2198316d837d50f6a4473284b220cca3aec0f5da))
* **sync:** add SFFD real-time active incidents source ([be5c12b](https://github.com/NewCoder3294/watchdog/commit/be5c12bae20012f0d17830f0fb0dc2a01608b964))
* **sync:** ADS-B aircraft, AIS marine, BART/MTA transit sources ([55ac5a9](https://github.com/NewCoder3294/watchdog/commit/55ac5a9c30555a6166da4143683eea07c7c718d2))
* **sync:** ingest police scanner call metadata from OpenMHz ([9064fec](https://github.com/NewCoder3294/watchdog/commit/9064feccc17635a62f4143295d175993dea94389))
* **sync:** ingest SF crime news from public RSS feeds ([888eae5](https://github.com/NewCoder3294/watchdog/commit/888eae555e6cf0caec5e852e18ab889af4bcdeb4))
* **sync:** NWS alerts, PurpleAir AQI, USGS quakes sources ([df198d9](https://github.com/NewCoder3294/watchdog/commit/df198d9abf0886e9e7d1dbd90eeded2ff1318351))
* **sync:** parse CalTrans D4 CCTV GeoJSON into Camera rows ([3c1240f](https://github.com/NewCoder3294/watchdog/commit/3c1240f9f8890e9217fd6cda0074974b80177998))
* **sync:** upsert cameras into Postgres with conflict resolution ([5a4c7dd](https://github.com/NewCoder3294/watchdog/commit/5a4c7dd45966ec5c39d4b6a9bde1efe5d274f1be))
* target ~3 flagged/5min + plain-English titles via stricter prompt ([a1c3c33](https://github.com/NewCoder3294/watchdog/commit/a1c3c330726718909056d22a17683cb6f36d9aa9))
* **triage:** ranked incidents API + cron + triage queue UI (T12-T14) ([5e9cf97](https://github.com/NewCoder3294/watchdog/commit/5e9cf97ca6db7fa68ea517bed56487ea62817af8))
* **ui:** DecisionPanel + CameraAccessRow on /incidents/[id] ([053ee2a](https://github.com/NewCoder3294/watchdog/commit/053ee2a8b1f191f0c3f86fcb1e1980f7cc6c131b))
* **ui:** live camera thumbnails in openclaw rows + live HLS on incident detail ([14930ca](https://github.com/NewCoder3294/watchdog/commit/14930ca2e138206f11ebd666b852a784dde341c8))
* **verify:** cross-source verification badge for live_incidents ([fc7451e](https://github.com/NewCoder3294/watchdog/commit/fc7451eddef7916ca3bc8cdb0af88fcde1377d2c))
* **waitlist:** email-first contributor waitlist on landing ([9da1928](https://github.com/NewCoder3294/watchdog/commit/9da1928e0f17dc14fb84c2aae8af59cda52bc840))
* wall offline filter, supercharged map, KG expansion ([f7c7f65](https://github.com/NewCoder3294/watchdog/commit/f7c7f656cd74440f0807c896856eb116525c7e8c))
* **wall:** default to online-only, batches of 20, auto-fill window ([0010078](https://github.com/NewCoder3294/watchdog/commit/0010078020c16651fee99198eafed0a03bc18413))
* **wall:** drop blank/grey HLS tiles and stop the grid shifting ([44f2e4f](https://github.com/NewCoder3294/watchdog/commit/44f2e4fca032061cfaece1b9a15e369758b047c9))
* **wall:** Group filter pills (Freeway / Streets / Live cams / Private) ([adb51dd](https://github.com/NewCoder3294/watchdog/commit/adb51dd7aa276c36aeb04e6d7296ec7eab23af04))
* **wall:** iframe-embed camera support for Windy + future aggregator sources ([abed6ed](https://github.com/NewCoder3294/watchdog/commit/abed6edbdcea2be7f60a1594e864720fcbe45277))
* WatchDog wordmark, dispatch priority filter, dispatch in KG ([8d53b96](https://github.com/NewCoder3294/watchdog/commit/8d53b96bc54335518a643db8c4f7cd8e09699e05))
* **web:** add Redis L2 cache for HLS manifests + segments ([dd59a40](https://github.com/NewCoder3294/watchdog/commit/dd59a40ce65e6af331b467c15aea8f5a9a0b04b6))
* **web:** auth-gated app shell with top nav + placeholder routes ([ad9c467](https://github.com/NewCoder3294/watchdog/commit/ad9c4675b4ff04861dda80c96ca084895a6b73e7))
* **web:** cron route for nightly CalTrans D4 sync + vercel.json ([d86b300](https://github.com/NewCoder3294/watchdog/commit/d86b300b97c2f90463abb23a6472e0ac6e552256))
* **web:** integrate cameras, incidents, map, and KG surfaces ([0d0e9d4](https://github.com/NewCoder3294/watchdog/commit/0d0e9d4985638f2b9fa337d7022049d6a9ca534e))
* **web:** interactive WatchDog landing at / ([5c77cab](https://github.com/NewCoder3294/watchdog/commit/5c77caba9521dfc6f9da21d67ecb104d71d07f83))
* **web:** live SF incident feed (/live) + DataSF/511 sync + demo-time drip ([87f296f](https://github.com/NewCoder3294/watchdog/commit/87f296f6dd116fb4b533c177f2d5302ec1b6a172))
* **web:** live SF incident feed (/live) + DataSF/511 sync + demo-time drip ([0056422](https://github.com/NewCoder3294/watchdog/commit/0056422ecf62f61c767b376b851eed6715737a19))
* **web:** live wall with HLS/MJPEG players, drop map route ([ec5ccbf](https://github.com/NewCoder3294/watchdog/commit/ec5ccbfa5fe4f934730b78d6975150fcef8d1428))
* **web:** next.js 15 + tailwind v4 + geist fonts scaffold ([f7ad4d2](https://github.com/NewCoder3294/watchdog/commit/f7ad4d2069662f43982e67c49f038159f27a0b8d))
* **web:** redesign landing with YC badge, dedicated diagram sections ([dc72d36](https://github.com/NewCoder3294/watchdog/commit/dc72d360b585b0095528ceae9df0f81de84bd94e))
* **web:** shadcn/ui baseline (button, input) with monochrome variants ([ceea208](https://github.com/NewCoder3294/watchdog/commit/ceea2086f8268e638599fd430a8a063f93125851))
* **web:** supabase auth middleware and login page ([70ac511](https://github.com/NewCoder3294/watchdog/commit/70ac51155a2947a6ba6351a25ea0f3f644d5ef32))
* **web:** supabase clients (server + browser) with env validation ([60fe228](https://github.com/NewCoder3294/watchdog/commit/60fe2288c8915ca3e806f3ec7368b67609220bd4))
* **web:** sync-env cron route, env loader, env panel ([94e0df3](https://github.com/NewCoder3294/watchdog/commit/94e0df3e0f966c3a34d3c8de9cf9006d06494158))
* **web:** vercel cron tick for openclaw-worker ([e49afcf](https://github.com/NewCoder3294/watchdog/commit/e49afcf6d5e381309eacbfdfcf5dd5d79ea89895))
* **web:** wall latency caching + nav conflict fix + enrichment ([3bc47b1](https://github.com/NewCoder3294/watchdog/commit/3bc47b1acbc0b5476f611af11f91fdc79e1f80de))


### Bug Fixes

* **adsb:** switch OpenSky auth from basic to OAuth2 client credentials ([6ed7edc](https://github.com/NewCoder3294/watchdog/commit/6ed7edc6b9a49be72848440b4a167189d29f6908))
* **api:** live incidents endpoint reads via service client (bypass RLS) ([5c08982](https://github.com/NewCoder3294/watchdog/commit/5c0898228fa3f7a730dd7b1580778fb65ab3b781))
* **api:** require authenticated user for /api/dispatch/manifest + /api/live/incidents/recent ([5715ebf](https://github.com/NewCoder3294/watchdog/commit/5715ebf7c2f3a9a789c89c4c132a27903125dd42))
* **audit:** unblock end-to-end demo arc ([75bc90a](https://github.com/NewCoder3294/watchdog/commit/75bc90a95c1a982af11c133825502cd473eb55ca))
* **build:** drop .js extensions in source-mode TS packages ([7ccec55](https://github.com/NewCoder3294/watchdog/commit/7ccec5517407493c46dcf70b646e3ec2eaa89247))
* **correlate:** bound LLM calls (per-call timeout + top-N narration) ([1415486](https://github.com/NewCoder3294/watchdog/commit/1415486d2412de49d4076d5b146dbb30b0cba3c3))
* **gbrain:** writeReviewedIncidentPage runs under service role + seed schema match ([c08fbbc](https://github.com/NewCoder3294/watchdog/commit/c08fbbc6f0cf2b2e20c1d968f96338787431ae97))
* **ingestion:** correct load-env import path in apply-migration ([d3d3c22](https://github.com/NewCoder3294/watchdog/commit/d3d3c227fdfc61ced74c775c18d6b58faa8acfa7))
* **ingestion:** robust env loading via dotenv + non-secret diagnostic ([a00a18c](https://github.com/NewCoder3294/watchdog/commit/a00a18c021472533df7903462a522304df60fb02))
* **ingestion:** when CAMERA_PIN_IDS is set, watch all of them ([e6fdf3c](https://github.com/NewCoder3294/watchdog/commit/e6fdf3c88e20c452013d29f3ae04e38541c7e414))
* **kg:** hide trace affordance without a handler; breadcrumb aria-current ([a1be0a3](https://github.com/NewCoder3294/watchdog/commit/a1be0a304f1d8b68162c44bae2205ed12e5a62f2))
* **kg:** pass-2 scans all linked edges; rename shadowed var ([19e66da](https://github.com/NewCoder3294/watchdog/commit/19e66da4ecca269978cb3e1cf9da38531b6918a5))
* **kg:** repair merge regressions — restore neighborhood annotation, clean kg-graph conflict markers, rewire GbrainQueryPanel API ([e2c3016](https://github.com/NewCoder3294/watchdog/commit/e2c301601c1732e67722f46c733c4ce1d6cb27ef))
* **kg:** robust incident date sort, clearer spine-kinds, +2 tests ([0562646](https://github.com/NewCoder3294/watchdog/commit/0562646d130dd5edd3173e7bc79a506dcaccc22c))
* **landing:** bigger kicker, kill the long blurb, open zone borders, trim copy ([a0c6cb1](https://github.com/NewCoder3294/watchdog/commit/a0c6cb1746ccb20ccf176b197348c854eeab8333))
* **landing:** chip text fits; Decision cards now loop the countdown ([a15133b](https://github.com/NewCoder3294/watchdog/commit/a15133b7995472f2d0a6afe78bd36dab5810fc41))
* **landing:** inline arrow-label badges on Memory diagram (write + recall) ([405c5d6](https://github.com/NewCoder3294/watchdog/commit/405c5d6ee4751d793d27216ba0cb5e7e00f11a1d))
* **landing:** keep CORRELATE subtext inside the fusion box ([6de9045](https://github.com/NewCoder3294/watchdog/commit/6de904514b03de4da9fcf261065578370c16f150))
* **landing:** MemoryDiagram recall label + false-positive line clearance ([2f42951](https://github.com/NewCoder3294/watchdog/commit/2f42951477a2da61d6c13fea67530a67c2ee20b5))
* **landing:** truthful copy + breathing room on Memory arrows ([bd96ddf](https://github.com/NewCoder3294/watchdog/commit/bd96ddfbab55be8348c0c591e83d7f5b2c6ba2fd))
* **map:** dispatch pins no longer drift behind map during pan/zoom ([7e3a5b8](https://github.com/NewCoder3294/watchdog/commit/7e3a5b8249fa5251ebe9a9bf4f5a94d9f48315cc))
* **merge:** post-merge cleanup for the policy/cockpit branch reconciliation ([c0cab6d](https://github.com/NewCoder3294/watchdog/commit/c0cab6d5d060d4a531b075fb6313d85b0cd03707))
* **openclaw-worker:** stable location-based fusionKey, kill KG dupe-spam ([02ff2c2](https://github.com/NewCoder3294/watchdog/commit/02ff2c231c4ee21a45def7c66d8687f9369af05d))
* **panel:** hide literal 'unknown' affinity/neighborhood in Top Priority ([9027a57](https://github.com/NewCoder3294/watchdog/commit/9027a573c4d341359466e2e876eb82e1c0306d77))
* **ranked:** accept title-only correlator rows (tags embed is RLS-gated) ([94a9a12](https://github.com/NewCoder3294/watchdog/commit/94a9a1253491849e79f32815054f50089ccaaf46))
* **ranked:** drop "P4 unknown · 0 src" junk rows from Top Priority ([351bbed](https://github.com/NewCoder3294/watchdog/commit/351bbed0deee4132f2d36208acf4a3a067f85dcd))
* strip broken camera wall ([ae9da8a](https://github.com/NewCoder3294/watchdog/commit/ae9da8aa5eebae18af22a603a733afd071959d2e))
* **sync:** tolerate new CalTrans D4 schema (route, direction, boolean inService) ([2304eb0](https://github.com/NewCoder3294/watchdog/commit/2304eb0f5bac631fd6fc64247088a6441471f6ed))
* **triage:** derive incident fields from title (root-cause of P4 unknown 0 src) ([ecd62f0](https://github.com/NewCoder3294/watchdog/commit/ecd62f074c03de0e4178b8b724c13f37bb2d5105))
* **triage:** derive incident fields from title, not the tags embed ([a4df528](https://github.com/NewCoder3294/watchdog/commit/a4df52800add03e87ef4f5f95c2ee8b790cc48c8))
* **vercel:** drop enrichment cron to daily for Hobby tier ([76e2195](https://github.com/NewCoder3294/watchdog/commit/76e2195cbfecef696ed84efda71d0cbd00f952e3))
* **wall:** make Streets tiles actually render ([4b9d9a0](https://github.com/NewCoder3294/watchdog/commit/4b9d9a05d259e9101ee1acf8d126dc323cd4e037))
* **wall:** remove Mux test-stream placeholders ([490ad15](https://github.com/NewCoder3294/watchdog/commit/490ad15ea363aa663239a1ff3532331275205f2c))
* **wall:** stop the reshuffle and surface all cameras ([9672f31](https://github.com/NewCoder3294/watchdog/commit/9672f31817a1acf17a93d76c0b30fa0249368960))
* **web:** align TopNav and NavLink with no-auth Wall route rename ([889e71e](https://github.com/NewCoder3294/watchdog/commit/889e71ea71fbb63c6bff59b46d0496e85b206c7c))
* **web:** bump Next to 15.5.x and coerce empty env strings to undefined ([181ece3](https://github.com/NewCoder3294/watchdog/commit/181ece31d57ba57a399d0eb2722db63dea96e834))
* **web:** exclude static assets from auth middleware ([9a5e5ec](https://github.com/NewCoder3294/watchdog/commit/9a5e5ecdee8fcda1cbf35783909f6cafe37fd030))
* **web:** move wall to /wall so / is free for landing ([563f1ac](https://github.com/NewCoder3294/watchdog/commit/563f1ac7c41bfa626cb9c7747fe05507c907597d))


### Performance Improvements

* **correlate:** deterministic ambiguous resolve + parallel narration + batched writes ([31071e5](https://github.com/NewCoder3294/watchdog/commit/31071e52c67271828e864fa17f585eb6c9277ea7))
* **web:** wall load — manifest cache, lazy hls.js, smaller page size ([f3d10a7](https://github.com/NewCoder3294/watchdog/commit/f3d10a79c795e7fa06a1f1343f3d076fb9900090))


### Reverts

* drop /contribute and /c routes from main ([2dcde28](https://github.com/NewCoder3294/watchdog/commit/2dcde28c828dcd5d7d1a92740aa2c41787843438))

## [Unreleased]

### Added
- MIT license, contributor guide, code of conduct, and security policy.
- GitHub issue templates (bug report, feature request) and a pull request template.
- `.editorconfig` for consistent formatting across editors.
- `CHANGELOG.md`.
- **CI/CD pipeline:**
  - Shared composite action `.github/actions/setup` (pnpm + Node + Turbo cache + install).
  - `CodeQL` weekly + per-PR static analysis (`security-and-quality` query suite).
  - `Dependency review` blocks PRs that introduce high-severity vulnerabilities or
    strong-copyleft licenses (AGPL-3.0, GPL-3.0).
  - `PR validation` enforces conventional-commit-shaped PR titles.
  - `Release Please` opens automated release PRs from conventional commits on `main`.
  - `Dependabot` weekly bumps for npm and GitHub Actions, grouped by minor/patch,
    majors surfaced individually.
  - `CODEOWNERS` defaulting to @NewCoder3294.

### Changed
- `CI` workflow refactored into parallel jobs (lint, typecheck, test, build) with
  a summary gate, PR-only `cancel-in-progress` concurrency, and Turborepo cache
  reuse across runs.
