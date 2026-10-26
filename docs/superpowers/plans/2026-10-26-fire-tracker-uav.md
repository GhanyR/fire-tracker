# Fire Tracker UAV Implementation Plan

> Execute inline with one independent bridge/SDK worker and a fresh whole-change review before publication.

**Goal:** Public Fire Tracker branding plus usable UAV telemetry map and open SDK.
**Architecture:** Existing React/MapLibre app, browser session WebSocket feed, operator-hosted aiohttp/MAVLink bridge, dependency-light JS SDK. Sites and Pages share components. No flight commands or hosted location storage.
**Spec:** ../specs/2026-10-26-fire-tracker-uav-design.md

## Tasks
- [ ] Test telemetry normalization, timestamp/order/staleness, caps, demo and URL boundaries before implementing lib/drone-data.mjs and useDroneFeed hook.
- [ ] Add concise DronePanel and map markers/trails, demo, follow selection, accessible statuses, motion preference, flame logo and usable share action on mobile. Preserve source fidelity and current terrain UI.
- [ ] Bounded worker owns sdk/**, bridge/**, docs/UAV.md and telemetry schema, with tests for protocol/auth/optional values and adapters. Parent reviews integration and publishes.
- [ ] Mirror frontend into tracker, add meaningful CI checks, README integration entry, verify real WebSocket traffic from local bridge into both frontend variants.
- [ ] Change hosted slug after app is ready, package exact Sites source, publish public, push GitHub, wait for successful Pages deployment, verify both URLs, sharing and demo in the user's tab.

## Review focus
- Stale/future/out-of-order packets cannot look live or move vehicle backwards.
- Demo never mixes into NASA counts, exports or live status.
- Tokens/bridge endpoint/precise live tracks never enter share URLs or persistent storage.
- HTTPS pages cannot silently claim success with mixed-content WS; authentication and reconnect outcomes are visible.
- Unknown optional altitude/speed/battery stay unknown; relative-home altitude is never labelled terrain AGL.

Prior user authorization permits direct ordinary implementation and production deployment. Parent handles hosting credentials, all commits/pushes and native tool calls.
