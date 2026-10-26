# Connect a UAV to Fire Tracker

Fire Tracker displays aircraft telemetry through a bridge you run. PX4/ArduPilot aircraft can forward MAVLink to it; DJI needs a supported DJI SDK/Cloud API gateway; other vendors can publish the same JSON contract. The bridge and JavaScript SDK are open source under this repository's MIT license.

This integration receives position/status only. It sends no flight, arm/disarm, camera or mission commands. Continue using the aircraft's ground station and pilot workflow for flight control.

## Compatibility

| Source | Integration provided here | What you must supply | Verification boundary |
| --- | --- | --- | --- |
| PX4 | MAVLink UDP/serial/TCP receiver through the Python bridge | Aircraft telemetry link and forwarding from the ground station/router | Encoded MAVLink packets tested locally; no physical aircraft tested |
| ArduPilot | Same MAVLink bridge | Compatible telemetry radio/controller and forwarding configuration | Same synthetic protocol test; no physical pairing verified |
| DJI | `fromDjiOsd` JSON adapter and stdin example | A gateway built with a compatible DJI SDK/Cloud API, supported aircraft/controller, SDK credentials and vendor-side setup | Adapter tested with synthetic OSD; no universal or automatic DJI pairing |
| Other UAV/gateway | Authenticated HTTP JSON or WebSocket telemetry | Vendor adapter supplying the documented fields and source UTC time | Local authenticated HTTP/WS tested |
| EO / IR camera | Supplied HLS, MJPEG, WHEP or MP4 stream descriptors | A reachable camera/gateway media URL and its CORS/TLS configuration | Protocol support depends on browser and gateway; no camera hardware verified |

An IR stream is imagery supplied by your camera gateway. Fire Tracker does not generate thermal measurements or infer temperatures from satellite or map colors. Metadata never starts a camera automatically; the viewer chooses a camera explicitly. Names, tasks and stream labels are gateway descriptions, not commands sent to an aircraft.

## Local quick start

From the repository root:

```sh
npm ci --prefix tracker
mkdir -p tracker/public/data
curl --fail -L https://ghanyr.github.io/pantau-api-nusantara/data/observations.json -o tracker/public/data/observations.json
npm run build --prefix tracker
python3 -m venv .venv
.venv/bin/pip install -r bridge/requirements.txt
.venv/bin/python bridge/drone_bridge.py --sim 2 --site tracker/dist
```

Use Node 22.13+ for the app build. The generated app directories are not tracked in a fresh clone; the commands above fetch the public satellite snapshot and build `tracker/dist` before starting the bridge. Open `http://127.0.0.1:8787`. Serving the built static app with `--site tracker/dist` puts the app and telemetry endpoint on the same origin. If you already have a prepared static app in `site/`, `--site site` serves that directory instead. In the app's drone connection panel, enter `ws://127.0.0.1:8787/ws`. Simulated vehicles carry `simulated: true` and `link: "sim"`.

The default listener is loopback only and accepts legacy tokenless local clients. Set tokens even on loopback when you need access control. Python receives UDP/serial telemetry; the browser connects to its HTTP/WebSocket output. This app has no direct browser UDP or USB telemetry adapter.

## PX4 / ArduPilot / MAVLink

Connect the aircraft to QGroundControl, Mission Planner, MAVProxy or your existing telemetry router, then forward a copy of MAVLink to a separate local UDP port. For example, choose `14551` so you do not compete with a ground station already using `14550`:

```sh
.venv/bin/python bridge/drone_bridge.py --mavlink udpin:127.0.0.1:14551 --site tracker/dist
```

Enable MAVLink forwarding in QGroundControl's telemetry settings and target `127.0.0.1:14551`. With MAVProxy, add `--out 127.0.0.1:14551` to your existing connection command. Forwarding is documented by [QGroundControl](https://github.com/mavlink/qgroundcontrol/blob/master/docs/en/qgc-user-guide/settings_view/telemetry.md) and [MAVProxy](https://ardupilot.ardupilot.org/mavproxy/docs/getting_started/forwarding.html). PX4's [telemetry guide](https://docs.px4.io/main/en/data_links/telemetry) describes the aircraft-to-ground-station link.

The bridge listens to `GLOBAL_POSITION_INT`, `HEARTBEAT`, `VFR_HUD`, `SYS_STATUS`, `BATTERY_STATUS` and `EXTENDED_SYS_STATE`. It converts latitude/longitude from degree × 10⁷, altitude from millimetres, and heading from centidegrees. `alt` is relative to home; `alt_msl` is mean sea level. Heartbeat aircraft types identify fixed-wing and common multirotors; unsupported/transitioning types remain `unknown`. Explicit landed state gives `landed` or `airborne`; armed state alone never implies flight. Link quality remains unknown unless supplied by a gateway. See the [MAVLink message definitions](https://mavlink.io/en/messages/common.html#GLOBAL_POSITION_INT).

`GLOBAL_POSITION_INT.time_boot_ms` is not UTC. The bridge stamps each new position message with the host's UTC reception time. Heartbeat/battery updates keep that last position timestamp, so cached coordinates become stale naturally. Duplicate or older boot timestamps are discarded, with uint32 wrap supported. After an aircraft reboots and resets its boot timer, restart the bridge to start a new feed. Keep the bridge host's clock synchronized. Separate aircraft must use distinct MAVLink system IDs, including across multiple `--mavlink` inputs.

## Generic HTTP / WebSocket JSON

A gateway, Node-RED flow, companion computer or custom vendor app can POST a position:

```sh
curl -X POST http://127.0.0.1:8787/telemetry \
  -H 'Content-Type: application/json' \
  -d '{"id":"uav-1","lat":-2.7634,"lon":114.1032,"alt":80,"hdg":90,"spd":8,"bat":76,"simulated":true}'
```

This is a training example: set `simulated: false` only for real observations. Supply `t` from your GPS observation when available; if omitted, the bridge uses reception time. For protected endpoints, add `-H "Authorization: Bearer $FIRE_TRACKER_TOKEN"`.

The normalized stream follows [telemetry.schema.json](../schemas/telemetry.schema.json):

```json
{
  "type": "telemetry", "id": "uav-1", "lat": -2.7634, "lon": 114.1032,
  "alt": 80, "alt_msl": null, "hdg": 90, "spd": 8, "bat": 76,
  "mode": "", "armed": null, "model": "", "link": "http",
  "t": "2026-10-26T08:00:00.000Z", "simulated": true,
  "name": "Alpha", "mission": "Perimeter survey", "airframe": "multirotor",
  "flightStatus": "unknown", "linkQuality": null,
  "streams": [{"id":"front-eo","label":"Front EO","kind":"eo","protocol":"hls","url":"https://camera.example/live.m3u8"}]
}
```

Coordinates must be finite JSON numbers in range, with no string/boolean conversion. Missing altitude, speed, heading, battery and armed state remain `null`; zero is a known measurement. `alt` means height relative to home, not height above terrain. `alt_msl` means height above mean sea level. Do not map an unknown datum into either field. Source timestamps more than ten seconds ahead of the bridge clock are rejected before storage. Source timestamps must be valid ISO 8601 UTC (`Z` or `+00:00`); output is normalized to milliseconds. Older observations for an existing aircraft are rejected (`409` over HTTP); equal timestamps may update status while keeping GPS age unchanged.

`name` is at most 80 characters and `mission` 160. `airframe` is `multirotor`, `fixed-wing` or `unknown`; `flightStatus` is `airborne`, `landed` or `unknown`. `linkQuality` is a supplied percentage from 0 to 100, or `null`. Missing names/tasks become empty strings, unknown enums remain `unknown`, and absent cameras become `[]`. A unit supports at most four streams with unique IDs (40 characters) and labels (80). Each stream requires `kind: eo|ir`, `protocol: hls|mjpeg|whep|mp4`, and an HTTP(S) URL (2048 characters). Credentials, secret query parameters, fragments and command endpoints are rejected. Use a gateway media endpoint with access controlled separately from the URL. A descriptor does not prove that the stream is reachable or that a sensor measures temperature.

`POST /telemetry` accepts one object or an array of up to 200; a failed validation or stale observation rejects the whole batch. `POST /detection` and `POST /report` accept geolocated observations. They follow the same publishing permissions.

WebSocket messages use the same envelope: `{ "type": "telemetry", … }`. The first server message after successful authentication is `{ "type": "hello", "drones": […], "detections": […], "reports": […] }`. `GET /state` returns `{ "drones": […], … }`. Send `{ "type": "ping" }` to receive `{ "type": "pong", "t": "…" }`. The bridge also uses standard WebSocket heartbeats.

The bridge keeps up to 200 vehicles and 500 detections/reports each in memory; `--max-vehicles` and `--max-history` adjust these bounds. Updating an aircraft moves it to the most recently updated end; the least recently updated is evicted when full. State is not persisted across restarts. CoT output is available through authenticated `GET /cot.xml` and optional `--cot-udp host:port`; CoT altitude is marked unknown because neither relative-home nor MSL is the required ellipsoid altitude.

## JavaScript SDK

Use the included module directly; no npm registry publication is required:

```js
import { FireTrackerClient } from './sdk/fire-tracker.mjs';

const tracker = new FireTrackerClient({
  url: 'https://your-telemetry.example',
  token: viewerToken,
  onError: error => console.error(error.message),
});
tracker.subscribe(drone => updateAircraftOnMap(drone));
await tracker.connect();
// Call tracker.close() when the dashboard is disposed.
```

A gateway uses a publisher token and `await tracker.publishTelemetry(normalizedObject)`. The SDK supports Node 22+ and modern browsers, parses hello/state/telemetry envelopes, sends auth before subscribing, pings the bridge, rejects invalid values and ignores older inbound observations. See [SDK API and runnable examples](../sdk/README.md).

## Private operations and cloud relay

The bridge remains local and in memory. To forward its telemetry into a six-hour private operation, run the [Node relay](../sdk/examples/bridge-to-cloud.mjs) on the gateway. Supply `FIRE_TRACKER_READ_TOKEN` and `OPERATIONS_PUBLISHER_TOKEN` through the process environment/secret manager, then run:

```sh
FIRE_TRACKER_URL=http://127.0.0.1:8787 \
OPERATIONS_URL=https://fire-tracker.fiveprayerapp.chatgpt.site \
OPERATIONS_SESSION_ID=your-session-id \
node sdk/examples/bridge-to-cloud.mjs
```

The relay subscribes using the bridge read token and sends units using the separate operation publisher token. It forwards the bridge observation `t` and `simulated` flag unchanged; it never replaces acquisition time with relay time. Pending work is bounded to the latest observation per unit and at most 100 units. The API rejects future, equal, older or fifteen-minute-old observations, so an old bridge snapshot is not made fresh. Errors are reported without printing telemetry or tokens. Restart after bridge disconnection; create a new operation after expiry. Stop with Ctrl+C. It makes no GPS requests and issues no flight commands.

`OperationsClient` uses `/api/operations/{create,join,state,unit,position,device,end}`. Private requests carry the session ID in `X-Operation-Id` and the capability in `Authorization: Bearer …`. Create/join return credentials without writing them to storage. Canonical unit kinds are `drone`, `team` and `vehicle`. A joined device token can publish/delete only its own position and cannot read the fleet. See [the operations API](OPERATIONS.md), [unit schema](../schemas/operations-unit.schema.json) and [SDK examples](../sdk/README.md#private-operations).

## DJI gateway

DJI aircraft do not expose one universal browser telemetry endpoint. Use the [DJI product compatibility table](https://repair.dji.com/help/content?customId=01700000763&documentType=&lang=en&paperDocType=ARTICLE&re=US&spaceId=17) and the [Mobile SDK supported products](https://github.com/dji-sdk/Mobile-SDK-Android-V5) for your exact aircraft, controller and SDK version. Some consumer models have no supported SDK path. A compatible model/controller still needs a native SDK application or Cloud API integration; this repository does not include an Android/iOS DJI app, vendor credentials or an MQTT broker.

After your gateway receives an OSD JSON packet, the SDK can convert common fields:

```js
import { FireTrackerClient, fromDjiOsd } from './sdk/fire-tracker.mjs';
const tracker = new FireTrackerClient({ url: bridgeUrl, token: publisherToken });
const telemetry = fromDjiOsd(osdPacket, {
  id: 'dji-aircraft-serial', model: 'your verified aircraft model',
  // Omit heightReference until you have verified the datum of this field:
  // heightReference: 'relative-home', // or 'msl'
  // heightField: 'height',
});
await tracker.publishTelemetry(telemetry);
```

The converter maps `data.latitude`, `data.longitude`, `data.attitude_head`, `data.horizontal_speed` and `data.battery.capacity_percent`; heading wraps into 0–360°. It uses an explicit `options.t`, packet `t`, or Cloud API top-level `timestamp` in epoch milliseconds; otherwise it uses gateway reception time. Supply a stable unique aircraft ID. See [DJI's aircraft OSD properties](https://developer.dji.com/doc/cloud-api-tutorial/en/api-reference/pilot-to-cloud/mqtt/aircraft/properties.html) for field definitions. Height is left unknown unless you explicitly choose its verified reference. Terrain AGL cannot be assumed to equal relative-home or MSL.

Runnable gateway adapter: pipe received OSD JSON lines into `node sdk/examples/dji-osd.mjs`. Set `DJI_AIRCRAFT_ID`, `FIRE_TRACKER_URL` and `FIRE_TRACKER_TOKEN`; set `DJI_HEIGHT_REFERENCE=relative-home` or `msl` only after confirming the source. This is a JSON adapter, not an automatic DJI hardware connection.

## Authentication and public HTTPS apps

For LAN or public use, create independent publisher and viewer secrets outside the repository:

```sh
export FIRE_TRACKER_TOKEN="$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"
export FIRE_TRACKER_READ_TOKEN="$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"
.venv/bin/python bridge/drone_bridge.py --host 127.0.0.1 --site tracker/dist
```

Use the publisher token only on your telemetry gateway. Enter the read token into the dashboard. Both tokens permit reading; only the publisher token permits posting telemetry/reports/detections. If only a read token is configured, network publishing is disabled. If only a publisher token is configured, all authenticated clients can publish, so configure both for a viewing-only dashboard. No token is included in static app assets. The SDK keeps tokens in memory for the connection and does not persist them.

HTTP uses `Authorization: Bearer TOKEN`. With tokens configured, a WebSocket upgrades first, then requires `{ "type": "auth", "token": "TOKEN" }` as its first message within five seconds. It sends no hello/snapshot/telemetry before valid auth. Invalid auth closes with code `1008`; viewer publish attempts return an error envelope. Tokenless loopback clients still receive hello immediately and can optionally send an auth message.

Binding HTTP to a non-loopback interface (`--host 0.0.0.0`, for example) fails unless a token is configured. For a public HTTPS-hosted Fire Tracker app, provide your own reachable **WSS/TLS endpoint** in front of this bridge, using a reverse proxy that forwards `/ws` WebSocket upgrades and HTTP routes. Keep tokens enabled even if the bridge listens on loopback behind the proxy. The Python server itself serves HTTP/WS and does not provision certificates, DNS, hosting or a public tunnel. An HTTPS page cannot rely on an insecure `ws://` endpoint; localhost connections may also be subject to browser local-network restrictions. The simplest local setup is the same-origin `--site tracker/dist` command above.

MAVLink UDP and optional CoT UDP are separate local/trusted-network transports and do not use these HTTP bearer tokens. Do not expose their UDP listener directly as the public browser endpoint.

## Verification

```sh
.venv/bin/python -m unittest discover -s bridge/tests -v
cd sdk
PATH="$PWD/../.venv/bin:$PATH" npm test
```

The SDK tests start a real local bridge and exercise HTTP publishing, authenticated WebSocket subscriptions, fleet/camera metadata, snapshot delivery, read-only rejection, invalid values and out-of-order observations. The relay test forwards synthetic bridge packets into a local private-API HTTP collector and verifies separate capability headers and unchanged observation time. With `pymavlink` installed, Python tests encode/decode actual MAVLink `HEARTBEAT`, `GLOBAL_POSITION_INT`, `BATTERY_STATUS` and `EXTENDED_SYS_STATE` packets before normalization. That test is explicitly skipped if the optional library is unavailable. These are synthetic protocol tests; aircraft, radio/controller connections, camera streams and real DJI credentials require a separate field test.
