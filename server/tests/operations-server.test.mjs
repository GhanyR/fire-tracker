import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile, readdir } from 'node:fs/promises';

const base = 'https://fire-tracker.fiveprayerapp.chatgpt.site';
const initialTime = Date.parse('2026-10-27T06:00:00.000Z');
let handleOperations;

// These requests exercise the real SQL emitted by the handler. Only the D1
// transport is adapted to Node's local SQLite; no database behavior is mocked.
async function fixture(t) {
  ({ handleOperations } = await import('../lib/operations-server.mjs'));
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const name of (await readdir(new URL('../drizzle/', import.meta.url))).filter(name => name.endsWith('.sql')).sort()) {
    sqlite.exec(await readFile(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'));
  }
  t.after(() => sqlite.close());
  function prepare(sql) {
    let values = [];
    const execute = () => sqlite.prepare(sql);
    return {
      bind(...bindings) { values = bindings; return this; },
      async first() { return execute().get(...values) ?? null; },
      async all() { return { results: execute().all(...values) }; },
      async run() { const result = execute().run(...values); return { success: true, meta: { changes: Number(result.changes) } }; },
    };
  }
  const db = { prepare, async batch(statements) {
    sqlite.exec('BEGIN');
    try { const result = []; for (const statement of statements) result.push(await statement.run()); sqlite.exec('COMMIT'); return result; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  } };
  let now = initialTime;
  async function call(action, { method = 'POST', body, sessionId, token, origin, ip = '198.51.100.12', headers = {} } = {}) {
    const request = new Request(`${base}/api/operations/${action}`, {
      method, headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip,
        ...(sessionId ? { 'X-Operation-Id': sessionId } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(origin ? { Origin: origin } : {}), ...headers },
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    });
    const response = await handleOperations(request, db, { now: () => now });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return { status: response.status, body: method === 'OPTIONS' ? null : await response.json(), headers: response.headers };
  }
  async function create() {
    const response = await call('create', { body: { label: 'Synthetic training operation' } });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    return response.body;
  }
  async function join(session, name = 'Synthetic team') {
    const response = await call('join', { body: { sessionId: session.sessionId, inviteToken: session.inviteToken, name, kind: 'team' } });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    return response.body;
  }
  const unit = (overrides = {}) => ({ id: 'TRAINING-01', kind: 'drone', name: 'Synthetic UAV', lat: -8, lon: 113,
    t: '2026-10-27T05:59:59.123456Z', mission: 'Synthetic patrol', airframe: 'multirotor', flightStatus: 'unknown', linkQuality: null,
    ...overrides });
  return { call, create, join, unit, sqlite, setTime: value => { now = value; } };
}

test('creates six-hour sessions with separate random capabilities stored only as hashes', async t => {
  const f = await fixture(t), session = await f.create();
  assert.equal(session.ok, true);
  assert.equal(session.expiresAt, '2026-10-27T12:00:00.000Z');
  assert.equal(new Set([session.adminToken, session.viewerToken, session.publisherToken, session.inviteToken]).size, 4);
  for (const token of [session.adminToken, session.viewerToken, session.publisherToken, session.inviteToken]) {
    assert.match(token, /^[a-zA-Z0-9_-]{43}$/);
    assert.equal(JSON.stringify(f.sqlite.prepare('SELECT * FROM operations_sessions').all()).includes(token), false);
  }
});

test('rejects missing and cross-session capabilities without exposing positions', async t => {
  const f = await fixture(t), a = await f.create(), b = await f.create();
  assert.equal((await f.call('unit', { sessionId: a.sessionId, token: a.publisherToken, body: { unit: f.unit() } })).status, 200);
  for (const options of [{ sessionId: a.sessionId }, { sessionId: a.sessionId, token: b.viewerToken }, { sessionId: 'unknown', token: a.viewerToken }]) {
    const response = await f.call('state', { method: 'GET', ...options });
    assert.equal(response.status, 401);
    assert.deepEqual(response.body, { ok: false, error: 'Unauthorized or expired session.' });
  }
});

test('viewer and invite capabilities cannot publish or end a session', async t => {
  const f = await fixture(t), session = await f.create();
  for (const token of [session.viewerToken, session.inviteToken]) {
    assert.equal((await f.call('unit', { sessionId: session.sessionId, token, body: { unit: f.unit() } })).status, 403);
    assert.equal((await f.call('end', { method: 'DELETE', sessionId: session.sessionId, token })).status, 403);
  }
  assert.equal((await f.call('state', { method: 'GET', sessionId: session.sessionId, token: session.inviteToken })).status, 403);
});

test('joined devices appear pending with no coordinates and cannot read the session', async t => {
  const f = await fixture(t), session = await f.create(), device = await f.join(session);
  assert.equal(device.expiresAt, session.expiresAt);
  const state = await f.call('state', { method: 'GET', sessionId: session.sessionId, token: session.viewerToken });
  assert.equal(state.body.units[0].id, device.deviceId);
  assert.equal(state.body.units[0].status, 'pending');
  assert.equal(state.body.units[0].lat, null);
  assert.equal(state.body.units[0].t, null);
  assert.equal((await f.call('state', { method: 'GET', sessionId: session.sessionId, token: device.deviceToken })).status, 403);
});

test('device capability publishes and deletes only its own row, then is revoked', async t => {
  const f = await fixture(t), session = await f.create(), a = await f.join(session, 'Synthetic A'), b = await f.join(session, 'Synthetic B');
  const auth = { sessionId: session.sessionId, token: a.deviceToken };
  assert.equal((await f.call('position', { ...auth, body: { lat: -8, lon: 113, t: '2026-10-27T05:59:58Z', deviceId: b.deviceId } })).status, 400);
  const posted = await f.call('position', { ...auth, body: { lat: -8, lon: 113, t: '2026-10-27T05:59:58Z', accuracy: 15 } });
  assert.equal(posted.status, 200);
  assert.equal(posted.body.unit.id, a.deviceId);
  assert.equal(posted.body.unit.kind, 'team');
  assert.equal((await f.call('unit', { sessionId: session.sessionId, token: session.publisherToken, body: { unit: f.unit({ id: a.deviceId }) } })).status, 403);
  assert.equal((await f.call('device', { method: 'DELETE', ...auth })).status, 200);
  assert.equal((await f.call('position', { ...auth, body: { lat: -8, lon: 113, t: '2026-10-27T05:59:59Z' } })).status, 401);
  const state = await f.call('state', { method: 'GET', sessionId: session.sessionId, token: session.viewerToken });
  assert.deepEqual(state.body.units.map(unit => unit.id), [b.deviceId]);
});

test('keeps exact source time and rejects future, stale, equal, and out-of-order observations', async t => {
  const f = await fixture(t), session = await f.create(), auth = { sessionId: session.sessionId, token: session.publisherToken };
  assert.equal((await f.call('unit', { ...auth, body: { unit: f.unit() } })).body.unit.t, '2026-10-27T05:59:59.123456Z');
  for (const [time, status] of [['2026-10-27T06:00:00.001Z', 400], ['2026-10-27T05:45:00Z', 400], ['2026-10-27T05:59:59.123456Z', 409], ['2026-10-27T05:59:59.123455Z', 409]]) {
    assert.equal((await f.call('unit', { ...auth, body: { unit: f.unit({ t: time, lat: -9 }) } })).status, status);
  }
  const state = await f.call('state', { method: 'GET', sessionId: session.sessionId, token: session.viewerToken });
  assert.equal(state.body.units[0].lat, -8);
  assert.equal(state.body.units[0].t, '2026-10-27T05:59:59.123456Z');
});

test('removes stale coordinates at fifteen minutes without manufacturing observation times', async t => {
  const f = await fixture(t), session = await f.create();
  await f.call('unit', { sessionId: session.sessionId, token: session.publisherToken, body: { unit: f.unit({ alt: 100, alt_msl: 200, hdg: 90, spd: 10 }) } });
  f.setTime(Date.parse('2026-10-27T06:15:00.000Z'));
  const state = await f.call('state', { method: 'GET', sessionId: session.sessionId, token: session.viewerToken });
  assert.equal(state.body.units[0].status, 'stale');
  for (const field of ['lat', 'lon', 'accuracy', 'alt', 'alt_msl', 'hdg', 'spd']) assert.equal(state.body.units[0][field], null);
  assert.equal(state.body.units[0].t, '2026-10-27T05:59:59.123456Z');
  assert.equal(JSON.parse(f.sqlite.prepare('SELECT payload_json FROM operations_units').get().payload_json).lat, null);
});

test('expired sessions and ended sessions immediately reject all capabilities and erase unit rows', async t => {
  const f = await fixture(t), session = await f.create();
  await f.join(session);
  assert.equal((await f.call('end', { method: 'DELETE', sessionId: session.sessionId, token: session.adminToken })).status, 200);
  assert.equal((await f.call('state', { method: 'GET', sessionId: session.sessionId, token: session.adminToken })).status, 401);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM operations_units').get().n, 0);
  const second = await f.create();
  await f.join(second);
  f.setTime(Date.parse('2026-10-27T12:00:00.000Z'));
  assert.equal((await f.call('state', { method: 'GET', sessionId: second.sessionId, token: second.viewerToken })).status, 401);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM operations_units').get().n, 0);
});

test('CORS accepts exact trusted origins and loopback, rejects lookalikes and never caches', async t => {
  const f = await fixture(t);
  for (const origin of [base, 'https://ghanyr.github.io', 'http://127.0.0.1:8787', 'http://localhost:3000', 'http://[::1]:8787']) {
    const response = await f.call('state', { method: 'OPTIONS', origin, headers: { 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization,x-operation-id' } });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
  }
  for (const origin of ['https://ghanyr.github.io.evil.test', 'https://evil.chatgpt.site', 'null']) {
    const response = await f.call('create', { origin, body: { label: 'Denied' } });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
});

test('validates payload size, UTC times, finite bounds, stream safety, and unknown metrics', async t => {
  const f = await fixture(t), session = await f.create(), auth = { sessionId: session.sessionId, token: session.publisherToken };
  for (const changed of [{ lat: 91 }, { lon: -181 }, { t: null }, { t: '2026-02-30T05:59:59Z' }, { t: '2026-10-27T12:59:59+07:00' },
    { bat: 101 }, { accuracy: -1 }, { airframe: 'helicopter' }, { flightStatus: 'live' }, { linkQuality: 101 },
    { streams: [{ id: 'cam', label: 'Synthetic', kind: 'eo', protocol: 'hls', url: 'https://user:secret@example.test/video.m3u8' }] },
    { streams: [{ id: 'cam', kind: 'eo', protocol: 'hls', url: 'javascript:alert(1)' }] },
    { streams: [{ id: 'cam', kind: 'eo', protocol: 'hls', url: 'https://example.test/command/arm' }] },
    { role: 'admin' }]) {
    assert.equal((await f.call('unit', { ...auth, body: { unit: f.unit(changed) } })).status, 400, JSON.stringify(changed));
  }
  assert.equal((await f.call('unit', { ...auth, body: 'x'.repeat(17000) })).status, 413);
  const posted = await f.call('unit', { ...auth, body: { unit: f.unit({ bat: null, alt: null, streams: [{ id: 'cam', label: 'Synthetic camera', kind: 'ir', protocol: 'hls', url: 'https://example.test/synthetic.m3u8' }] }) } });
  assert.equal(posted.status, 200);
  assert.equal(posted.body.unit.bat, null);
  assert.equal(posted.body.unit.flightStatus, 'unknown');
  assert.equal(posted.body.unit.streams[0].kind, 'ir');
});

test('bounds anonymous creation and session membership without overwriting existing units', async t => {
  const f = await fixture(t), session = await f.create();
  await f.create(); await f.create();
  assert.equal((await f.call('create', { body: { label: 'Fourth' } })).status, 429);
  for (let i = 0; i < 100; i++) {
    const response = await f.call('unit', { sessionId: session.sessionId, token: session.publisherToken, body: { unit: f.unit({ id: `SYNTHETIC-${i}` }) } });
    assert.equal(response.status, 200);
  }
  assert.equal((await f.call('join', { body: { sessionId: session.sessionId, inviteToken: session.inviteToken, name: 'Overflow', kind: 'vehicle' } })).status, 409);
  assert.equal((await f.call('unit', { sessionId: session.sessionId, token: session.publisherToken, body: { unit: f.unit({ id: 'Overflow' }) } })).status, 409);
  assert.equal((await f.call('unit', { sessionId: session.sessionId, token: session.publisherToken, body: { unit: f.unit({ id: 'SYNTHETIC-0', t: '2026-10-27T05:59:59.124Z' }) } })).status, 200);
});

test('rejects streams with missing required type fields or malformed URL escapes as client errors', async t => {
  const f = await fixture(t), session = await f.create();
  for (const stream of [
    { id: 'cam', protocol: 'hls', url: 'https://example.test/video.m3u8' },
    { id: 'cam', kind: 'eo', url: 'https://example.test/video.m3u8' },
    { id: 'cam', kind: 'eo', protocol: 'hls', url: 'https://example.test/%xx' },
    { id: 'cam', kind: 'eo', protocol: 'hls', url: 'https://example.test/?command=arm' },
    { id: 'cam', kind: 'eo', protocol: 'hls', url: 'https://example.test/video.m3u8?access_token=synthetic-secret' },
  ]) {
    assert.equal((await f.call('unit', { sessionId: session.sessionId, token: session.publisherToken, body: { unit: f.unit({ streams: [stream] }) } })).status, 400);
  }
});

test('per-device write rate is bounded and resets without granting broader scopes', async t => {
  const f = await fixture(t), session = await f.create(), device = await f.join(session);
  const auth = { sessionId: session.sessionId, token: device.deviceToken };
  for (let i = 0; i < 120; i++) {
    const response = await f.call('position', { ...auth, body: { lat: -8, lon: 113, t: `2026-10-27T05:59:59.${String(i).padStart(3, '0')}Z` } });
    assert.equal(response.status, 200);
  }
  const denied = await f.call('position', { ...auth, body: { lat: -8, lon: 113, t: '2026-10-27T06:00:00Z' } });
  assert.equal(denied.status, 429);
  assert.equal(denied.headers.get('retry-after'), '60');
  f.setTime(Date.parse('2026-10-27T06:01:00Z'));
  assert.equal((await f.call('position', { ...auth, body: { lat: -8, lon: 113, t: '2026-10-27T06:00:59Z' } })).status, 200);
  assert.equal((await f.call('end', { method: 'DELETE', ...auth })).status, 403);
});

test('resumed sessions expose the authenticated role without granting viewers management permission',async t=>{
 const f=await fixture(t),session=await f.create();
 for(const [role,token]of [['admin',session.adminToken],['viewer',session.viewerToken],['publisher',session.publisherToken]]){
  const result=await f.call('state',{method:'GET',sessionId:session.sessionId,token});
  assert.equal(result.body.session.role,role);
 }
 assert.equal((await f.call('end',{method:'DELETE',sessionId:session.sessionId,token:session.viewerToken})).status,403);
});
