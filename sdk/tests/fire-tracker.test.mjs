import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { FireTrackerClient, normalizeTelemetry, fromDjiOsd } from '../fire-tracker.mjs';

let processBridge, url;
before(async () => {
  processBridge = spawn('python3', [fileURLToPath(new URL('./bridge-fixture.py', import.meta.url))], { stdio: ['ignore', 'pipe', 'pipe'] });
  processBridge.stderr.on('data', chunk => process.stderr.write(chunk));
  const line = await Promise.race([
    once(processBridge.stdout, 'data').then(([chunk]) => chunk.toString().trim()),
    once(processBridge, 'exit').then(([code]) => { throw new Error(`bridge failed to start: ${code}`); }),
  ]);
  url = `http://127.0.0.1:${Number(line)}`;
});
after(async () => { processBridge?.kill(); if (processBridge?.exitCode === null) await once(processBridge, 'exit'); });

function nextTelemetry(client, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { unsubscribe(); reject(new Error('no matching telemetry')); }, 1500);
    const unsubscribe = client.subscribe(data => {
      if (!predicate(data)) return;
      clearTimeout(timeout); unsubscribe(); resolve(data);
    });
  });
}

test('normalization rejects missing/false/string coordinates and keeps unknown sensors null', () => {
  for (const lat of [undefined, null, false, '', '1.2', Infinity, NaN]) {
    assert.throws(() => normalizeTelemetry({ lat, lon: 100 }), /lat/);
  }
  const data = normalizeTelemetry({ lat: 0, lon: 0, link: 'sim', t: '2026-10-26T08:00:00Z' });
  assert.deepEqual([data.alt, data.alt_msl, data.hdg, data.spd, data.bat, data.armed], [null, null, null, null, null, null]);
  assert.equal(data.simulated, true);
  assert.equal(data.t, '2026-10-26T08:00:00.000Z');
  assert.throws(() => normalizeTelemetry({ lat: 1, lon: 2, t: '2026-02-30T12:00:00Z' }), /t /);
  assert.throws(() => normalizeTelemetry({ lat: 1, lon: 2, t: '2026-10-26T08:00:00+07:00' }), /UTC/);
});

test('DJI OSD conversion requires explicit height reference and preserves zeros', () => {
  const osd = { data: { latitude: -2.7, longitude: 114.1, attitude_head: -90, horizontal_speed: 0,
                        height: 80, battery: { capacity_percent: 0 } } };
  const unknown = fromDjiOsd(osd, { id: 'dji-1', t: '2026-10-26T08:00:00Z' });
  assert.deepEqual([unknown.alt, unknown.alt_msl, unknown.bat, unknown.spd, unknown.hdg], [null, null, 0, 0, 270]);
  assert.equal(fromDjiOsd(osd, { id: 'dji-1', heightReference: 'relative-home' }).alt, 80);
  assert.equal(fromDjiOsd(osd, { id: 'dji-1', heightReference: 'msl' }).alt_msl, 80);
  assert.throws(() => fromDjiOsd(osd, { heightReference: 'agl' }), /heightReference/);
});

test('real HTTP and WS bridge authenticate, deliver updates, snapshots and read-only errors', async () => {
  const publisher = new FireTrackerClient({ url, token: 'pub-test', heartbeatMs: 20 });
  const viewer = new FireTrackerClient({ url, token: 'read-test', heartbeatMs: 20 });
  try {
    await viewer.connect();
    const incoming = nextTelemetry(viewer, d => d.id === 'sdk-uav');
    const response = await publisher.publishTelemetry({ id: 'sdk-uav', lat: -2, lon: 114, simulated: true, t: '2026-10-26T08:00:00Z' });
    assert.equal(response.n, 1);
    const telemetry = await incoming;
    assert.equal(telemetry.alt, null);
    assert.equal(telemetry.simulated, true);
    assert.equal(telemetry.t, '2026-10-26T08:00:00.000Z');
    await assert.rejects(viewer.publishTelemetry({ lat: 1, lon: 2 }), /403/);
    const snapshotClient = new FireTrackerClient({ url, token: 'read-test' });
    const snapshot = nextTelemetry(snapshotClient, d => d.id === 'sdk-uav');
    try { await snapshotClient.connect(); assert.equal((await snapshot).lat, -2); }
    finally { snapshotClient.close(); }
    await new Promise(resolve => setTimeout(resolve, 60));
    assert.equal(viewer.connected, true);
  } finally { viewer.close(); publisher.close(); }
});

test('incorrect authentication rejects connect instead of exposing a snapshot', async () => {
  const client = new FireTrackerClient({ url, token: 'wrong', connectTimeoutMs: 500 });
  try { await assert.rejects(client.connect(), /closed|auth/i); }
  finally { client.close(); }
});

test('SDK surfaces stale HTTP rejection without changing the observation timestamp', async () => {
  const client = new FireTrackerClient({ url, token: 'pub-test' });
  try {
    await client.publishTelemetry({ id: 'ordered', lat: 1, lon: 2, t: '2026-10-26T08:00:00Z' });
    await assert.rejects(client.publishTelemetry({ id: 'ordered', lat: 9, lon: 2, t: '2026-10-26T07:59:59Z' }), /409/);
    const response = await fetch(`${url}/state`, { headers: { Authorization: 'Bearer read-test' } });
    const state = await response.json();
    assert.equal(state.drones.find(d => d.id === 'ordered').lat, 1);
  } finally { client.close(); }
});

test('subscription suppresses older envelopes and bounds the latest-vehicle cache', () => {
  const client = new FireTrackerClient({ url, maxVehicles: 2 });
  const seen = [];
  client.subscribe(data => seen.push([data.id, data.lat]));
  client.acceptEnvelope({ type: 'state', drones: [{ id: 'a', lat: 1, lon: 2, t: '2026-10-26T08:00:00Z' }] });
  client.acceptEnvelope({ type: 'telemetry', id: 'a', lat: 9, lon: 2, t: '2026-10-26T07:59:59Z' });
  client.acceptEnvelope({ type: 'hello', drones: [{ id: 'b', lat: 2, lon: 2, t: '2026-10-26T08:00:00Z' }] });
  client.acceptEnvelope({ type: 'telemetry', id: 'c', lat: 3, lon: 2, t: '2026-10-26T08:00:00Z' });
  assert.deepEqual(seen, [['a', 1], ['b', 2], ['c', 3]]);
  assert.deepEqual(client.drones.map(d => d.id), ['b', 'c']);
  client.close();
});

test('explicit null coordinates cannot fall through to legacy aliases', () => {
  assert.throws(() => normalizeTelemetry({ lat: 1, lon: null, lng: 2 }), /lon/);
  assert.throws(() => normalizeTelemetry({ lat: 1, lon: 2, simulated: null }), /simulated/);
});

test('future UTC observations are rejected before they can poison ordering',()=>{assert.throws(()=>normalizeTelemetry({id:'uav',lat:-8,lon:113,t:'2099-01-01T00:00:00Z'}),/future/);});

test('fleet metadata and supplied EO/IR streams survive real authenticated HTTP and WS',async()=>{
 const viewer=new FireTrackerClient({url,token:'read-test'}),publisher=new FireTrackerClient({url,token:'pub-test'});
 const stream={id:'thermal',label:'IR camera',kind:'ir',protocol:'mjpeg',url:'https://camera.example/thermal'};
 try{await viewer.connect();const next=nextTelemetry(viewer,d=>d.id==='fleet-metadata');await publisher.publishTelemetry({id:'fleet-metadata',lat:0,lon:0,t:'2026-10-26T08:00:00Z',name:'Alpha',mission:'Fire edge survey',airframe:'multirotor',flightStatus:'landed',linkQuality:0,streams:[stream],simulated:true});const d=await next;
 assert.deepEqual([d.name,d.mission,d.airframe,d.flightStatus,d.linkQuality,d.streams],['Alpha','Fire edge survey','multirotor','landed',0,[stream]]);assert.equal(d.t,'2026-10-26T08:00:00.000Z');assert.equal(d.bat,null);
 }finally{viewer.close();publisher.close();}
});

test('fleet validation rejects invalid enum, quality and unsafe or excessive stream inputs',()=>{
 const base={lat:0,lon:0};const stream={id:'eo',label:'EO',kind:'eo',protocol:'hls',url:'https://camera.example/live.m3u8'};
 assert.deepEqual([normalizeTelemetry(base).airframe,normalizeTelemetry(base).flightStatus,normalizeTelemetry(base).linkQuality,normalizeTelemetry(base).streams],['unknown','unknown',null,[]]);
 for(const patch of [{airframe:'jet'},{flightStatus:'armed'},{linkQuality:101},{linkQuality:false},{streams:[{...stream,url:'https://name:password@camera.example'}]},{streams:[{...stream,url:'file:///secret'}]},{streams:[{...stream,protocol:'rtsp'}]},{streams:[{...stream,kind:'temperature'}]},{streams:Array(5).fill(stream)}])assert.throws(()=>normalizeTelemetry({...base,...patch}));
 for(const url of ['https://camera.example/arm','https://camera.example/%63ommand','https://camera.example/live?token=secret','https://camera.example/live?action=land','https://camera.example/%ZZ','https://camera.example/live#secret'])assert.throws(()=>normalizeTelemetry({...base,streams:[{...stream,url}]}));
});
