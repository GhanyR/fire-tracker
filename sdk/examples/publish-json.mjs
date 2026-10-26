/** Pipe newline-delimited normalized JSON from your telemetry adapter into this process. */
import { createInterface } from 'node:readline';
import { FireTrackerClient } from '../fire-tracker.mjs';

const client = new FireTrackerClient({
  url: process.env.FIRE_TRACKER_URL || 'http://127.0.0.1:8787',
  token: process.env.FIRE_TRACKER_TOKEN || '',
});
for await (const line of createInterface({ input: process.stdin })) {
  if (!line.trim()) continue;
  try {
    const result = await client.publishTelemetry(JSON.parse(line));
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
client.close();
