# Understand the last 24 hours

The user likes the terrain and current branding but cannot distinguish when detections happened. Preserve this visual direction and turn the map into an understandable observation timeline, with useful reports.

Chosen approach: temporal colors and an explicit, narrated playback on the existing React/MapLibre app. A clock slider alone stays hard to read; a cinematic camera without timestamps suggests false real-time certainty. Combine age colors, a persistent Play control, a frozen playback clock, short evidence-based narration, and an exportable situation report. This is an implementation decision under the user's existing instruction to execute and publish directly.

- Age means elapsed time since satellite acquisition, relative to the displayed clock. Fresh <=3h, recent >3h to12h, older >12h. Label the legend and show exact acquisition times on hover/detail.
- 24-hour playback defaults to 24 steps, pause/resume/speed/scrub and Now. Starting playback freezes its clock; receiving a new snapshot or a minute tick must not shift the historical window. Shared history carries anchor and cutoff.
- All displayed counts, histogram, narration and exported report use the same geographic/search/confidence/sensor scope and historical cutoff. No future timestamps, FRP summation, unique-fire counts or active/extinguished inference.
- Gentle visual pulses indicate observations in the hour before the displayed clock. Respect reduced motion. Camera following is optional and stops on user manipulation; never silently follow real UAV data.
- Situation report: selected scope/time, freshest acquisition, age breakdown, most recent observation regions, confidence/FRP context, source retrieval time, dated field notes, and concrete verification next steps. Copy/download/print work. A stale or empty feed explains the gap.
- Existing 3D map, flame, UAV flow, field reports, privacy-safe sharing and fixed public GIS feeds continue working. Phone layout keeps map space; avoid oversized overlay prose.
- Keep public Sites identity and MIT GitHub repo; publish both and verify the user's tab.
