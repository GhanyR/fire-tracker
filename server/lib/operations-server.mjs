/** Private operations HTTP API. No GPS access, media requests, or request-time DDL. */
const SESSION_MS = 6 * 60 * 60 * 1000;
const LOCATION_MS = 15 * 60 * 1000;
const BODY_BYTES = 16_384;
const MAX_UNITS = 100;
const MAX_SESSIONS = 200;
const TRUSTED_ORIGINS = new Set(['https://fire-tracker.fiveprayerapp.chatgpt.site', 'https://ghanyr.github.io']);
const METHODS = { create: 'POST', join: 'POST', state: 'GET', unit: 'POST', position: 'POST', device: 'DELETE', end: 'DELETE' };
const UNIT_KEYS = ['id', 'kind', 'name', 'mission', 'status', 'lat', 'lon', 't', 'accuracy', 'alt', 'alt_msl', 'hdg', 'spd', 'bat', 'model', 'mode', 'armed', 'simulated', 'streams', 'airframe', 'flightStatus', 'linkQuality'];

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function fail(status, message) { throw new ApiError(status, message); }
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function keys(value, allowed) {
  if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) fail(400, 'Invalid request fields.');
}
function text(value, max, { required = false } = {}) {
  if (value === undefined || value === null) { if (required) fail(400, 'Required text is missing.'); return ''; }
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) fail(400, 'Invalid text.');
  const result = value.trim();
  if (required && !result) fail(400, 'Required text is missing.');
  return result;
}
function id(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/.test(value)) fail(400, 'Invalid unit identifier.');
  return value;
}
function metric(value, min, max, required = false) {
  if (value === undefined || value === null) { if (required) fail(400, 'Coordinates are required.'); return null; }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(400, 'Metric is outside its allowed range.');
  return value;
}
function enumeration(value, choices, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (!choices.includes(value)) fail(400, 'Unsupported enum value.');
  return value;
}
function observation(value, now) {
  const match = typeof value === 'string' && /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(?:Z|\+00:00)$/.exec(value);
  if (!match) fail(400, 'A source UTC observation time is required.');
  const fraction = (match[2] || '').padEnd(6, '0');
  const canonical = `${match[1]}.${fraction.slice(0, 3)}Z`;
  const ms = Date.parse(canonical);
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== canonical) fail(400, 'Invalid UTC observation time.');
  const microseconds = ms * 1000 + Number(fraction.slice(3));
  if (microseconds > now * 1000) fail(400, 'Future observations are not accepted.');
  if (microseconds <= (now - LOCATION_MS) * 1000) fail(400, 'Observation is older than fifteen minutes.');
  return { ms, key: `${match[1]}.${fraction}Z` };
}
function streams(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 4) fail(400, 'At most four camera streams are allowed.');
  const seen = new Set();
  return value.map(stream => {
    keys(stream, ['id', 'label', 'kind', 'protocol', 'url']);
    const streamId = text(stream.id, 40, { required: true });
    if (seen.has(streamId)) fail(400, 'Stream identifiers must be unique.');
    seen.add(streamId);
    const urlText = text(stream.url, 2048, { required: true });
    let url, path;
    try { url = new URL(urlText); path = decodeURIComponent(url.pathname); } catch { fail(400, 'Invalid stream URL.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash ||
      /(?:^|\/)(?:commands?|arm|disarm|takeoff|land|reboot|control)(?:\/|$)/i.test(path) ||
      [...url.searchParams.keys()].some(key => /^(?:cmd|command|action|control)$/i.test(key) || /token|secret|key|auth|password/i.test(key))) fail(400, 'Use a media URL without credentials or command paths.');
    const kind = enumeration(stream.kind, ['eo', 'ir']), protocol = enumeration(stream.protocol, ['hls', 'mjpeg', 'whep', 'mp4']);
    if (!kind || !protocol) fail(400, 'Stream kind and protocol are required.');
    return { id: streamId, label: text(stream.label, 80), kind, protocol, url: urlText };
  });
}
function validateUnit(value, now) {
  keys(value, UNIT_KEYS);
  const observed = observation(value.t, now);
  if (value.armed !== undefined && value.armed !== null && typeof value.armed !== 'boolean') fail(400, 'Invalid armed state.');
  if (value.simulated !== undefined && typeof value.simulated !== 'boolean') fail(400, 'Invalid simulated state.');
  const unit = {
    id: id(value.id), kind: enumeration(value.kind, ['drone', 'team', 'vehicle'], 'drone'), name: text(value.name, 80),
    mission: text(value.mission, 160), status: text(value.status, 40), lat: metric(value.lat, -90, 90, true), lon: metric(value.lon, -180, 180, true),
    t: value.t, accuracy: metric(value.accuracy, 0, 100_000), alt: metric(value.alt, -1000, 25_000), alt_msl: metric(value.alt_msl, -1000, 30_000),
    hdg: metric(value.hdg, 0, 360), spd: metric(value.spd, 0, 500), bat: metric(value.bat, 0, 100), model: text(value.model, 80),
    mode: text(value.mode, 40), armed: value.armed ?? null, simulated: value.simulated === true, streams: streams(value.streams),
    airframe: enumeration(value.airframe, ['multirotor', 'fixed-wing', 'unknown'], 'unknown'),
    flightStatus: enumeration(value.flightStatus, ['airborne', 'landed', 'unknown'], 'unknown'), linkQuality: metric(value.linkQuality, 0, 100),
  };
  return { unit, observed };
}
function pendingUnit(device) {
  return { id: device.id, kind: device.kind, name: device.name, mission: '', status: 'pending', lat: null, lon: null, t: null,
    accuracy: null, alt: null, alt_msl: null, hdg: null, spd: null, bat: null, model: '', mode: '', armed: null, simulated: false,
    streams: [], airframe: 'unknown', flightStatus: 'unknown', linkQuality: null };
}
function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}
function allowedOrigin(origin, requestUrl) {
  if (!origin) return true;
  if (TRUSTED_ORIGINS.has(origin) || origin === requestUrl.origin) return true;
  try {
    const url = new URL(origin);
    return origin === url.origin && ['http:', 'https:'].includes(url.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch { return false; }
}
async function body(request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) fail(415, 'Send application/json.');
  if (Number(request.headers.get('content-length')) > BODY_BYTES) fail(413, 'Request body is too large.');
  const reader = request.body?.getReader();
  if (!reader) fail(400, 'JSON body is required.');
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > BODY_BYTES) { await reader.cancel(); fail(413, 'Request body is too large.'); }
      chunks.push(result.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let result;
  try { result = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { fail(400, 'Invalid JSON.'); }
  if (!object(result)) fail(400, 'A JSON object is required.');
  return result;
}
function statement(db, sql, ...values) { return db.prepare(sql).bind(...values); }
async function cleanup(db, now) {
  await db.batch([
    statement(db, 'DELETE FROM operations_sessions WHERE expires_at <= ?', now),
    statement(db, 'DELETE FROM operations_rate_limits WHERE expires_at <= ?', now),
    statement(db, `UPDATE operations_units SET payload_json = json_set(payload_json,
      '$.lat', NULL, '$.lon', NULL, '$.accuracy', NULL, '$.alt', NULL, '$.alt_msl', NULL, '$.hdg', NULL, '$.spd', NULL, '$.status', 'stale')
      WHERE observed_at <= ? AND json_extract(payload_json, '$.lat') IS NOT NULL`, now - LOCATION_MS),
  ]);
}
async function rate(db, key, now, period, maximum) {
  const bucket = Math.floor(now / period);
  const result = await statement(db, `INSERT INTO operations_rate_limits (key, expires_at, count)
    SELECT ?, ?, 1 WHERE (SELECT count(*) FROM operations_rate_limits) < 4096
    ON CONFLICT(key) DO UPDATE SET count = count + 1 WHERE count < ? RETURNING count`,
  `${key}:${bucket}`, (bucket + 1) * period, maximum).first();
  if (!result) fail(429, 'Rate limit reached. Try again later.');
}
async function authenticate(request, db, now) {
  const sessionId = request.headers.get('X-Operation-Id');
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(request.headers.get('Authorization') || '');
  if (!sessionId || sessionId.length > 80 || !match) fail(401, 'Unauthorized or expired session.');
  const session = await statement(db, 'SELECT * FROM operations_sessions WHERE id = ? AND expires_at > ?', sessionId, now).first();
  if (!session) fail(401, 'Unauthorized or expired session.');
  const hash = await digest(match[1]);
  for (const [scope, column] of [['admin', 'admin_hash'], ['viewer', 'viewer_hash'], ['publisher', 'publisher_hash'], ['invite', 'invite_hash']]) {
    if (hash === session[column]) return { session, scope, hash };
  }
  const device = await statement(db, 'SELECT * FROM operations_devices WHERE session_id = ? AND token_hash = ?', sessionId, hash).first();
  if (device) return { session, scope: 'device', hash, device };
  fail(401, 'Unauthorized or expired session.');
}
function permit(auth, scopes) { if (!scopes.includes(auth.scope)) fail(403, 'Capability does not allow this action.'); }

/** D1-compatible database + optional clock injection keeps the HTTP core portable. */
export async function handleOperations(request, db, { now: readNow = Date.now } = {}) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  const trusted = allowedOrigin(origin, url);
  const headers = new Headers({ 'Cache-Control': 'no-store', Vary: 'Origin', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
  if (origin && trusted) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Operation-Id');
  }
  const respond = (value, status = 200) => Response.json({ ok: true, ...value }, { status, headers });
  try {
    if (!trusted) fail(403, 'Origin is not allowed.');
    const action = url.pathname.split('/').filter(Boolean).at(-1);
    if (!Object.hasOwn(METHODS, action)) fail(404, 'Unknown operations action.');
    if (url.search) fail(400, 'Use request headers and JSON; query parameters are not accepted.');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== METHODS[action]) { headers.set('Allow', `${METHODS[action]}, OPTIONS`); fail(405, 'Method is not allowed.'); }
    if (!db?.prepare || !db?.batch) fail(503, 'Operations storage is not configured.');
    const now = readNow();
    await cleanup(db, now);
    if (action === 'create') {
      const value = await body(request);
      keys(value, ['label']);
      const label = text(value.label, 80, { required: true });
      const ipHash = await digest(request.headers.get('CF-Connecting-IP') || 'unknown-client');
      await rate(db, 'global-create', now, 60_000, 20);
      await rate(db, `create:${ipHash}`, now, 3_600_000, 3);
      const sessionId = crypto.randomUUID(), expiresAt = now + SESSION_MS;
      const [adminToken, viewerToken, publisherToken, inviteToken] = Array.from({ length: 4 }, randomToken);
      const hashes = await Promise.all([adminToken, viewerToken, publisherToken, inviteToken].map(digest));
      const result = await statement(db, `INSERT INTO operations_sessions (id, label, created_at, expires_at, admin_hash, viewer_hash, publisher_hash, invite_hash)
        SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE (SELECT count(*) FROM operations_sessions) < ?`, sessionId, label, now, expiresAt, ...hashes, MAX_SESSIONS).run();
      if (!result.meta.changes) fail(429, 'Operations capacity reached. Try again later.');
      return respond({ sessionId, label, expiresAt: new Date(expiresAt).toISOString(), adminToken, viewerToken, publisherToken, inviteToken }, 201);
    }
    if (action === 'join') {
      const value = await body(request);
      keys(value, ['sessionId', 'inviteToken', 'name', 'kind']);
      const name = text(value.name, 80, { required: true });
      const kind = enumeration(value.kind, ['team', 'vehicle']);
      if (!kind || typeof value.sessionId !== 'string' || value.sessionId.length > 80 || !/^[A-Za-z0-9_-]{43}$/.test(value.inviteToken || '')) fail(400, 'Invalid invitation.');
      const session = await statement(db, 'SELECT id, expires_at FROM operations_sessions WHERE id = ? AND invite_hash = ? AND expires_at > ?', value.sessionId, await digest(value.inviteToken), now).first();
      if (!session) fail(401, 'Unauthorized or expired session.');
      const ipHash = await digest(request.headers.get('CF-Connecting-IP') || 'unknown-client');
      await rate(db, `join:${session.id}:${ipHash}`, now, 60_000, 20);
      const deviceId = crypto.randomUUID(), deviceToken = randomToken();
      const unit = pendingUnit({ id: deviceId, kind, name });
      const result = await db.batch([
        statement(db, `INSERT INTO operations_devices (id, session_id, token_hash, name, kind, created_at)
          SELECT ?, ?, ?, ?, ?, ? WHERE (SELECT count(*) FROM operations_units WHERE session_id = ?) < ?`, deviceId, session.id, await digest(deviceToken), name, kind, now, session.id, MAX_UNITS),
        statement(db, `INSERT INTO operations_units (session_id, id, owner_device_id, payload_json)
          SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM operations_devices WHERE id = ? AND session_id = ?)`, session.id, deviceId, deviceId, JSON.stringify(unit), deviceId, session.id),
      ]);
      if (!result[0].meta.changes) fail(409, 'Session already has one hundred units.');
      return respond({ sessionId: session.id, deviceId, deviceToken, expiresAt: new Date(session.expires_at).toISOString() }, 201);
    }
    const auth = await authenticate(request, db, now);
    const sessionId = auth.session.id;
    if (action === 'state') {
      permit(auth, ['admin', 'viewer', 'publisher']);
      await rate(db, `read:${sessionId}:${auth.scope}`, now, 60_000, 240);
      const result = await statement(db, 'SELECT payload_json FROM operations_units WHERE session_id = ? ORDER BY id LIMIT ?', sessionId, MAX_UNITS).all();
      return respond({ session: { id: sessionId, role: auth.scope, label: auth.session.label, expiresAt: new Date(auth.session.expires_at).toISOString() }, units: result.results.map(row => JSON.parse(row.payload_json)) });
    }
    if (action === 'unit') {
      permit(auth, ['admin', 'publisher']);
      await rate(db, `publish:${sessionId}:${auth.scope}`, now, 60_000, 1200);
      const value = await body(request);
      keys(value, ['unit']);
      const { unit, observed } = validateUnit(value.unit, now);
      const existing = await statement(db, 'SELECT owner_device_id, observation_key FROM operations_units WHERE session_id = ? AND id = ?', sessionId, unit.id).first();
      if (existing?.owner_device_id) fail(403, 'A publisher cannot modify a participant device.');
      if (existing?.observation_key && observed.key <= existing.observation_key) fail(409, 'Observation must be newer than the stored observation.');
      const result = await statement(db, `INSERT INTO operations_units (session_id, id, payload_json, observed_at, observation_key)
        SELECT ?, ?, ?, ?, ? WHERE (SELECT count(*) FROM operations_units WHERE session_id = ?) < ? OR EXISTS (SELECT 1 FROM operations_units WHERE session_id = ? AND id = ?)
        ON CONFLICT(session_id, id) DO UPDATE SET payload_json = excluded.payload_json, observed_at = excluded.observed_at, observation_key = excluded.observation_key
        WHERE operations_units.owner_device_id IS NULL AND (operations_units.observation_key IS NULL OR excluded.observation_key > operations_units.observation_key)`,
      sessionId, unit.id, JSON.stringify(unit), observed.ms, observed.key, sessionId, MAX_UNITS, sessionId, unit.id).run();
      if (!result.meta.changes) fail(409, 'Session capacity reached or observation is no longer newer.');
      return respond({ unit });
    }
    if (action === 'position') {
      permit(auth, ['device']);
      await rate(db, `position:${sessionId}:${auth.device.id}`, now, 60_000, 120);
      const value = await body(request);
      keys(value, ['lat', 'lon', 't', 'accuracy', 'status']);
      const observed = observation(value.t, now);
      const unit = { ...pendingUnit(auth.device), lat: metric(value.lat, -90, 90, true), lon: metric(value.lon, -180, 180, true),
        t: value.t, accuracy: metric(value.accuracy, 0, 100_000), status: text(value.status, 40) };
      const result = await statement(db, `UPDATE operations_units SET payload_json = ?, observed_at = ?, observation_key = ?
        WHERE session_id = ? AND id = ? AND owner_device_id = ? AND (observation_key IS NULL OR observation_key < ?)`,
      JSON.stringify(unit), observed.ms, observed.key, sessionId, auth.device.id, auth.device.id, observed.key).run();
      if (!result.meta.changes) fail(409, 'Observation must be newer than the stored observation.');
      return respond({ unit });
    }
    if (action === 'device') {
      permit(auth, ['device']);
      // Device identity comes solely from its hashed capability, never payload/query.
      await statement(db, 'DELETE FROM operations_devices WHERE id = ? AND session_id = ?', auth.device.id, sessionId).run();
      return respond({});
    }
    permit(auth, ['admin']);
    await statement(db, 'DELETE FROM operations_sessions WHERE id = ?', sessionId).run();
    return respond({});
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 503;
    if (status === 429) headers.set('Retry-After', '60');
    return Response.json({ ok: false, error: error instanceof ApiError ? error.message : 'Operations storage is temporarily unavailable.' }, { status, headers });
  }
}
