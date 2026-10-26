# Fire Tracker telemetry SDK

A dependency-free JavaScript module for Node 22+ and modern browsers. It publishes normalized telemetry over HTTP and subscribes over WebSocket. The module is included in this repository; it has not been published to npm.

```js
import { FireTrackerClient } from './sdk/fire-tracker.mjs';

const client = new FireTrackerClient({
  url: 'http://127.0.0.1:8787',
  token: process.env.FIRE_TRACKER_TOKEN || '',
  onError: error => console.error(error.message),
});
const unsubscribe = client.subscribe(drone => {
  console.log(drone.id, drone.lat, drone.lon, drone.t);
});
await client.connect(); // authenticates, then receives the hello snapshot
await client.publishTelemetry({
  id: 'training-1', lat: -2.7634, lon: 114.1032,
  alt: 80, bat: 75, simulated: true,
  t: new Date().toISOString(),
});
// When finished: unsubscribe(); client.close();
```

For browsers, import the same file from your own static host, pass the token from a user input, and omit `process.env`. Keep a publisher token on your gateway; a dashboard normally uses `FIRE_TRACKER_READ_TOKEN`.

## API

- `new FireTrackerClient({ url, token?, onError?, maxVehicles? })`: accepts the bridge base HTTP(S) URL or its WS(S) `/ws` URL. Tokens are sent as an HTTP bearer header or the first WebSocket auth message, never as query parameters. Default URL: `http://127.0.0.1:8787`.
- `subscribe((telemetry, envelope) => …)`: register before connecting to receive the initial snapshot. Returns an unsubscribe function.
- `await connect()`: resolve after the `hello`/`state` snapshot. Failed auth, network failure or a 10 second handshake timeout rejects it. It does not reconnect automatically; call `connect()` again after a connection loss.
- `await publishTelemetry(object)`: validate and POST one object. Reject on invalid telemetry, failed auth or an older observation (`409`). It does not require a WebSocket connection.
- `acceptEnvelope(object)`: consume a `{ type: 'telemetry', … }`, `{ type: 'hello', drones: […] }`, or `/state` JSON snapshot from another transport. Missing inbound observation times are rejected.
- `drones`: latest accepted vehicles, capped at 200 by default. Older observations cannot overwrite a newer one. Equal timestamps can update battery/mode without refreshing GPS time.
- `connected`, `close()`: inspect the connection and release its socket/heartbeat timer.
- `normalizeTelemetry(object)`: validate finite JSON numbers, coordinates and UTC time, and fill unknown measurements with `null`.
- `fromDjiOsd(packet, options)`: map the common OSD fields described in [UAV integration](../docs/UAV.md#dji-gateway). This does not connect to DJI hardware or an MQTT broker.

`heartbeatMs` (default `20000`) and `connectTimeoutMs` (default `10000`) can be changed in the constructor. `fetch` and `WebSocket` implementations can be injected for another JavaScript runtime. Native WebSocket is included in current Node 22; older Node versions need an implementation supplied by the application.

Fleet metadata is preserved through normalization, publishing and subscriptions: `name` (80 characters), `mission` (160), `airframe` (`multirotor|fixed-wing|unknown`), `flightStatus` (`airborne|landed|unknown`), `linkQuality` (`null` or 0–100), and up to four `streams`. A supplied camera is `{id,label,kind:'eo'|'ir',protocol:'hls'|'mjpeg'|'whep'|'mp4',url}`; URLs must use HTTP(S) without credentials, secret query parameters, fragments or command paths. Cameras are gateway inputs; this SDK produces no video or inferred thermal measurements. See [the schema](../schemas/telemetry.schema.json).

## Private operations

```js
import { OperationsClient } from './sdk/fire-tracker.mjs';

const url = process.env.OPERATIONS_URL;
const session = await new OperationsClient({ url }).create({ label: 'Training response' });
// Keep session capabilities in memory or your gateway's secret manager.
const gateway = new OperationsClient({ url, sessionId: session.sessionId, token: session.publisherToken });
await gateway.publishUnit({
  id: 'training-1', kind: 'drone', name: 'Alpha', mission: 'Perimeter survey',
  lat: 0, lon: 0, t: new Date().toISOString(), simulated: true,
  airframe: 'fixed-wing', flightStatus: 'unknown', linkQuality: null,
});
const fleet = await gateway.state(); // { ok:true, session:{…}, units:[…] }
```

- `new OperationsClient({url, sessionId?, token?})`: pass the Site base URL, the nonsecret session ID and a capability separately. No credentials/query/fragment are accepted in the URL. Private calls use `X-Operation-Id` and `Authorization`; responses bypass the cache, cookies and redirects.
- `create({label})`: POST `create`; returns the session ID, expiry and separate admin/viewer/publisher/invitation tokens. It does not change the client's selected role.
- `join({sessionId,inviteToken,name,kind:'team'|'vehicle'})`: POST `join`; returns `deviceId` and a device capability. It does not request GPS permission or share a position.
- `state()`: GET `state` with viewer/admin/publisher capability.
- `publishUnit(unit)`: POST `unit` with `{unit}` and publisher/admin capability. Requires source UTC `t`; it preserves the original string and unknown metrics. Canonical kinds: `drone|team|vehicle`. Bridge-only `type` and `link` are excluded from this API body.
- `publishPosition({lat,lon,t,accuracy,status})`: POST `position` with device capability. The server derives device identity and kind from that capability. Call only after foreground consent, with the location acquisition time.
- `stopSharing()`: DELETE `device` with device capability; removes its row and revokes the token.
- `endSession()`: DELETE `end` with admin capability; expires the whole operation and removes its units.

All methods return the server JSON or reject on HTTP/API error. The SDK does not persist tokens/coordinates or send them to public map feeds. Sessions expire after six hours; the server limits membership to 100 and removes coordinates after fifteen minutes. It rejects future/equal/out-of-order/stale positions. This is separate from the bridge's more permissive status-update behavior. [Full API](../docs/OPERATIONS.md).

To publish from a connected bridge, inject `FIRE_TRACKER_READ_TOKEN` and `OPERATIONS_PUBLISHER_TOKEN` into the environment and run:

```sh
FIRE_TRACKER_URL=http://127.0.0.1:8787 \
OPERATIONS_URL=https://fire-tracker.fiveprayerapp.chatgpt.site \
OPERATIONS_SESSION_ID=your-session-id \
node sdk/examples/bridge-to-cloud.mjs
```

The relay keeps original observation times and the `simulated` flag, bounds pending work, and uses separate bridge/cloud capabilities. Keep tokens out of command arguments, URLs and logs. It receives no flight commands and does not access GPS. Restart it after a bridge disconnection; Ctrl+C releases the connection.

## Examples

Start the bridge from the repository root:

```sh
python3 -m venv .venv
.venv/bin/pip install -r bridge/requirements.txt
.venv/bin/python bridge/drone_bridge.py --sim 2 --site tracker/dist
```

In another terminal:

```sh
node sdk/examples/subscribe.mjs
printf '%s\n' '{"id":"test-uav","lat":-2.76,"lon":114.10,"alt":80,"simulated":true}' | node sdk/examples/publish-json.mjs
```

For a protected bridge, set `FIRE_TRACKER_URL` and `FIRE_TRACKER_TOKEN` for publishers; the subscriber can use `FIRE_TRACKER_READ_TOKEN`. The JSON example consumes newline-delimited JSON from a real telemetry adapter or a test fixture. [The DJI adapter](examples/dji-osd.mjs) consumes already-received OSD JSON and leaves height unknown unless you explicitly configure its datum.

Tests start a real local Python/aiohttp bridge, then use native Node HTTP and WebSocket clients:

```sh
python3 -m unittest discover -s bridge/tests -v
cd sdk
npm test
```

If aiohttp is installed in the local venv, run the SDK tests with that Python on `PATH`: `PATH="$PWD/../.venv/bin:$PATH" npm test` from `sdk/`.
