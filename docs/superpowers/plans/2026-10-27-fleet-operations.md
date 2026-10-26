# Fire Tracker Fleet and Private Operations Implementation Plan

> **For agentic workers:** Use the existing Sites workflow and bounded independent tasks. Steps use checkbox syntax for tracking.

**Goal:** Make the public tracker useful for monitoring connected UAVs and voluntarily shared response-team locations, with an operational fleet view matching the supplied reference.

**Architecture:** Preserve the satellite dashboard and private browser WebSocket bridge. Add fleet metadata and camera inputs; add expiring capability-protected operations sessions on Sites D1. The static GitHub app can use the same public API with authorization headers. No flight control or public responder feed.

**Tech Stack:** Existing React/Vinext/MapLibre, Cloudflare D1 with Drizzle migrations, Python aiohttp/MAVLink bridge, dependency-free telemetry SDK; browser video protocols.

**Spec:** User supplied fleet/video screenshot and requested real drone/UAV integration, firefighter tracking, broad public usability. Existing light/dark design and NASA chronology remain unchanged.

## Global Constraints

- Real hardware connection has not been verified; declare protocol integration and synthetic test separately.
- Demo: six named simulated UAVs, per-unit tasks, battery and GPS time; three simulated ground resources. Never label them live.
- Team GPS requires explicit foreground consent; stop removes own position. No GPS access during QA. No real location or tokens in URLs, exports, storage, public feeds or analytics. Invitation capability may be shared only via deliberate copy action and stripped from fragment after parsing.
- Session lifetime six hours, location visibility fifteen minutes; physical deletion on a subsequent API request, at most 100 units/session. Secrets are random capabilities hashed server-side; separate admin, viewer, publisher, invitation and device permissions. No flight commands.
- Camera is an actual supplied stream or explicitly a simulated 3D view. IR means supplied IR imagery, never measured temperatures inferred from satellite/map colors.

## Shared API and Data Contract

Endpoints `/api/operations/{create,join,state,unit,position,device,end}`. Responses JSON `{ok:true,...}` or `{ok:false,error}`. All private responses no-store. Session id in `X-Operation-Id`; capability in `Authorization: Bearer ...`; allow Sites origin, GhanyR GitHub Pages and loopback preview origins; Node SDK may omit Origin.

- POST create `{label}` -> `{sessionId,label,expiresAt,adminToken,viewerToken,publisherToken,inviteToken}`. Anonymous bounded creation with rate limits; no stored secret plaintext.
- POST join `{sessionId,inviteToken,name,kind:'team'|'vehicle'}` -> `{sessionId,deviceId,deviceToken,expiresAt}`. This capability publishes/deletes only its own position; no general read privilege.
- GET state, viewer/admin/publisher capability -> `{session:{id,label,expiresAt,role},units:[...]}`. Keep source timestamps and unknown metrics.
- POST unit, publisher/admin -> `{unit:{id,kind,name,mission,status,lat,lon,t,accuracy,alt,alt_msl,hdg,spd,bat,model,mode,armed,simulated,streams}}`; requires source UTC observation time, bounded coordinates/metrics/text, rejects future/out-of-order/stale positions. No arbitrary device access.
- POST position, device capability -> `{lat,lon,t,accuracy,status}`. Identity/kind come from token, never from payload.
- DELETE device, device capability: remove own row and revoke token. DELETE end, admin: expire session and remove units.

A stream: `{id,label,kind:'eo'|'ir',protocol:'hls'|'mjpeg'|'whep'|'mp4',url}`. Max four, HTTP(S) only, no embedded user/password, never a command endpoint. Browser loads only after explicit camera choice. `name`, `mission`, `airframe`, `flightStatus`, `linkQuality`, `streams` extend existing telemetry; unknown values remain null/empty, no invented live status.

## Review Focus

- Missing/incorrect/expired capability must not disclose positions; device token cannot impersonate another member.
- Exact observation time and out-of-order packets never refresh stale positions.
- Unsupported or failed video is honest and does not leave stale-frame/live labels.
- Closing/ending GPS and switching demo/real sessions does not leak tokens or coordinates through ordinary map sharing.
- Static mirror API, phone layout, network denial/reconnect, and six-hour expiry remain usable.

## Tasks

- [x] Backend: schema and migrations, bounded authenticated API, real SQLite auth/expiry/order tests, build-local D1 verification.
- [x] Device integration: metadata across SDK/bridge, six-unit demo, cloud relay example, actual local bridge HTTP/WS and MAVLink-format tests, precise docs.
- [x] Frontend: fleet inspector, map/video workspace, private session creation/view/participant join, opt-in GPS controls, team markers, light/dark/mobile.
- [x] Integration: read-only independent security/correctness review, regression suites, synthetic multi-client operations checks; never use personal GPS or claim hardware tested.
- [ ] Publish exact native source and GitHub source, inspect public deployment, preserve public access and MIT source, reload user tabs and save proof.
