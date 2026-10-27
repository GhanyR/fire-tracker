# Self-hosted private operations API

`worker.mjs` is a standalone Cloudflare Worker exposing the same private API as the hosted tracker. `lib/operations-server.mjs`, schema-only Drizzle SQL, schema and tests are included under MIT. No credentials or user locations are in this source.

Run `npm ci --prefix server` first. The worker also serves [nearby push alerts](../docs/NEARBY_ALERTS.md), with separate secrets, encrypted watches and a scheduler.

1. Create a D1 database in your own Cloudflare account (for example `npx wrangler@4.92.0 d1 create fire-tracker-operations`).
2. Copy `wrangler.example.jsonc` to an untracked `wrangler.jsonc` in this folder. Replace the placeholder with the actual D1 ID returned by Cloudflare; preserve binding `DB`.
3. From the repository root, apply `npx wrangler@4.92.0 d1 migrations apply DB --remote --config server/wrangler.jsonc`, then deploy with `npx wrangler@4.92.0 deploy --config server/wrangler.jsonc`.
4. Set the frontend `OPERATIONS_ORIGIN` to your API origin and add your frontend's exact HTTPS origin to `allowedOrigin` in `lib/operations-server.mjs`. Run `npm ci --prefix tracker` and `npm run build --prefix tracker` for the static app.

Local tests: `node --test server/tests/*.test.mjs` on Node22.13+. These use actual SQLite and synthetic fixtures. For local D1, apply migrations with `--local` and run Wrangler dev; do not publish the example placeholder config.

See [the API contract](../docs/OPERATIONS.md) for capabilities, quotas, expiry, camera metadata and the distinction between fifteen-minute API visibility and lazy physical database cleanup. Operators requiring a strict idle at-rest deletion deadline must configure scheduled cleanup on their own hosting. This API provides situational monitoring and voluntary updates; it sends no drone flight commands.
