/** Read-only bridge -> private operations telemetry relay. No flight commands. */
import { pathToFileURL } from 'node:url';
import { FireTrackerClient, OperationsClient } from '../fire-tracker.mjs';

export async function relayBridgeToOperations({ bridgeUrl, bridgeToken, operationsUrl, sessionId, publisherToken, requestTimeoutMs = 15000, onError = () => {} }) {
  if (!bridgeToken || !publisherToken || !sessionId) throw new TypeError('bridge read token, operations publisher token and sessionId are required');
  const operations = new OperationsClient({ url: operationsUrl, sessionId, token: publisherToken, requestTimeoutMs });
  const controller = new AbortController();
  const bridge = new FireTrackerClient({ url: bridgeUrl, token: bridgeToken, onError });
  // Keep the latest pending observation per unit, bounded independently of network speed.
  const pending = new Map();
  let closed = false, worker = null;
  async function drain() {
    while (!closed && pending.size) {
      const [id, observation] = pending.entries().next().value;
      pending.delete(id);
      try { await operations.publishUnit({ ...observation, kind: 'drone' }, { signal: controller.signal }); }
      catch (error) { if (!closed) onError(error); }
    }
  }
  const unsubscribe = bridge.subscribe(observation => {
    if (closed) return;
    pending.delete(observation.id);
    pending.set(observation.id, observation);
    while (pending.size > 100) pending.delete(pending.keys().next().value);
    if (!worker) worker = drain().finally(() => { worker = null; });
  });
  try { await bridge.connect(); }
  catch (error) { unsubscribe(); bridge.close(); throw error; }
  return {
    async close() { closed = true; controller.abort(); pending.clear(); unsubscribe(); bridge.close(); await worker; },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const relay = await relayBridgeToOperations({
      bridgeUrl: process.env.FIRE_TRACKER_URL || 'http://127.0.0.1:8787',
      bridgeToken: process.env.FIRE_TRACKER_READ_TOKEN,
      operationsUrl: process.env.OPERATIONS_URL,
      sessionId: process.env.OPERATIONS_SESSION_ID,
      publisherToken: process.env.OPERATIONS_PUBLISHER_TOKEN,
      onError: error => console.error('Telemetry relay:', error.message),
    });
    console.log('Telemetry relay connected. Synthetic observations retain their simulated flag.');
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await relay.close(); process.exit(0); });
  } catch (error) { console.error('Telemetry relay failed:', error.message); process.exitCode = 1; }
}
