# nearby alerts

Choose a fixed point in Indonesia and a radius of 5, 10, 25, 50 or 100 km. Enable browser notifications to receive new satellite observations acquired after you enabled that watch. This is not a fire-confirmation, ignition-time or fire-spread service.

## use it

Open **Alerts** (the bell). Move the map, choose **Use map center**, name the area and choose a radius. **Use my location** requests a single device location only when pressed; it does not track your movement. Then press **Enable nearby alerts** and allow the browser permission.

Existing points appear under **Already in this area** and do not trigger an initial notification. Nominal and high confidence are selected by default. One browser can have one watch on this deployment. Use **Send test** to request a clearly labeled test; a push provider accepting it does not prove device delivery. **Stop alerts** deletes the server watch and unsubscribes the browser. Stop before changing the area.

A notification opens the public observation on the map, including acquisition time and source. It never includes your saved watch coordinates or a private operation link. A satellite pixel may represent vegetation fire, industry or volcanic activity and needs ground verification.

## devices and timing

Standards Web Push works on supported Chrome, Edge, Firefox and Safari. On iPhone/iPad, use Safari's **Add to Home Screen**, open the installed app, then enable alerts; iOS/iPadOS16.4 or later is required. Embedded browsers may not support push. OS notification settings, Focus modes, browser permissions and network access affect delivery. Closing a tab does not require keeping its JavaScript timer running: a server sends the push to the registered worker.

Satellite collection is scheduled every three hours. The alert scheduler runs at minutes7,22,37,52, roughly every15minutes, and uses the published dataset. GitHub Actions and upstream services can be late or unavailable. GitHub can disable schedules on inactive public repositories after60days. No instantaneous detection or delivery is promised. Check the acquisition time and the watch's last successful check.

Runtime keys and software encryption have automated tests. Actual closed-tab delivery still needs verification on each target browser/device; do not infer hardware delivery from a unit test or an accepted HTTP response. [WebKit requirements](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) · [GitHub scheduling](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

## privacy and retention

Enabling sends the chosen center, radius, area name and browser push subscription to the private alert API. The payload is encrypted at rest with AES-GCM; the management token is stored as a hash server-side and retained by this browser. Public satellite feeds, source archives and Git branches never contain subscriber records. No account or personal contact details are required. Browser push providers process delivery through their own services.

The area stays fixed and watches expire after at most90days (or an earlier browser-subscription expiry). Stop deletes the server watch and its deduplication records; stale/expired records are removed when the service runs, rather than at an exact physical deletion deadline. Losing browser storage loses the management capability; revoke notification permission or unsubscribe that browser and allow expiry if you can no longer manage the watch. Do not save sensitive names such as a person's full address in the optional label.

## self-host

The default published map uses the Fire Tracker alert API. A self-hosted copy should point its API base at its own service (`OPERATIONS_ORIGIN` in `tracker/lib/operations-client.mjs`) and update the exact CORS origins in `server/lib/nearby-alerts-server.mjs`. The snapshot URL is a fixed public NASA observation feed; it never reads private team telemetry.

Use Node22.13+, run `npm ci --prefix server`, apply the schema-only D1 migrations, and deploy `server/worker.mjs` as described in the [server guide](../server/README.md). Configure these server secrets and preserve them across releases:

| Secret | Value |
|---|---|
| `ALERT_VAPID_PUBLIC_KEY` | Base64url uncompressed P-256 public key (65bytes). Public by design through `/api/alerts/config`. |
| `ALERT_VAPID_PRIVATE_KEY` | Base64url EC JWK `d` scalar (32bytes), not PEM. |
| `ALERT_STORAGE_KEY` | Random32byte AES key, base64url. Changing it makes existing encrypted watches unreadable. |
| `ALERT_DISPATCH_TOKEN` | Random32byte secret shared only with the scheduler. |

Generate a fresh set for your own deployment and pass directly to Wrangler without writing keys into tracked files:

```sh
node tools/generate-alert-keys.mjs | npx wrangler@4.92.0 secret bulk --config server/wrangler.jsonc
```

Keep the generated keys in your host's secret manager; never post them in issues. Configure the same `ALERT_DISPATCH_TOKEN` as a GitHub Actions secret and `ALERTS_ORIGIN` as the HTTPS origin of your own API. The included `nearby-alerts.yml` calls `tools/dispatch-alerts.mjs`; it paginates without logging subscriber data. Alternatively call `POST /api/alerts/dispatch` with the dispatch bearer token from another trusted scheduler. Alert publishing does not require an agent task or a signed-in visitor.

The push-only worker at `alerts-sw.js` uses the child `alerts/` scope, leaving the legacy offline worker intact. Deploy its manifest and PNG icons too. HTTPS is required outside loopback development.

## limits and failure handling

The service limits enrollment, test sends, active watches and retained delivery IDs. Current limits include1000active watches, three enrollments per IP/hour, six test sends per watch/hour and one test per minute. Values are deployment safeguards; capacity errors are explicit. Failed pushes retry with backoff;404/410 endpoints are retired. Successful provider acceptance records stable observation IDs so an unchanged or republished snapshot does not send them again. Late acquisitions after enrollment can still be picked up within24hours. A source snapshot older than six hours is rejected rather than presented as current.

This is best-effort delivery. A worker crash or ambiguous network response can make provider acceptance uncertain; it is not an exactly-once guarantee. Alerts are grouped per check, and the browser uses one notification tag. This system is not an emergency dispatch channel.
