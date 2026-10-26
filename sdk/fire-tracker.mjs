/** Fire Tracker telemetry SDK. Zero dependencies. Node 22+ and modern browsers. */
const UTC = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|\+00:00)$/;

function number(value, name, min = -Infinity, max = Infinity, required = false) {
  if (value == null && !required) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${name} must be a finite JSON number`);
  if (value < min || value > max) throw new RangeError(`${name} is out of range`);
  return value;
}
function field(data, name, alias) {
  return Object.hasOwn(data, name) ? data[name] : data[alias];
}
function string(value, name, length) {
  if (value == null) return '';
  if (typeof value !== 'string') throw new TypeError(`${name} must be a string`);
  return value.slice(0, length);
}
function utcTime(value) {
  if (value == null) return new Date().toISOString();
  const match = typeof value === 'string' ? UTC.exec(value) : null;
  if (!match) throw new TypeError('t must be an ISO 8601 UTC timestamp ending in Z or +00:00');
  const canonical = `${match[1]}.${(match[2] || '').padEnd(3, '0').slice(0, 3)}Z`;
  const parsed = new Date(canonical);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== canonical) throw new TypeError('t must be a valid UTC date and time');
  if (parsed.getTime() > Date.now() + 10000) throw new RangeError("t cannot be more than 10 seconds in the future");
  return canonical;
}

/** Validate normalized JSON; zero stays zero and absent measurements stay null. */
export function normalizeTelemetry(data, { source = 'http' } = {}) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new TypeError('telemetry must be a JSON object');
  const armed = data.armed ?? null;
  if (armed !== null && typeof armed !== 'boolean') throw new TypeError('armed must be boolean or null');
  const simulated = Object.hasOwn(data, 'simulated') ? data.simulated : false;
  if (typeof simulated !== 'boolean') throw new TypeError('simulated must be boolean');
  const link = string(data.link || source, 'link', 24);
  return {
    type: 'telemetry', id: string(data.id || data.callsign || 'drone', 'id', 40),
    lat: number(data.lat, 'lat', -90, 90, true), lon: number(field(data, 'lon', 'lng'), 'lon', -180, 180, true),
    alt: number(field(data, 'alt', 'alt_rel'), 'alt'), alt_msl: number(data.alt_msl, 'alt_msl'),
    hdg: number(field(data, 'hdg', 'heading'), 'hdg', 0, 360), spd: number(field(data, 'spd', 'speed'), 'spd', 0),
    bat: number(field(data, 'bat', 'battery'), 'bat', 0, 100), mode: string(data.mode, 'mode', 24), armed,
    model: string(data.model, 'model', 40), link, t: utcTime(data.t), simulated: simulated || link.toLowerCase() === 'sim',
  };
}

/** Convert common DJI Cloud API OSD fields after a model-specific gateway receives them.
 * Height is left null unless the caller explicitly supplies its verified datum.
 */
export function fromDjiOsd(packet, options = {}) {
  if (!packet || typeof packet !== 'object') throw new TypeError('DJI OSD must be an object');
  const data = packet.data ?? packet;
  const reference = options.heightReference;
  if (reference != null && !['relative-home', 'msl'].includes(reference)) {
    throw new TypeError('heightReference must be relative-home or msl; omit it when the datum is unknown');
  }
  const heading = number(data.attitude_head, 'attitude_head');
  let sourceTime = options.t ?? packet.t;
  if (sourceTime == null && packet.timestamp != null) {
    number(packet.timestamp, 'timestamp');
    sourceTime = new Date(packet.timestamp).toISOString();
  }
  const height = reference ? number(data[options.heightField ?? 'height'], 'height') : null;
  return normalizeTelemetry({
    id: options.id ?? 'dji', lat: data.latitude, lon: data.longitude,
    alt: reference === 'relative-home' ? height : null, alt_msl: reference === 'msl' ? height : null,
    hdg: heading == null ? null : ((heading % 360) + 360) % 360,
    spd: data.horizontal_speed, bat: data.battery?.capacity_percent,
    armed: data.armed ?? null, mode: options.mode ?? '', model: options.model ?? '', link: 'dji',
    t: sourceTime, simulated: options.simulated ?? false,
  });
}

/** Publish via HTTP and subscribe to the bridge's authenticated WebSocket stream.
 * Subscriptions receive each normalized telemetry object, plus its source envelope.
 * Reconnection is explicit: call connect() again after onError/close, preserving token choice.
 */
export class FireTrackerClient {
  constructor({ url = 'http://127.0.0.1:8787', token = '', maxVehicles = 200,
                heartbeatMs = 20000, connectTimeoutMs = 10000, onError = () => {},
                fetch: fetchImpl = globalThis.fetch, WebSocket: WebSocketImpl = globalThis.WebSocket } = {}) {
    const endpoint = new URL(url);
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(endpoint.protocol)) throw new TypeError('url must use HTTP(S) or WS(S)');
    if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new TypeError('url must not contain credentials, query or fragment');
    if (typeof token !== 'string') throw new TypeError('token must be a string');
    if (!Number.isInteger(maxVehicles) || maxVehicles < 1) throw new RangeError('maxVehicles must be positive');
    if (typeof fetchImpl !== 'function') throw new TypeError('fetch is unavailable in this runtime');
    endpoint.protocol = ['https:', 'wss:'].includes(endpoint.protocol) ? 'https:' : 'http:';
    endpoint.pathname = endpoint.pathname.replace(/\/ws\/?$/, '').replace(/\/$/, '');
    this.url = endpoint.href.replace(/\/$/, '');
    this.token = token;
    this.maxVehicles = maxVehicles;
    this.heartbeatMs = heartbeatMs;
    this.connectTimeoutMs = connectTimeoutMs;
    this.onError = onError;
    this.fetch = fetchImpl;
    this.WebSocket = WebSocketImpl;
    this._latest = new Map();
    this._listeners = new Set();
    this._socket = null;
    this._connecting = null;
    this._ready = false;
    this._heartbeat = null;
  }

  get connected() { return this._ready && this._socket?.readyState === 1; }
  get drones() { return [...this._latest.values()]; }

  subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('listener must be a function');
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  /** Also accepts /state JSON snapshots fetched by your own application. */
  acceptEnvelope(envelope) {
    if (!envelope || typeof envelope !== 'object') throw new TypeError('invalid bridge envelope');
    if (envelope.type === 'error') throw new Error(envelope.error || 'bridge error');
    const values = envelope.type === 'telemetry' ? [envelope] : Array.isArray(envelope.drones) ? envelope.drones : [];
    for (const item of values) {
      // Inbound packets must carry observation time. Never turn cached coordinates into fresh GPS.
      if (item?.t == null) throw new TypeError('incoming telemetry requires t');
      const telemetry = normalizeTelemetry(item, { source: 'ws' });
      const previous = this._latest.get(telemetry.id);
      if (previous && previous.t > telemetry.t) continue;
      this._latest.delete(telemetry.id);
      this._latest.set(telemetry.id, telemetry);
      while (this._latest.size > this.maxVehicles) this._latest.delete(this._latest.keys().next().value);
      for (const listener of this._listeners) listener(telemetry, envelope);
    }
  }

  async publishTelemetry(data) {
    const telemetry = normalizeTelemetry(data);
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const response = await this.fetch(`${this.url}/telemetry`, { method: 'POST', headers, body: JSON.stringify(telemetry) });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(`Bridge HTTP ${response.status}: ${result.error || 'publish failed'}`);
    return result;
  }

  connect() {
    if (this.connected) return Promise.resolve(this);
    if (this._connecting) return this._connecting;
    if (typeof this.WebSocket !== 'function') return Promise.reject(new TypeError('WebSocket is unavailable; use Node 22+ or a modern browser'));
    const endpoint = new URL(`${this.url}/ws`);
    endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new this.WebSocket(endpoint.href);
    this._socket = socket;
    this._connecting = new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this._connecting = null;
        error ? reject(error) : resolve(this);
      };
      const timer = setTimeout(() => { finish(new Error('bridge connection timed out')); socket.close(); }, this.connectTimeoutMs);
      socket.addEventListener('open', () => {
        // Browser WS cannot set Authorization headers. Token is never placed in a URL.
        if (this.token) socket.send(JSON.stringify({ type: 'auth', token: this.token }));
      });
      socket.addEventListener('message', event => {
        try {
          const envelope = JSON.parse(event.data);
          this.acceptEnvelope(envelope);
          if (!this._ready && (envelope.type === 'hello' || envelope.type === 'state')) {
            this._ready = true;
            if (this.heartbeatMs > 0) {
              this._heartbeat = setInterval(() => { if (this.connected) socket.send(JSON.stringify({ type: 'ping' })); }, this.heartbeatMs);
              this._heartbeat.unref?.();
            }
            finish();
          }
        } catch (error) { this.onError(error); }
      });
      socket.addEventListener('error', () => {
        const error = new Error('bridge WebSocket connection failed');
        finish(error);
        this.onError(error);
      });
      socket.addEventListener('close', () => {
        this._ready = false;
        clearInterval(this._heartbeat);
        this._heartbeat = null;
        finish(new Error('bridge connection closed (check URL and authentication)'));
      });
    });
    return this._connecting;
  }

  close() {
    clearInterval(this._heartbeat);
    this._heartbeat = null;
    this._ready = false;
    this._socket?.close();
    this._socket = null;
  }
}
