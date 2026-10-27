# UAV cinematic preview implementation plan

> Inline integration, bounded independent geometry/export workers, then a fresh release review.

**Goal:** Show where simulated UAVs look during playback and ship a polished vertical demonstration with a video file.
**Architecture:** Pure preview geometry feeds MapLibre and an isolated 9:16 canvas compositor. A bounded MediaRecorder export captures only that canvas.
**Tech stack:** Existing React/MapLibre, Canvas2D, MediaRecorder; FFmpeg only for checking/converting the delivered clip.
**Spec:** ../specs/2026-10-26-uav-cinematic-design.md

## Constraints / review focus
- Simulated aircraft and footprint stay distinct from NASA observations and real UAV telemetry.
- Only fixed/public coordinates enter showcase, share links and exported footage.
- A map inset is labelled illustration, never live video/thermal.
- No orphan recording streams, timers or unbounded fleet history. Runtime codec checks and recoverable export errors.
- Recording controls and simulation labels fit phones and remain inside exported frame.

## Tasks
- [x] Geometry tests first, then previewFleet/coverageFeatures/previewChapter.
- [x] Canvas compositor and bounded recording helper; codec/validation tests.
- [x] Inline preview toggle, map footprints/targets, public cinematic mode and responsive controls.
- [x] Browser QA, real20s export, fresh code review, source mirror and checks.
- [x] Publish public Sites/Pages, verify actual user tab, supply a checked portrait MP4 artifact.

## Release evidence
- Sites version10: public production succeeded, source49dc10c.
- GitHub Pages: code7edc6f9, Actions run40353261156 succeeded.
- 63 Sites tests and65 static tests passed; both production builds passed.
- Actual production canvas export: H264 MP4,1080×1920,19.980s; four captions and simulation labels inspected.
- Phone390×844 layout, playback pause, recording cancellation and Drone panel preview shutdown checked.
- Fresh release review cleared both findings; no real telemetry or credentials enter showcase/export.
