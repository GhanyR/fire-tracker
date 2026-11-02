import test from 'node:test';
import assert from 'node:assert/strict';
import * as client from '../lib/data-client.mjs';
import {playbackFrameReady} from '../lib/map-observations.mjs';
import {filterRows} from '../lib/fire-data.mjs';

test('critical observations render while optional GIS feeds remain pending, and cancellation ignores late results',async()=>{
 assert.equal(typeof client.loadInitialFeeds,'function');
 let release;const blocked=new Promise(resolve=>release=resolve),seen=[];
 const batch=client.loadInitialFeeds({snapshot:()=>Promise.resolve('observations'),context:()=>blocked,boundaries:()=>Promise.reject(new Error('offline'))},(key,value)=>seen.push([key,value]),key=>seen.push([key,'error']));
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(seen.find(x=>x[0]==='snapshot'),['snapshot','observations']);
 assert.deepEqual(seen.find(x=>x[0]==='boundaries'),['boundaries','error']);
 assert.equal(seen.some(x=>x[0]==='context'),false);
 batch.cancel();release('late');await batch.settled;
 assert.equal(seen.some(x=>x[0]==='context'),false);
});

test('slow raster tiles cannot hold a source-ready, stationary replay frame for more than 1.5 seconds',()=>{
 assert.equal(playbackFrameReady({moving:false,sourceLoaded:true,tilesLoaded:false,elapsed:1500}),true);
 assert.equal(playbackFrameReady({moving:true,sourceLoaded:true,tilesLoaded:false,elapsed:2000}),false);
 assert.equal(playbackFrameReady({moving:false,sourceLoaded:false,tilesLoaded:true,elapsed:2000}),false);
});

test('formatting reuses Intl objects without changing dates, zones or number output',async t=>{
 const OriginalNumber=Intl.NumberFormat,OriginalDate=Intl.DateTimeFormat;let created=0;
 t.mock.method(Intl,'NumberFormat',function(...args){created++;return new OriginalNumber(...args);});
 t.mock.method(Intl,'DateTimeFormat',function(...args){created++;return new OriginalDate(...args);});
 const f=await import('../components/format.mjs?performance');
 const stamp=1793577000000;
 const expectedTime=zone=>new OriginalDate('id-ID',{timeZone:zone,day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false}).format(stamp)+' WIB';
 for(let i=0;i<60;i++){
  assert.equal(f.number(123456.75),new OriginalNumber('id-ID',{maximumFractionDigits:1}).format(123456.75));
  assert.equal(f.time(stamp),expectedTime('Asia/Jakarta'));
  assert.equal(f.time(stamp,'UTC'),expectedTime('UTC'));
  assert.equal(f.date('2026-11-02'),new OriginalDate('id-ID',{timeZone:'UTC',day:'numeric',month:'short',year:'numeric'}).format(new Date('2026-11-02T00:00:00Z')));
 }
 assert.ok(created<=5,`formatter allocations: ${created}`);
});

test('fast search retains Indonesian name, mixed-case and coordinate substring behavior',()=>{
 const rows=[['a',113.5,-8,1000,1,1,0,0,0],['b',113.9,-7.8,1001,1,1,0,0,-1]],provinces=['JAWA TIMUR'],municipalities=['Kab. Málang'];
 for(const query of ['  jaWA  ','MÁLANG','timur kab.','málang 113.5','113.9 -7.8','113.','NO MATCH']){
  const q=query.trim().toLocaleLowerCase('id');
  const expected=rows.filter(r=>`${provinces[r[7]]||''} ${municipalities[r[8]]||''} ${r[1]} ${r[2]}`.toLocaleLowerCase('id').includes(q));
  assert.deepEqual(filterRows(rows,{now:2000,hours:24,query,provinces,municipalities}),expected);
 }
});

test('optional downloads do not compete with the initial observation transfer',async()=>{
 let release;const waiting=new Promise(resolve=>release=resolve),calls=[];
 const batch=client.loadInitialFeeds({snapshot:()=>{calls.push('snapshot');return waiting;},boundaries:()=>{calls.push('boundaries');return 'gis';}},()=>{});
 await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(calls,['snapshot']);
 release('data');await batch.settled;assert.deepEqual(calls,['snapshot','boundaries']);
});

test('request deadlines still work with a caller-owned cancellation signal',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 t.mock.method(globalThis,'fetch',(_url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true})));
 const controller=new AbortController();
 const request=client.json('/slow',{signal:controller.signal,timeoutMs:100});
 const checked=assert.rejects(request,error=>error.name==='TimeoutError');
 t.mock.timers.tick(100);await checked;
 assert.equal(controller.signal.aborted,false);
 const canceled=client.json('/canceled',{signal:controller.signal,timeoutMs:100});
 const canceledCheck=assert.rejects(canceled,error=>error.name==='AbortError');controller.abort();await canceledCheck;
});

test('field refresh can wait for cached context without waiting for GIS or blocking observations',async()=>{
 let releaseGIS;const gis=new Promise(resolve=>releaseGIS=resolve),seen=[];
 const batch=client.loadInitialFeeds({snapshot:()=>Promise.resolve('data'),context:()=>Promise.resolve('cached'),bmkg:()=>Promise.reject(new Error('offline')),boundaries:()=>gis},key=>seen.push(key),()=>{});
 assert.ok(batch.completed);
 await Promise.allSettled([batch.completed.context,batch.completed.bmkg]);
 assert.deepEqual(seen,['snapshot','context']);
 releaseGIS('late');await batch.settled;
});
