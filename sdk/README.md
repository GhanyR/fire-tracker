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
