/** Gateway adapter, not a DJI hardware/MQTT connection. Pipe received OSD JSON lines here. */
import { createInterface } from 'node:readline';
import { FireTrackerClient, fromDjiOsd } from '../fire-tracker.mjs';

const client = new FireTrackerClient({
  url: process.env.FIRE_TRACKER_URL || 'http://127.0.0.1:8787',
  token: process.env.FIRE_TRACKER_TOKEN || '',
});
for await (const line of createInterface({ input: process.stdin })) {
  if (!line.trim()) continue;
  try {
    const telemetry = fromDjiOsd(JSON.parse(line), {
      id: process.env.DJI_AIRCRAFT_ID || 'dji-1',
      model: process.env.DJI_MODEL || '',
      // Omit unless you have verified what this field means for this model/API.
      heightReference: process.env.DJI_HEIGHT_REFERENCE || undefined,
      heightField: process.env.DJI_HEIGHT_FIELD || 'height',
    });
    console.log(JSON.stringify(await client.publishTelemetry(telemetry)));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
client.close();
