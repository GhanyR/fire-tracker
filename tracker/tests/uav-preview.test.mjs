import test from 'node:test';
import assert from 'node:assert/strict';
import * as preview from '../lib/uav-preview.mjs';
const anchor = Date.parse('2026-10-26T08:00:00Z');
const center = [112.955, -8.015];
const radians = value => value * Math.PI / 180;
const degrees = value => value * 180 / Math.PI;
const distance = (a, b) => {
  const dLat = radians(b[1] - a[1]);
  const dLon = radians(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a[1])) * Math.cos(radians(b[1])) * Math.sin(dLon / 2) ** 2;
  return 6371008.8 * 2 * Math.asin(Math.sqrt(h));
};
const bearing = (a, b) => {
  const lat1 = radians(a[1]), lat2 = radians(b[1]), dLon = radians(b[0] - a[0]);
  return (degrees(Math.atan2(Math.sin(dLon) * Math.cos(lat2), Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon))) + 360) % 360;
};
const angleDifference = (a, b) => Math.abs((a - b + 540) % 360 - 180);
const insideRing = (point, ring) => {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const a = ring[current], b = ring[previous];
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
};
const finiteCoordinate = point => Array.isArray(point) && point.length === 2 && point.every(value => typeof value === 'number' && Number.isFinite(value));
const fleetAt = elapsed => {
  assert.equal(typeof preview.previewFleet, 'function', 'previewFleet must provide the preview geometry');
  return preview.previewFleet(elapsed, center, anchor);
};

test('two deterministic simulated vehicles move at the declared speed on bounded opposite orbits', () => {
  const first = fleetAt(0), next = fleetAt(1000);
  assert.equal(first.length, 2);
  assert.deepEqual(first.map(vehicle => vehicle.id), ['PREVIEW-01', 'PREVIEW-02']);
  assert.deepEqual(fleetAt(1000), next);
  assert.ok(angleDifference(bearing(center, [first[0].lon, first[0].lat]), bearing(center, [first[1].lon, first[1].lat])) > 179);
  for (const [index, vehicle] of first.entries()) {
    const position = [vehicle.lon, vehicle.lat], moved = [next[index].lon, next[index].lat];
    assert.ok(finiteCoordinate(position));
    assert.ok(vehicle.preview && vehicle.simulated);
    assert.equal(vehicle.link, 'sim');
    assert.equal(vehicle.alt_msl, null);
    assert.ok(vehicle.model.length > 0);
    assert.ok(vehicle.alt > 0 && vehicle.bat >= 0 && vehicle.bat <= 100);
    assert.equal(vehicle.spd, [20, 25][index]);
    assert.ok(Math.abs(distance(center, position) - [350, 550][index]) < 1);
    assert.ok(Math.abs(distance(position, moved) - vehicle.spd) < 0.05);
    assert.ok(angleDifference(vehicle.hdg, bearing(position, moved)) < 2);
    assert.equal(next[index].time, anchor + 1000);
    assert.equal(next[index].t, '2026-10-26T08:00:01.000Z');
  }
  for (const vehicle of fleetAt(365 * 86400000)) {
    assert.ok(finiteCoordinate([vehicle.lon, vehicle.lat]));
    assert.ok(distance(center, [vehicle.lon, vehicle.lat]) < 551);
  }
});

test('illustrative sensor sectors stay closed and forward with the target inside the viewing arc', () => {
  for (const elapsed of [0, 2000, 4000, 6000, 10000, 19000]) {
    for (const vehicle of fleetAt(elapsed)) {
      const origin = [vehicle.lon, vehicle.lat];
      const { target, bearing: viewBearing, footprint } = vehicle.sensor;
      assert.ok(finiteCoordinate(target));
      assert.ok(Math.abs(distance(origin, target) - 600) < 1);
      assert.ok(angleDifference(vehicle.hdg, viewBearing) <= 20.001);
      assert.ok(angleDifference(bearing(origin, target), viewBearing) < 0.001);
      assert.deepEqual(footprint[0], origin);
      assert.deepEqual(footprint.at(-1), origin);
      assert.ok(footprint.length >= 5 && footprint.length <= 64);
      assert.ok(insideRing(target, footprint));
      const arc = footprint.slice(1, -1);
      assert.ok(angleDifference(bearing(origin, arc[0]), viewBearing) > 24.9);
      assert.ok(angleDifference(bearing(origin, arc.at(-1)), viewBearing) > 24.9);
      for (const point of arc) {
        assert.ok(finiteCoordinate(point));
        assert.ok(angleDifference(bearing(origin, point), viewBearing) <= 25.001);
        assert.ok(distance(origin, point) > distance(origin, target));
      }
    }
  }
  const positive = fleetAt(3000)[0], negative = fleetAt(9000)[0];
  assert.ok(angleDifference(positive.sensor.bearing, positive.hdg) > 19.99);
  assert.ok(angleDifference(negative.sensor.bearing, negative.hdg) > 19.99);
  assert.ok((positive.sensor.bearing - positive.hdg + 540) % 360 - 180 > 19.99);
  assert.ok((negative.sensor.bearing - negative.hdg + 540) % 360 - 180 < -19.99);
});

test('preview trails cover only the prior ten seconds with bounded samples and no future timestamps', () => {
  for (const elapsed of [0, 100, 1250, 10000, 20000, 365 * 86400000, Number.MAX_VALUE]) {
    const fleet = fleetAt(elapsed);
    for (const vehicle of fleet) {
      assert.ok(vehicle.trail.length > 0 && vehicle.trail.length <= 50);
      assert.deepEqual(vehicle.trail.at(-1), [vehicle.lon, vehicle.lat, vehicle.time]);
      for (const [index, point] of vehicle.trail.entries()) {
        assert.ok(finiteCoordinate(point.slice(0, 2)));
        assert.ok(Number.isFinite(point[2]));
        assert.ok(point[2] >= vehicle.time - 10000 && point[2] <= vehicle.time);
        if (index) assert.ok(point[2] > vehicle.trail[index - 1][2]);
      }
      assert.ok(Number.isFinite(Date.parse(vehicle.t)));
    }
  }
});

test('invalid clocks clamp safely and invalid centers cannot produce NaN or leave the fixed Bromo fallback', () => {
  const initial = fleetAt(0);
  for (const elapsed of [-1000, NaN, Infinity, -Infinity, undefined, null, '1000']) assert.deepEqual(fleetAt(elapsed), initial);
  for (const invalid of [null, {}, [], [112.955], ['112.955', -8.015], [112.955, null], [NaN, -8.015], [Infinity, -8.015], [0, 0], [181, -8], [112, 91]]) {
    assert.deepEqual(preview.previewFleet(5000, invalid, anchor), fleetAt(5000));
  }
  const otherCenter = [106.827, -6.175];
  const relocated = preview.previewFleet(5000, otherCenter, anchor);
  assert.ok(distance(otherCenter, [relocated[0].lon, relocated[0].lat]) < 351);
  for (const invalidAnchor of [NaN, Infinity, null, '2026-10-26']) {
    for (const vehicle of preview.previewFleet(1000, center, invalidAnchor)) {
      assert.ok(Number.isFinite(vehicle.time));
      assert.equal(vehicle.t, new Date(vehicle.time).toISOString());
    }
  }
});

test('coverage contains explicit preview polygons only and ignores real vehicles and malformed sensors', () => {
  assert.equal(typeof preview.coverageFeatures, 'function');
  const fleet = fleetAt(2000);
  const coverage = preview.coverageFeatures(fleet);
  assert.equal(coverage.type, 'FeatureCollection');
  assert.equal(coverage.features.length, 2);
  assert.deepEqual(coverage.features.map(feature => feature.properties.id), ['PREVIEW-01', 'PREVIEW-02']);
  for (const [index, feature] of coverage.features.entries()) {
    assert.equal(feature.type, 'Feature');
    assert.equal(feature.geometry.type, 'Polygon');
    assert.deepEqual(feature.geometry.coordinates, [fleet[index].sensor.footprint]);
  }
  const vehicle = fleet[0];
  const invalidSensors = [null, {}, { ...vehicle.sensor, bearing: NaN }, { ...vehicle.sensor, target: ['112', -8] }, { ...vehicle.sensor, footprint: vehicle.sensor.footprint.slice(0, -1) }, { ...vehicle.sensor, footprint: [[0, 0], [0, 0], [0, 0], [0, 0]] }, { ...vehicle.sensor, footprint: [[NaN, -8], ...vehicle.sensor.footprint.slice(1)] }];
  const realVehicles = [{ ...vehicle, preview: false }, { ...vehicle, simulated: false }, { ...vehicle, preview: undefined, sensor: undefined }];
  for (const invalid of [undefined, null, {}, [], realVehicles, invalidSensors.map(sensor => ({ ...vehicle, sensor }))]) assert.deepEqual(preview.coverageFeatures(invalid), { type: 'FeatureCollection', features: [] });
  coverage.features[0].geometry.coordinates[0][0][0] = 0;
  assert.equal(fleet[0].sensor.footprint[0][0], vehicle.lon);
});

test('four caption chapters follow the twenty second playback clock and clamp at both ends', () => {
  assert.equal(typeof preview.previewChapter, 'function');
  const starts = [0, 5000, 10000, 15000];
  const titles = ['Medan 3D', 'Dua UAV', 'Cakupan pantau', 'Satu peta'];
  const subtitles = ['Bromo, Jawa Timur', 'Lihat posisi dan jalur', 'Area yang ditinjau terlihat', 'Waktu dan sumber tetap jelas'];
  for (const [index, elapsed] of starts.entries()) {
    const chapter = preview.previewChapter(elapsed);
    assert.equal(chapter.index, index);
    assert.equal(chapter.title, titles[index]);
    assert.equal(chapter.subtitle, subtitles[index]);
    assert.ok(chapter.kicker.length > 0);
    assert.equal(preview.previewChapter(elapsed + 4999).index, index);
  }
  for (const elapsed of [-1, NaN, Infinity, null, '5000']) assert.equal(preview.previewChapter(elapsed).index, 0);
  for (const elapsed of [20000, 60000, Number.MAX_VALUE]) assert.equal(preview.previewChapter(elapsed).index, 3);
});

test('sparse malformed sensor coordinates are rejected without throwing during coverage generation', () => {
  const vehicle = fleetAt(1000)[0];
  const sparseRing = vehicle.sensor.footprint.slice();
  delete sparseRing[0];
  assert.deepEqual(preview.coverageFeatures([{ ...vehicle, sensor: { ...vehicle.sensor, footprint: sparseRing } }]), { type: 'FeatureCollection', features: [] });
});
