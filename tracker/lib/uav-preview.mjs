const EARTH_RADIUS_M = 6371008.8;
const MAX_DATE_MS = 8640000000000000;
const BROMO = [112.955, -8.015];
const TRAIL_WINDOW_MS = 10000;
const TRAIL_STEP_MS = 250;
const radians = value => value * Math.PI / 180;
const degrees = value => value * 180 / Math.PI;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const angle = value => ((value % 360) + 360) % 360;
const elapsedClock = value => finite(value) ? Math.max(0, value) : 0;
const coordinate = point => Array.isArray(point) && point.length === 2 && point.every(finite) && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90;
const samePoint = (a, b) => a[0] === b[0] && a[1] === b[1];

function previewCenter(value) {
  // A broad Indonesian geographic envelope, with no coercion of form strings.
  return coordinate(value) && value[0] >= 94 && value[0] <= 142 && value[1] >= -12 && value[1] <= 7 ? value : BROMO;
}

function destination(origin, bearing, distanceM) {
  const lat = radians(origin[1]), lon = radians(origin[0]);
  const heading = radians(bearing), arc = distanceM / EARTH_RADIUS_M;
  const targetLat = Math.asin(Math.sin(lat) * Math.cos(arc) + Math.cos(lat) * Math.sin(arc) * Math.cos(heading));
  const targetLon = lon + Math.atan2(Math.sin(heading) * Math.sin(arc) * Math.cos(lat), Math.cos(arc) - Math.sin(lat) * Math.sin(targetLat));
  return [degrees(targetLon), degrees(targetLat)];
}

function bearingBetween(origin, target) {
  const lat = radians(origin[1]), targetLat = radians(target[1]), dLon = radians(target[0] - origin[0]);
  return angle(degrees(Math.atan2(Math.sin(dLon) * Math.cos(targetLat), Math.cos(lat) * Math.sin(targetLat) - Math.sin(lat) * Math.cos(targetLat) * Math.cos(dLon))));
}

function orbitPosition(elapsed, center, radius, speed, phase) {
  const period = 2 * Math.PI * EARTH_RADIUS_M * Math.sin(radius / EARTH_RADIUS_M) / speed * 1000;
  // Reduce time before calculating phase, so even extreme clocks stay bounded.
  return destination(center, (elapsed % period) / period * 360 + phase, radius);
}

function previewSensor(origin, heading, elapsed, phase) {
  const sweep = 20 * Math.sin((elapsed % 12000) / 12000 * 2 * Math.PI + radians(phase));
  const bearing = angle(heading + sweep);
  const footprint = [origin.slice()];
  for (let step = 0; step <= 10; step++) footprint.push(destination(origin, bearing - 25 + step * 5, 700));
  footprint.push(origin.slice());
  return { target: destination(origin, bearing, 600), bearing, footprint };
}

/** Pure illustrative geometry. An explicit anchor makes every output repeatable. */
export function previewFleet(elapsedMs, center = BROMO, anchor = Date.now()) {
  const origin = previewCenter(center);
  const anchorTime = finite(anchor) && Math.abs(anchor) <= MAX_DATE_MS ? Math.trunc(anchor) : 0;
  // Date's representable limit is the only duration cap; no history is retained.
  const elapsed = Math.min(elapsedClock(elapsedMs), Number.MAX_SAFE_INTEGER, MAX_DATE_MS - anchorTime);
  const time = Math.trunc(anchorTime + elapsed);
  return [0, 1].map(index => {
    const radius = index ? 550 : 350, spd = index ? 25 : 20, phase = index * 180;
    const position = orbitPosition(elapsed, origin, radius, spd, phase);
    const hdg = angle(bearingBetween(position, origin) - 90);
    const duration = Math.min(elapsed, TRAIL_WINDOW_MS);
    const sampleCount = Math.floor(duration / TRAIL_STEP_MS) + 1;
    const trail = Array.from({ length: sampleCount }, (_, sample) => {
      const sampleElapsed = sampleCount === 1 ? elapsed : elapsed - duration + duration * sample / (sampleCount - 1);
      const point = sample === sampleCount - 1 ? position : orbitPosition(sampleElapsed, origin, radius, spd, phase);
      return [...point, Math.trunc(anchorTime + sampleElapsed)];
    });
    return {
      id: `PREVIEW-0${index + 1}`, lat: position[1], lon: position[0], hdg,
      alt: 110 + index * 35, alt_msl: null, spd, bat: 84 - index * 12,
      time, t: new Date(time).toISOString(), simulated: true, preview: true,
      model: index ? 'Sayap tetap contoh' : 'Quadcopter contoh', link: 'sim', trail,
      sensor: previewSensor(position, hdg, elapsed, phase),
    };
  });
}

function validSensor(vehicle) {
  const sensor = vehicle?.sensor;
  if (!coordinate([vehicle?.lon, vehicle?.lat]) || !sensor || !coordinate(sensor.target) || !finite(sensor.bearing) || sensor.bearing < 0 || sensor.bearing >= 360) return false;
  const ring = sensor.footprint;
  if (!Array.isArray(ring) || ring.length < 4 || ring.length > 64 || !Array.from(ring).every(coordinate) || !samePoint(ring[0], ring.at(-1)) || !samePoint(ring[0], [vehicle.lon, vehicle.lat])) return false;
  const twiceArea = ring.slice(1).reduce((area, point, index) => area + ring[index][0] * point[1] - point[0] * ring[index][1], 0);
  return Math.abs(twiceArea) > 1e-12;
}

/** Only explicit preview sensors may illustrate coverage; telemetry is never inferred. */
export function coverageFeatures(fleet) {
  return {
    type: 'FeatureCollection',
    features: (Array.isArray(fleet) ? fleet : [])
      .filter(vehicle => vehicle?.preview === true && vehicle.simulated === true && typeof vehicle.id === 'string' && vehicle.id.length > 0 && validSensor(vehicle))
      .map(vehicle => ({
        type: 'Feature', properties: { id: vehicle.id },
        geometry: { type: 'Polygon', coordinates: [vehicle.sensor.footprint.map(point => point.slice())] },
      })),
  };
}

const CHAPTERS = [
  { title: 'Medan 3D', subtitle: 'Bromo, Jawa Timur' },
  { title: 'Dua UAV', subtitle: 'Lihat posisi dan jalur' },
  { title: 'Cakupan pantau', subtitle: 'Area yang ditinjau terlihat' },
  { title: 'Satu peta', subtitle: 'Waktu dan sumber tetap jelas' },
];

export function previewChapter(elapsedMs) {
  const index = Math.min(3, Math.floor(elapsedClock(elapsedMs) / 5000));
  return { index, kicker: 'SIMULASI UAV', ...CHAPTERS[index] };
}
