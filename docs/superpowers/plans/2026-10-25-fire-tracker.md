# Fire Tracker Implementation Plan

Goal: a clear public 3D fire-data explorer using the liked terrain design and one open frontend source.
Architecture: React/MapLibre frontend shared between Sites/Vinext and Vite/GitHub Pages, with public snapshots from the existing Python pipeline and optional Sites API fallbacks.
Spec: ../specs/2026-10-25-fire-tracker-design.md

## Constraints
- Preserve Sites project identity and public audience, existing repo and feed URLs, current terrain and hotspot layers.
- Actual acquisition times drive rolling windows. Preserve source/confidence, never generate pretend detections.
- Main map has no title/subtitle/preset overlays; detailed data live in the sidebar.
- User authorized direct completion/publication; execute without additional design/deployment confirmation.

## Review Focus
- Search while a narrow province/scene is selected must still discover a different Indonesian region.
- Shared links and selecting results must restore camera, filters and correct point.
- Outage/stale/future observations must not be silently labelled current.
- Static GitHub Pages paths must work below the repository prefix and legacy links/feeds must survive.
- Public source/build artifacts must exclude hosting identity, tokens and subscriber/private state.

## Tasks
1. Raw observation snapshot: add pipeline adapter and fixed-time regression tests; run pipeline smoke. Export exact columns id/lon/lat/time/frp/confidence/sensor/province/municipality. Agent may work only in adapter, tests, and build insertion. Parent reviews and owns commits/publication.
2. Frontend discovery and visual simplification: test search/group/geographic focus and time boundaries first, implement helpers, latest panel, simple brand, compact timeline, reliable refresh and field summary. Preserve terrain and circle rendering. Run full Node tests and production build, inspect real-data desktop/mobile preview.
3. Open distribution: mirror only app-specific React/lib/styles/public attribution into tracker/, Vite static entry uses base-aware URLs and static-mode fallback, preserve legacy entry and data feeds, update workflow to test/build frontend and raw snapshot, README/metadata naming. Build both targets, independent review, fix important findings, push and wait for Pages success; package pushed Sites source using helper and deploy; verify both public URLs and actual data timestamps.

## Progress
- Existing sources confirmed: Sites public v2, public MIT GitHub repo, scheduled pipeline successful on 25 October; no additional PR or source branch found.
- Current Sites checkout opened through source helper at fb9bc7065bf18515b00a4eb4ff345e8deb421aba; no user changes present.
- Native execution chosen to preserve current checkout and avoid parallel frontend edits; bounded pipeline adapter delegated independently.

## Verification before release

- 25 frontend contract tests and 10 Python feed/parser tests pass; Vite production build and combined Pages service-worker syntax check pass.
- Independent review found exact municipality scoping and lost share filters; both corrected before publication. Search text resets scene/province, exact municipality selection uses indices, shared filters include query, municipality, confidence, sensor filter and absolute timeline cutoff.
- Live public raw feed verified: 181,591 observations, all four sensors available, retrieval 2026-10-25T02:14Z, latest acquisition 2026-10-24T19:45Z.

- Desktop, 390px mobile detail, 3D rotation controls, exact county selection, query across scopes, and GeoJSON export exercised in the browser. Export contained 10,404 correctly located UTC observations at verification.
- Static installation beneath repository prefix and service-worker reload tested; disconnecting the browser retained the same 10,404 observations. Offline terrain availability is limited to previously loaded tiles.
- Pages workflow f82686e succeeded; both public sites show Fire Tracker. Source snapshot regenerated 2026-10-25T02:26Z with original latest acquisition unchanged.
- Final compatibility fix restores hashes during same-document navigation, resets stale panel/playback state, and forwards old field-tool hashes to /legacy/ without changing fixed data-feed URLs.
