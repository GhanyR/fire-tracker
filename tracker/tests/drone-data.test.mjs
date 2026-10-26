import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeDrone,mergeDroneFrame,droneFreshness,validateBridgeUrl,demoDrones,shareCamera} from '../lib/drone-data.mjs';
const now=Date.parse('2026-10-26T08:00:00Z');
const packet={type:'telemetry',id:'UAV-1',lat:-8.015,lon:112.97,t:'2026-10-26T07:59:59Z'};
test('telemetry retains UTC position time and unknown metrics; malformed and future positions are rejected',()=>{
 const d=normalizeDrone(packet,now);assert.equal(d.time,now-1000);assert.equal(d.alt,null);assert.equal(d.bat,null);assert.equal(d.simulated,false);
 for(const patch of [{lat:null},{lon:Infinity},{lat:91},{t:'2026-10-26T08:00:00'},{t:'2026-02-30T08:00:00Z'},{t:'2026-10-26Z'},{t:'2026-10-26T08:01:00Z'},{id:''}])assert.equal(normalizeDrone({...packet,...patch},now),null);
});
test('out of order frames cannot move a drone backwards; equal timestamps do not duplicate trail',()=>{
 const a=mergeDroneFrame([],packet,now);const b=mergeDroneFrame(a,{...packet,lon:113,t:'2026-10-26T07:59:58Z'},now);assert.equal(b[0].lon,112.97);
 const c=mergeDroneFrame(b,{...packet,bat:50,lon:111},now);assert.equal(c[0].lon,112.97);assert.equal(c[0].trail.length,1);assert.equal(c[0].bat,50);
 const d=mergeDroneFrame(c,{...packet,lon:112.98,t:'2026-10-26T08:00:00Z'},now);assert.equal(d[0].trail.length,2);
});
test('hello arrays preserve vehicles and cap fleet/trail memory without discarding current vehicles',()=>{
 const fleet=Array.from({length:120},(_,i)=>({...packet,id:'UAV-'+i,t:new Date(now-120000+i*1000).toISOString()}));const state=mergeDroneFrame([],{type:'hello',drones:fleet},now);assert.equal(state.length,100);assert.ok(state.some(d=>d.id==='UAV-119'));assert.ok(!state.some(d=>d.id==='UAV-0'));
 let one=[];for(let i=0;i<150;i++)one=mergeDroneFrame(one,{...packet,t:new Date(now-150000+i*1000).toISOString(),lon:112.97+i*.00001},now);assert.equal(one[0].trail.length,80);
});
test('signal freshness is based on acquisition time, and paused demo is never labelled live',()=>{
 assert.equal(droneFreshness({time:now-2000},now),'fresh');assert.equal(droneFreshness({time:now-16000},now),'delayed');assert.equal(droneFreshness({time:now-61000},now),'stale');
 assert.equal(droneFreshness({time:now,simulated:true},now),'demo');
});
test('public HTTPS view requires WSS, disallows embedded credentials and permits localhost WS in local dashboard',()=>{
 assert.equal(validateBridgeUrl('wss://bridge.example/ws','https:'),'wss://bridge.example/ws');assert.equal(validateBridgeUrl('ws://127.0.0.1:8787/ws','http:'),'ws://127.0.0.1:8787/ws');
 for(const url of ['ws://127.0.0.1:8787/ws','https://example.org/state','wss://user:pass@example.org/ws','wss://example.org/ws?token=secret'])assert.throws(()=>validateBridgeUrl(url,'https:'));
});
test('demo is deterministic, moving and explicitly simulated without borrowing satellite data',()=>{
 const a=demoDrones(0,now),b=demoDrones(2000,now+2000);assert.equal(a.length,2);assert.ok(a.every(x=>x.simulated&&x.link==='sim'));assert.notEqual(a[0].lon,b[0].lon);assert.equal(a[0].t,new Date(now).toISOString());
});

test('sharing after disconnect still excludes the last real drone camera location',()=>{const camera={lon:114.123456,lat:-2.123456};assert.equal(shareCamera({camera,hasLiveSession:true}),null);assert.deepEqual(shareCamera({camera,hasLiveSession:true,demo:true}),[112.955,-8.015]);assert.deepEqual(shareCamera({camera,hasLiveSession:true,selectedCoordinates:[105,-3]}),[105,-3]);});
