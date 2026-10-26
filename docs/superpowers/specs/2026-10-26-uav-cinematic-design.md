# UAV previews and a shareable aerial demo

The user wants the observation animation to include drone previews showing which area each aircraft is looking at, with a polished cinematic control-room feel and something usable on TikTok. Existing direct implementation/publication authorization applies; preserve the terrain, flame branding, real source clocks and current UAV connector.

Implement an optional synthetic fleet during observation playback, plus a separate public 9:16 demonstration scene over Bromo. The separate scene never receives real UAV positions, connection addresses, tokens or user location. It uses only fixed public geography, simulated aircraft and public satellite observations. This is a visual preview, not a historical flight or a live drone camera.

The synthetic fleet has two vehicles with bounded moving paths, selected labels, trails, a ground-projected illustrative viewing sector and target. Only preview vehicles have inferred viewing sectors: do not invent camera orientation for real telemetry. Inline preview follows the playback clock and stays frozen when paused. Selecting real UAV workflow stops preview; simulation never joins satellite counts or exports.

The vertical scene is an original cyan/green aerial console, not copied Marvel assets. Show persistent SIMULASI UAV, geographic scene, a 20-second captioned sequence, the inspected sector, and an inset clearly marked illustrative map imagery. Preserve Esri/Mapzen attribution and original satellite time; never claim a camera/thermal feed, verified fire status or measured surveillance coverage.

Record only a composed 1080x1920 application canvas, never a desktop/screen stream. Use runtime-supported MP4 where available, otherwise explicitly WebM; keep a local MP4 artifact for the user. Recording is explicit, bounded to20s, cancellable, cleans up tracks/timers, and does not publish to TikTok. Honor reduced motion in automatic preview; explicit recording is a user-requested animation. Public scene links contain only a showcase flag.
