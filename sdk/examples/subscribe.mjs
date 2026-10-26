import { FireTrackerClient } from '../fire-tracker.mjs';

const client = new FireTrackerClient({
  url: process.env.FIRE_TRACKER_URL || 'http://127.0.0.1:8787',
  token: process.env.FIRE_TRACKER_READ_TOKEN || process.env.FIRE_TRACKER_TOKEN || '',
  onError: error => console.error(error.message),
});
client.subscribe(drone => console.log(JSON.stringify(drone)));
await client.connect();
process.on('SIGINT', () => { client.close(); process.exit(0); });
