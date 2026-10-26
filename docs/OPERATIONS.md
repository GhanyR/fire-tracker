# Private fleet operations API

The hosted tracker exposes `/api/operations/{create,join,state,unit,position,device,end}`. The static GitHub Pages app and a relay/SDK can use the same API. This is a read-only situational display plus voluntary location publishing: there are no flight commands, public responder feed, or backend camera requests.

Every response has `Cache-Control: no-store`. Successful JSON is `{ "ok": true, ... }`; errors are `{ "ok": false, "error": "..." }`. Send JSON with `Content-Type: application/json`. Use `X-Operation-Id: <sessionId>` and `Authorization: Bearer <capability>` on authenticated requests. Query parameters are rejected. Never put capabilities or private coordinates in dashboard links, exports, analytics, or persistent browser storage.

## Session and device lifecycle

- `POST create` with `{label}` returns `sessionId`, `label`, `expiresAt` and separate `adminToken`, `viewerToken`, `publisherToken`, `inviteToken`. Lifetime is six hours, with no extension. These random 256-bit capabilities are returned once; D1 stores SHA-256 hashes only. Keep them in memory. Anyone holding a capability has its permission.
- `POST join` with `{sessionId,inviteToken,name,kind:'team'|'vehicle'}` returns `{sessionId,deviceId,deviceToken,expiresAt}`. A joined device starts with `status:'pending'`, `lat:null`, `lon:null`, `t:null`. Invite sharing must be deliberate; when a browser accepts a fragment invitation, remove it from the URL immediately.
- `GET state` accepts admin, viewer, or publisher capability and returns `{session:{id,label,expiresAt,role},units:[...]}`. Invite and device capabilities cannot read this state.
- `POST unit` accepts admin or publisher capability and `{unit:{...}}`. It creates or updates only publisher-owned fleet rows; it cannot overwrite a joined device.
- `POST position` accepts a device capability and `{lat,lon,t,accuracy?,status?}`. The server derives device ID, name and kind from the capability. Extra identity/role fields are rejected.
- `DELETE device` accepts a device capability, removes that device's own row and revokes its capability. Other members remain. The browser should call it when voluntary sharing stops.
- `DELETE end` requires admin capability and deletes the session, devices and units. Every associated capability then fails. Expiry has the same access result.

Create and join return HTTP 201. Unit/position return `{ok:true,unit}`; delete operations return `{ok:true}`. Missing, incorrect, cross-session and expired capabilities return 401 without positions. A valid capability with insufficient scope returns 403. Invalid JSON/fields/times return 400, observation conflicts/capacity return 409, oversized bodies 413, wrong content type 415, application limits 429, and unavailable/unconfigured D1 503.

## Fleet telemetry and video metadata

Required unit fields are `id`, `lat`, `lon`, `t`. Canonical kind is `drone` (default), `team`, or `vehicle`. Optional fields are `name`, `mission`, `status`, `accuracy`, `alt`, `alt_msl`, `hdg`, `spd`, `bat`, `model`, `mode`, `armed`, `simulated`, `airframe`, `flightStatus`, `linkQuality`, `streams`. Unknown numeric/boolean metrics remain null; unknown text remains empty; airframe/flight status remain `unknown`. No live status, measured temperature, or observation time is inferred.

Text limits: unit ID/name/model 80 characters; mission 160; status/mode 40. IDs use ASCII letters, digits, `_ . : -`. Kind/airframe/flight status are validated; airframe is `multirotor|fixed-wing|unknown`, flight status `airborne|landed|unknown`. Latitude/longitude must be finite within ±90/±180. Bounds are accuracy 0–100,000 m, relative altitude −1,000–25,000 m, MSL altitude −1,000–30,000 m, heading 0–360°, speed 0–500 m/s, battery/link quality 0–100.

Each stream is `{id,label,kind:'eo'|'ir',protocol:'hls'|'mjpeg'|'whep'|'mp4',url}`. There are at most four unique stream IDs (40 characters), labels are at most 80 characters, URLs at most 2,048. HTTP(S) only; credentials, fragments, secret-like query keys and recognizable command paths/query fields are rejected. A URL validation rule cannot establish what a remote endpoint does: supply a camera media endpoint you control. The backend stores metadata and never fetches it. The browser loads a stream only after explicit selection. An IR label means supplied IR imagery; no temperature is derived from map or satellite colors.

## Observation time and retention

`t` is a required original UTC ISO observation timestamp (`Z` or `+00:00`, up to six fractional digits). The exact string is retained. Impossible dates, non-UTC times, future samples, and samples at least fifteen minutes old are rejected. Equal or earlier source timestamps never move a unit or refresh retention. Ordering preserves microsecond fractions even though the display clock uses milliseconds.

The viewer independently removes expired coordinates, trails and camera targets using the source timestamp, including during network failure. Browser participants explicitly enable foreground GPS; leaving the page or losing session access stops sharing. Only the latest coordinate per unit is stored, with no server trail/history. At fifteen minutes it is unavailable through the API. On the next operations request, stale coordinate/accuracy/altitude/heading/speed fields are physically set to null; the source `t` remains unchanged and status becomes `stale`. A pending device has no location to expose.

**Physical cleanup is lazy.** An idle D1 database can retain expired rows until the next request. Strict unattended deletion at an exact wall-clock deadline requires a separately configured scheduled cleanup facility. This implementation does not claim a hard idle-storage retention guarantee. Session expiry is enforced on every authenticated access; cleanup deletes expired sessions and their dependent rows.

## Application bounds and deployment

The schema is declared in native `db/schema.ts` and generated by `npm run db:generate`. Deploy the schema-only Drizzle SQL/snapshot/journal before serving the route. Configure the Sites logical D1 binding as `DB`; the route adapter passes `env.DB` to the portable `handleOperations(request,db)` core. There is no request-time table creation or migration. The first migration is `0000_aspiring_iron_fist.sql`.

Anonymous creation is limited to three/hour/client IP, twenty/minute globally, and 200 active sessions. A session has at most 100 units including pending devices. Joining is limited to twenty/minute/session/client IP. Reads are limited to 240/minute/session/read scope, fleet writes to 1,200/minute/session/publish scope, and a device to 120 position writes/minute. Bodies are limited to 16 KiB and the expiring rate table to 4,096 rows. Client IPs are hashed before storage; production uses Cloudflare's trusted connecting-IP header. Clients without that header share a conservative anonymous bucket. HTTP 429 includes `Retry-After: 60`; hourly limits may require a longer wait. These are application safeguards, not a replacement for edge traffic/spend limits under sustained hostile traffic.

CORS permits the exact public Sites origin `https://fire-tracker.fiveprayerapp.chatgpt.site`, `https://ghanyr.github.io`, the request's own origin, and HTTP(S) loopback origins (`localhost`, `127.0.0.1`, `[::1]`, optional ports). Node clients may omit Origin. Other Sites tenants and hostname lookalikes are rejected. Authorization is still required regardless of CORS.

## Verification boundary

`tests/operations-server.test.mjs` runs the HTTP handler against an actual in-memory SQLite database loaded from the generated migration through a minimal D1 transport adapter. Tests cover capability hashing/scope/cross-session denial, pending membership, per-device ownership/deletion, ending/expiry, exact source time and ordering, stale coordinate removal, CORS, invalid payloads/streams, unit capacity and rate windows. Fixtures are synthetic; no GPS permission or personal location is used. Local D1/deployed smoke checks are separate from these SQLite tests, and protocol integration is separate from real UAV hardware verification.
