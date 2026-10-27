import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeDrone,mergeDroneFrame,droneFreshness,validateBridgeUrl,demoDrones,shareCamera,fleetTelemetryStatus} from '../lib/drone-data.mjs';
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
 const a=demoDrones(0,now),b=demoDrones(2000,now+2000);assert.equal(a.length,6);assert.ok(a.every(x=>x.simulated&&x.link==='sim'));assert.notEqual(a[0].lon,b[0].lon);assert.equal(a[0].t,new Date(now).toISOString());
 assert.deepEqual(a.map(x=>x.id),['DEMO-01','DEMO-02','DEMO-03','DEMO-04','DEMO-05','DEMO-06']);assert.equal(new Set(a.map(x=>x.name)).size,6);assert.equal(new Set(a.map(x=>x.mission)).size,6);assert.deepEqual(new Set(a.map(x=>x.airframe)),new Set(['multirotor','fixed-wing']));assert.equal(new Set(a.map(x=>x.bat)).size,6);assert.ok(a.every(x=>normalizeDrone(x,now)?.simulated));
});

test('fleet metadata survives normalization while unsafe streams and unknown statuses stay honest',()=>{
 const stream={id:'eo-1',label:'Front EO',kind:'eo',protocol:'hls',url:'https://camera.example/live.m3u8'};
 const d=normalizeDrone({...packet,name:'Alpha',mission:'Perimeter survey',airframe:'fixed-wing',flightStatus:'airborne',linkQuality:0,streams:[stream]},now);
 assert.deepEqual([d.name,d.mission,d.airframe,d.flightStatus,d.linkQuality],['Alpha','Perimeter survey','fixed-wing','airborne',0]);assert.deepEqual(d.streams,[stream]);
 const unknown=normalizeDrone({...packet,airframe:'jet',flightStatus:'armed',linkQuality:101,streams:[{...stream,url:'https://user:secret@camera.example/live'},{...stream,kind:'temperature'},{...stream,url:'javascript:alert(1)'}]},now);
 assert.deepEqual([unknown.airframe,unknown.flightStatus,unknown.linkQuality,unknown.streams],['unknown','unknown',null,[]]);assert.equal(normalizeDrone(packet,now).name,'');assert.equal(normalizeDrone(packet,now).streams.length,0);
 assert.equal(normalizeDrone({...packet,streams:Array.from({length:9},(_,i)=>({...stream,id:'s'+i}))},now).streams.length,4);
 for(const url of ['https://camera.example/arm','https://camera.example/%63ommand','https://camera.example/live?token=secret','https://camera.example/live?action=land','https://camera.example/%ZZ','https://camera.example/live#secret'])assert.deepEqual(normalizeDrone({...packet,streams:[{...stream,url}]},now).streams,[]);
});

test('sharing after disconnect still excludes the last real drone camera location',()=>{const camera={lon:114.123456,lat:-2.123456};assert.equal(shareCamera({camera,hasLiveSession:true}),null);assert.deepEqual(shareCamera({camera,hasLiveSession:true,demo:true}),[112.955,-8.015]);assert.deepEqual(shareCamera({camera,hasLiveSession:true,selectedCoordinates:[105,-3]}),[105,-3]);});


test('fleet HUD distinguishes transport state and observation age',()=>{
 const d=normalizeDrone(packet,now);
 assert.equal(fleetTelemetryStatus(d,{status:'reconnecting',now}).state,'reconnecting');
 assert.equal(fleetTelemetryStatus({...d,time:now-61000},{status:'connected',now}).state,'stale');
 assert.equal(fleetTelemetryStatus({...d,time:now-16000},{status:'connected',now}).state,'delayed');
 assert.equal(fleetTelemetryStatus(d,{status:'connected',now}).state,'fresh');
 assert.equal(fleetTelemetryStatus({...d,simulated:true},{status:'connected',now}).state,'demo');
});
test('microsecond observation order is preserved without changing the original UTC string',()=>{
 const a={...packet,t:'2026-10-26T07:59:59.123456+00:00'};
 const original=mergeDroneFrame([],a,now);
 assert.equal(original[0].t,a.t);
 const newer=mergeDroneFrame(original,{...a,t:'2026-10-26T07:59:59.123457Z',lon:113},now);
 assert.equal(newer[0].lon,113);assert.equal(newer[0].trail.length,2);
 assert.equal(mergeDroneFrame(newer,a,now)[0].lon,113);
});
