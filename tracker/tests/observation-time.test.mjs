import test from 'node:test';
import assert from 'node:assert/strict';
import * as time from '../lib/observation-time.mjs';
const {ageBand, temporalRange} = time;

const HOUR = 3_600_000;
const now = Date.parse('2026-10-26T12:00:00Z');

test('observation ages use acquisition time and include exact age boundaries', () => {
  const cases = [
    [now, 'fresh'],
    [now - 3 * HOUR, 'fresh'],
    [now - 3 * HOUR - 1, 'recent'],
    [now - 12 * HOUR, 'recent'],
    [now - 12 * HOUR - 1, 'older'],
    [now + 1, 'invalid'],
    [NaN, 'invalid'],
    [Infinity, 'invalid'],
    [null, 'invalid'],
    [String(now), 'invalid'],
  ];
  for (const [acquiredAt, expected] of cases) {
    assert.equal(ageBand(acquiredAt, now), expected);
  }
  assert.equal(ageBand(now, NaN), 'invalid');
});

test('a frozen playback anchor keeps its window after the wall clock advances', () => {
  assert.deepEqual(temporalRange({now, hours:24, progress:50}), {
    start:Date.parse('2026-10-25T12:00:00Z'),
    end:Date.parse('2026-10-26T00:00:00Z'),
    anchor:now, hours:24, historical:true,
  });
  const frozen = temporalRange({now:now + 7 * HOUR, anchor:now, hours:24, progress:50});
  assert.equal(frozen.start, Date.parse('2026-10-25T12:00:00Z'));
  assert.equal(frozen.end, Date.parse('2026-10-26T00:00:00Z'));
  assert.equal(frozen.anchor, now);
});

test('range clamps progress and explicit cutoffs and rejects unsupported windows or future anchors', () => {
  assert.equal(temporalRange({now, progress:-5}).end, Date.parse('2026-10-25T12:00:00Z'));
  assert.equal(temporalRange({now, progress:105}).end, now);
  assert.equal(temporalRange({now, progress:-Infinity}).end, Date.parse('2026-10-25T12:00:00Z'));
  assert.equal(temporalRange({now, progress:Infinity}).end, now);
  assert.equal(temporalRange({now, cutoff:now + HOUR, progress:0}).end, now);
  assert.equal(temporalRange({now, cutoff:now - 30 * HOUR, progress:100}).end, Date.parse('2026-10-25T12:00:00Z'));
  assert.equal(temporalRange({now, cutoff:now - HOUR, progress:0}).end, Date.parse('2026-10-26T11:00:00Z'));
  assert.equal(temporalRange({now, cutoff:Infinity, progress:100}).end, now);
  assert.equal(temporalRange({now, anchor:now + 1}).anchor, now);
  assert.equal(temporalRange({now, anchor:NaN}).anchor, now);
  assert.equal(temporalRange({now, hours:72}).hours, 24);
  assert.equal(temporalRange({now, hours:48}).start, Date.parse('2026-10-24T12:00:00Z'));
  assert.equal(temporalRange({now, hours:168}).start, Date.parse('2026-10-19T12:00:00Z'));
});

test('historical status uses the displayed clock with a one-minute tolerance', () => {
  assert.equal(temporalRange({now}).historical, false);
  assert.equal(temporalRange({now, cutoff:now - 60_000}).historical, false);
  assert.equal(temporalRange({now, cutoff:now - 60_001}).historical, true);
});

const data = {
  provinces:['KALIMANTAN TENGAH', 'SUMATERA SELATAN'],
  municipalities:['Kab. Kapuas', 'Kab. Ogan Ilir', 'Kab. Pulang Pisau'],
  sources:[{name:'VIIRS S-NPP'}],
};
const observation = (id, acquiredAt, {frp = null, confidence = 1, province = 0, municipality = 0, lon = 114, lat = -2} = {}) =>
  [id, lon, lat, acquiredAt, frp, confidence, 0, province, municipality];

test('summary includes exact window edges and rejects old, invalid, and future acquisition times', () => {
  const range = temporalRange({now});
  const rows = [
    observation('window-start', now - 24 * HOUR, {confidence:2}),
    observation('too-old', now - 24 * HOUR - 1, {frp:999}),
    observation('future', now + 1, {frp:999}),
    observation('invalid', NaN, {frp:999}),
    observation('three-hours', now - 3 * HOUR, {frp:0, lon:113, lat:-3}),
    observation('twelve-hours', now - 12 * HOUR, {frp:10, confidence:2, province:1, municipality:1}),
    observation('over-twelve', now - 12 * HOUR - 1, {frp:15, confidence:0, province:1, municipality:1}),
    observation('latest', now, {confidence:2, municipality:2}),
  ];
  const original = structuredClone(rows);
  rows.forEach(Object.freeze);
  Object.freeze(rows);
  const summary = time.summarizeSituation(rows, data, range);
  assert.equal(summary.total, 5);
  assert.equal(summary.latest, now);
  assert.deepEqual(summary.byAge, {fresh:2, recent:1, older:2});
  assert.equal(summary.highConfidence, 3);
  assert.equal(summary.maxFRP, 15);
  assert.deepEqual(summary.groups.map(group => group.id), ['0:2', '0:0', '1:1']);
  assert.deepEqual(summary.groups[1], {
    id:'0:0', name:'Kab. Kapuas', province:'KALIMANTAN TENGAH', count:2, freshCount:1,
    latest:now - 3 * HOUR, bounds:[[113, -3], [114, -2]], row:rows[4], highConfidence:1, maxFRP:0,
  });
  assert.deepEqual(rows, original);
});

test('group ordering prioritizes fresh acquisitions before recency and count', () => {
  const rows = [
    observation('two-fresh-a', now - HOUR, {municipality:0}),
    observation('two-fresh-b', now - 2 * HOUR, {municipality:0}),
    observation('newest-one', now, {municipality:2}),
    observation('old-a', now - 4 * HOUR, {province:1, municipality:1}),
    observation('old-b', now - 5 * HOUR, {province:1, municipality:1}),
    observation('old-c', now - 6 * HOUR, {province:1, municipality:1}),
  ];
  const summary = time.summarizeSituation(rows, data, temporalRange({now}));
  assert.deepEqual(summary.groups.map(group => [group.id, group.count, group.freshCount]), [
    ['0:0', 2, 2], ['0:2', 1, 1], ['1:1', 3, 0],
  ]);
});

test('fixed histogram retains later known acquisitions while the frame and total stop at the cursor', () => {
  const start = Date.parse('2026-10-25T12:00:00Z');
  const range = temporalRange({now, cutoff:Date.parse('2026-10-25T14:30:00Z')});
  const rows = [
    observation('start', start),
    observation('hour-one', start + HOUR),
    observation('hour-two', start + 2 * HOUR),
    observation('at-cursor', start + 2.5 * HOUR, {municipality:2}),
    observation('after-cursor', start + 2.75 * HOUR, {municipality:2}),
    observation('at-anchor', now),
    observation('before-window', start - 1),
    observation('after-anchor', now + 1),
  ];
  const summary = time.summarizeSituation(rows, data, range);
  assert.equal(summary.total, 4);
  assert.equal(summary.latest, Date.parse('2026-10-25T14:30:00Z'));
  assert.deepEqual(summary.byAge, {fresh:4, recent:0, older:0});
  assert.equal(summary.bins.length, 24);
  assert.deepEqual(summary.bins[0], {start, end:Date.parse('2026-10-25T13:00:00Z'), count:1});
  assert.equal(summary.bins[1].count, 1);
  assert.equal(summary.bins[2].count, 3);
  assert.equal(summary.bins[23].count, 1);
  assert.equal(summary.bins.reduce((sum, bin) => sum + bin.count, 0), 6);
  assert.equal(summary.frame.start, Date.parse('2026-10-25T13:30:00Z'));
  assert.equal(summary.frame.end, Date.parse('2026-10-25T14:30:00Z'));
  assert.equal(summary.frame.count, 2);
  assert.equal(summary.frame.leader.id, '0:2');
  assert.equal(summary.frame.leader.count, 1);
  assert.equal(summary.frame.leader.latest, Date.parse('2026-10-25T14:30:00Z'));
  const boundary = time.summarizeSituation(rows, data, temporalRange({now, cutoff:start + 2 * HOUR}));
  assert.equal(boundary.frame.start, Date.parse('2026-10-25T13:00:00Z'));
  assert.equal(boundary.frame.end, Date.parse('2026-10-25T14:00:00Z'));
  assert.equal(boundary.frame.count, 1);
  assert.equal(boundary.frame.leader.row[0], 'hour-two');
  const last = time.summarizeSituation(rows, data, temporalRange({now}));
  assert.equal(last.frame.start, Date.parse('2026-10-26T11:00:00Z'));
  assert.equal(last.frame.count, 1);
});

test('48-hour and 7-day histograms still have 24 equal fixed bins', () => {
  for (const [hours, start, next] of [
    [48, Date.parse('2026-10-24T12:00:00Z'), Date.parse('2026-10-24T14:00:00Z')],
    [168, Date.parse('2026-10-19T12:00:00Z'), Date.parse('2026-10-19T19:00:00Z')],
  ]) {
    const range = temporalRange({now, hours, cutoff:next});
    const summary = time.summarizeSituation([observation('edge', next)], data, range);
    assert.equal(summary.bins.length, 24);
    assert.deepEqual(summary.bins[0], {start, end:next, count:0});
    assert.equal(summary.bins[1].count, 1);
    assert.equal(summary.frame.start, start);
    assert.equal(summary.frame.end, next);
    assert.equal(summary.frame.count, 1);
  }
});

test('an exact hourly playback step narrates the observations just revealed despite unaligned anchor seconds', () => {
  const wallClock = Date.parse('2026-10-26T12:07:43.123Z');
  const range = temporalRange({now:wallClock, progress:5 * (100 / 24)});
  const rows = [
    observation('before-frame', Date.parse('2026-10-25T16:07:00Z')),
    observation('revealed-first', Date.parse('2026-10-25T16:10:00Z')),
    observation('revealed-latest', Date.parse('2026-10-25T17:00:00Z')),
    observation('after-cursor', Date.parse('2026-10-25T17:08:00Z')),
  ];
  const summary = time.summarizeSituation(rows, data, range);
  assert.equal(range.end, Date.parse('2026-10-25T17:07:43.123Z'));
  assert.equal(summary.total, 3);
  assert.equal(summary.frame.start, Date.parse('2026-10-25T16:07:43.123Z'));
  assert.equal(summary.frame.end, Date.parse('2026-10-25T17:07:43.123Z'));
  assert.equal(summary.frame.count, 2);
  assert.equal(summary.frame.leader.count, 2);
  assert.equal(summary.frame.leader.row[0], 'revealed-latest');
  assert.equal(summary.bins[4].count, 2);
  assert.equal(summary.bins[5].count, 1);
});

test('a seven-hour narration frame chooses the region with most detections while the main list remains fresh-first', () => {
  const rows = Array.from({length:10}, (_, index) => observation(`older-${index}`, now - 5 * HOUR));
  rows.push(observation('fresh-one', now - HOUR, {municipality:2}));
  const summary = time.summarizeSituation(rows, data, temporalRange({now, hours:168}));
  assert.equal(summary.frame.start, Date.parse('2026-10-26T05:00:00Z'));
  assert.equal(summary.frame.end, now);
  assert.equal(summary.frame.count, 11);
  assert.equal(summary.frame.leader.id, '0:0');
  assert.equal(summary.frame.leader.count, 10);
  assert.equal(summary.frame.leader.freshCount, 0);
  assert.equal(summary.groups[0].id, '0:2');
});

test('the initial narration frame includes the exact window start without repeating later frame boundaries', () => {
  const start = Date.parse('2026-10-25T12:00:00Z');
  const rows = [observation('start', start), observation('half-hour', start + HOUR / 2)];
  const first = time.summarizeSituation(rows, data, temporalRange({now, progress:0}));
  assert.deepEqual(first.frame, {
    start, end:start, count:1, leader:first.groups[0],
  });
  const partial = time.summarizeSituation(rows, data, temporalRange({now, cutoff:start + HOUR / 2}));
  assert.equal(partial.frame.start, start);
  assert.equal(partial.frame.count, 2);
  const later = time.summarizeSituation(rows, data, temporalRange({now, cutoff:start + 1.5 * HOUR}));
  assert.equal(later.frame.start, Date.parse('2026-10-25T12:30:00Z'));
  assert.equal(later.frame.count, 0);
  assert.equal(later.frame.leader, null);
});

test('narrowed geographic and sensor input cannot regain observations from snapshot metadata', () => {
  const selected = observation('selected', now - HOUR, {municipality:2});
  const other = observation('other', now, {province:1, municipality:1, frp:500, confidence:2});
  const summary = time.summarizeSituation([selected], {...data, rows:[selected, other]}, temporalRange({now}));
  assert.equal(summary.total, 1);
  assert.equal(summary.latest, now - HOUR);
  assert.equal(summary.highConfidence, 0);
  assert.equal(summary.maxFRP, null);
  assert.deepEqual(summary.groups.map(group => group.id), ['0:2']);
  assert.equal(summary.bins.reduce((sum, bin) => sum + bin.count, 0), 1);
});

test('unknown FRP stays null while known zero survives summary and group aggregation', () => {
  const range = temporalRange({now});
  const unknown = time.summarizeSituation([observation('unknown', now)], data, range);
  assert.equal(unknown.maxFRP, null);
  assert.equal(unknown.groups[0].maxFRP, null);
  const zero = time.summarizeSituation([observation('unknown', now), observation('zero', now, {frp:0})], data, range);
  assert.equal(zero.maxFRP, 0);
  assert.equal(zero.groups[0].maxFRP, 0);
});

test('an empty interval has no latest observation or frame leader', () => {
  const summary = time.summarizeSituation([], data, temporalRange({now}));
  assert.equal(summary.total, 0);
  assert.equal(summary.latest, 0);
  assert.deepEqual(summary.byAge, {fresh:0, recent:0, older:0});
  assert.equal(summary.highConfidence, 0);
  assert.equal(summary.maxFRP, null);
  assert.deepEqual(summary.groups, []);
  assert.equal(summary.bins.length, 24);
  assert.ok(summary.bins.every(bin => bin.count === 0));
  assert.equal(summary.frame.count, 0);
  assert.equal(summary.frame.leader, null);
});

test('situation brief preserves selected scope and separates acquisition, retrieval, and creation clocks in WIB and UTC', () => {
  const range = temporalRange({now, cutoff:now - HOUR / 2});
  const summary = time.summarizeSituation([
    observation('fresh', now - HOUR, {frp:15, confidence:2}),
    observation('recent', now - 4 * HOUR, {frp:10, confidence:2}),
    observation('older', now - 13 * HOUR),
    observation('older-zero', now - 20 * HOUR, {frp:0}),
  ], data, range);
  const report = time.buildSituationBrief(summary, {
    scope:'Kab. Kapuas · VIIRS S-NPP · nominal dan tinggi · pencarian kapuas', range,
    retrievedAt:'2026-10-26T11:50:00Z', generatedAt:'2026-10-26T13:00:00Z',
    url:'https://example.org/fire?province=0&municipality=0&cutoff=1793014200000',
  });
  assert.match(report, /Cakupan: Kab\. Kapuas · VIIRS S-NPP · nominal dan tinggi · pencarian kapuas/);
  assert.match(report, /Rentang pengamatan UTC: 2026-10-25T12:00:00\.000Z.*2026-10-26T11:30:00\.000Z/);
  assert.match(report, /Rentang pengamatan WIB:.*19[.:]00[.:]00 WIB.*18[.:]30[.:]00 WIB/);
  assert.match(report, /Pengamatan terbaru:.*18[.:]00[.:]00 WIB.*2026-10-26T11:00:00\.000Z/);
  assert.match(report, /Sumber diambil:.*18[.:]50[.:]00 WIB.*2026-10-26T11:50:00\.000Z/);
  assert.match(report, /Laporan dibuat:.*20[.:]00[.:]00 WIB.*2026-10-26T13:00:00\.000Z/);
  assert.match(report, /4 deteksi panas/);
  assert.match(report, /0–3 jam: 1.*3–12 jam: 1.*>12 jam: 2/);
  assert.match(report, /Kepercayaan tinggi: 2/);
  assert.match(report, /FRP maksimum: 15 MW/);
  assert.doesNotMatch(report, /FRP maksimum: 25 MW/);
  assert.match(report, /Kab\. Kapuas.*4 deteksi.*2026-10-26T11:00:00\.000Z/);
  assert.match(report, /bukan jumlah kejadian kebakaran/i);
  assert.match(report, /waktu mulai/i);
  assert.match(report, /aktif.*padam/i);
  assert.match(report, /verifikasi lapangan/i);
  assert.match(report, /BPBD/);
  assert.match(report, /https:\/\/example\.org\/fire\?province=0&municipality=0&cutoff=1793014200000/);
});

test('brief lists at most five scoped regions with their own latest acquisition times', () => {
  const meta = {...data, municipalities:['Area A', 'Area B', 'Area C', 'Area D', 'Area E', 'Area F']};
  const rows = [
    observation('a', now, {municipality:0}),
    observation('b', now - HOUR / 2, {municipality:1}),
    observation('c', now - HOUR, {municipality:2}),
    observation('d', now - 1.5 * HOUR, {municipality:3}),
    observation('e', now - 2 * HOUR, {municipality:4}),
    observation('f', now - 2.5 * HOUR, {municipality:5}),
  ];
  const range = temporalRange({now});
  const report = time.buildSituationBrief(time.summarizeSituation(rows, meta, range), {
    scope:'Pilihan enam wilayah', range, retrievedAt:now, generatedAt:now, url:'https://example.org/',
  });
  for (const name of ['Area A', 'Area B', 'Area C', 'Area D', 'Area E']) assert.ok(report.includes(name));
  assert.ok(!report.includes('Area F'));
  assert.match(report, /Area B.*2026-10-26T11:30:00\.000Z/);
  assert.match(report, /Area E.*2026-10-26T10:00:00\.000Z/);
});

test('brief distinguishes unavailable FRP from a measured zero', () => {
  const range = temporalRange({now});
  const options = {scope:'Indonesia', range, retrievedAt:now, generatedAt:now, url:'https://example.org/'};
  const unknown = time.buildSituationBrief(time.summarizeSituation([observation('unknown', now)], data, range), options);
  assert.match(unknown, /FRP maksimum: tidak tersedia/);
  assert.doesNotMatch(unknown, /FRP maksimum: 0 MW/);
  const zero = time.buildSituationBrief(time.summarizeSituation([observation('zero', now, {frp:0})], data, range), options);
  assert.match(zero, /FRP maksimum: 0 MW/);
});

test('empty report describes an observation gap without claiming there is no fire', () => {
  const range = temporalRange({now});
  const report = time.buildSituationBrief(time.summarizeSituation([], data, range), {
    scope:'Kab. Kapuas', range, retrievedAt:now, generatedAt:now, url:'https://example.org/',
  });
  assert.match(report, /Tidak ada observasi satelit dalam cakupan dan rentang waktu yang dipilih/);
  assert.match(report, /tidak membuktikan tidak ada kebakaran/i);
  assert.match(report, /Pengamatan terbaru: tidak tersedia/);
  assert.doesNotMatch(report, /1970-01-01/);
});

test('stale source report explains the retrieval gap while retaining the actual old acquisition', () => {
  const range = temporalRange({now});
  const report = time.buildSituationBrief(time.summarizeSituation([
    observation('old', now - 20 * HOUR),
  ], data, range), {
    scope:'KALIMANTAN TENGAH', range,
    retrievedAt:'2026-10-26T06:00:00Z', generatedAt:'2026-10-26T12:00:00Z', url:'https://example.org/',
  });
  assert.match(report, /Pengamatan terbaru:.*2026-10-25T16:00:00\.000Z/);
  assert.match(report, /Sumber diambil:.*2026-10-26T06:00:00\.000Z/);
  assert.match(report, /lebih dari 3 jam/);
  assert.match(report, /perbarui sumber/i);
  assert.match(report, /bukan bukti.*padam/i);
});

test('dated field notes preserve source status and location while declaring their broader scope', () => {
  const range = temporalRange({now});
  const summary = time.summarizeSituation([], data, range);
  const options = {scope:'Kab. Kapuas', range, retrievedAt:now, generatedAt:now, url:'https://example.org/'};
  const withoutNotes = time.buildSituationBrief(summary, options);
  assert.doesNotMatch(withoutNotes, /Catatan lapangan bertanggal · cakupan lebih luas:/);
  const note = Object.freeze({
    date:'2026-10-24', statusAsOf:'2026-10-24', sourceStatus:'Api Padam',
    location:'Desa A', regency:'Kotawaringin Barat', province:'KALIMANTAN TENGAH',
    sourceName:'BPBD Kotawaringin Barat', sourceUrl:'https://example.org/bpbd/dated-report',
  });
  const report = time.buildSituationBrief(summary, {
    ...options, fieldNotes:[note], contextScope:'KALIMANTAN TENGAH · cakupan provinsi',
  });
  assert.match(report, /Cakupan: Kab\. Kapuas/);
  assert.match(report, /Catatan lapangan bertanggal · cakupan lebih luas: KALIMANTAN TENGAH · cakupan provinsi/);
  assert.match(report, /2026-10-24.*Desa A.*Kotawaringin Barat/);
  assert.match(report, /Status sumber \(pada tanggal laporan\): Api Padam/);
  assert.match(report, /Sumber: BPBD Kotawaringin Barat/);
  assert.match(report, /https:\/\/example\.org\/bpbd\/dated-report/);
  assert.match(report, /tidak harus berada di kabupaten\/kota yang dipilih/i);
  assert.match(report, /bukan konfirmasi.*saat ini/i);
});
