# Fire Tracker UAV and brand

User requests a Fire Tracker address, better fire logo, intuitive animation, shareable public app, visible UAV positions and an open integration SDK for common drones. Continue the approved terrain design and direct publication; no paid domain purchase or flight control is implied.

Chosen approach: retain the existing Sites identity and change its hosted slug to fire-tracker. Use a compact authored flame/locator SVG wordmark. Add a Drone panel to the shared React frontend. Default is disconnected with an explicit animated demo option (two labelled demonstration UAVs, never satellite observations). A real connection reads an operator-supplied WebSocket bridge; data are session-only and never encoded in shared links. Public pages require WSS; localhost operator hosting can use WS.

Map shows position, heading, selected vehicle and recent trail. Only the selected vehicle gets a name label. Signal freshness derives from original GPS timestamps; no interpolation/extrapolation after lost signal. Optional follow mode moves camera only when enabled. Preserve map orbit and add subtle transitions with reduced-motion support. Demo shares use only demo=1 and camera, never live telemetry or endpoints/tokens.

Common hardware: existing MAVLink reader for PX4/ArduPilot; generic HTTP/WS telemetry protocol; documented DJI OSD adapter for compatible vendor gateway applications. DJI support is payload-adapter compatibility, not a claim that every DJI controller connects without its vendor SDK. SDK/bridge read telemetry only. No real vehicle is available; prove paths with simulator, schema and local integration tests and disclose that boundary.

Alternatives: direct browser USB/UDP cannot cover common devices; a hosted public relay would expose precise operator locations and needs account/storage design. The existing operator-hosted bridge covers device variation with fewer prerequisites and a clear deployment boundary.
