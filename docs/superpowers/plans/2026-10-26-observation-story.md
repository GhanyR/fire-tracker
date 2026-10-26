# Observation Story Implementation Plan

> Implement inline with a bounded pure-data worker and one fresh whole-change reviewer. Existing direct implementation/publication authorization applies.

**Goal:** Make satellite observation age, 24-hour history and a useful situation report understandable at first glance.
**Architecture:** Pure temporal summaries feed MapLibre styling, replay controls, region discovery and one report component in both existing app variants.
**Tech Stack:** React 19, MapLibre 5, Vite/Vinext, Node test runner.
**Spec:** ../specs/2026-10-26-observation-story-design.md

## Constraints and review focus
- Acquisition time is not fire ignition/extinguishment. Never infer these from detections.
- Freeze replay anchor. Geographic/search/sensor filters must agree across map, timeline, narrative and report.
- Shared time range must survive later reopening, and live UAV credentials/coordinates must remain excluded.
- Empty/stale feeds, exact boundaries, future timestamps and null/zero FRP must stay truthful.
- Accessible keyboard controls, reduced motion, usable phone layout and print output.

## Tasks
- [x] Pure model: temporalRange, ageBand, summarizeSituation and buildSituationBrief; boundary/scope/staleness/UTC/null tests first, then green suite.
- [x] Map age colors, cluster newest-time aggregation, honest hover timestamps and bounded pulse animation.
- [x] Visible replay bar with frozen clock, play/pause/speed/scrub/Now, optional camera follow and per-frame narration; same-scope histogram.
- [x] Freshness-first discovery plus situation report with copy/download/print and dated field evidence.
- [x] Mirror, full relevant tests, fresh code review, browser desktop/mobile/real-data QA; build and publish Sites and Pages; verify existing user tab and final artifact.

Review fixes: narration now uses the interval ending at the cursor and ranks its leader by count. User-originated pan/rotate/pitch stops camera follow. Selecting a point or UAV panel pauses story playback.

Verified locally: 50 hosted-app tests, 52 static-app tests, both builds; real snapshot, responsive replay/report, keyboard slider endpoint, narration with real detections, keyboard camera release, and downloaded text brief retaining frozen URL/source clocks.

Published: public Sites v8 succeeded (26 October 2026); GitHub Pages head0d3a31f build/deploy succeeded. Production playback shows a populated hourly narration and reports current dated SiPongi/BPBD notes. Frozen Merauke URL restored1,258 detections, matching independent model calculation. Report download verified with public frozen link, source timestamps and age buckets.
