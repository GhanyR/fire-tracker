import test from 'node:test';
import assert from 'node:assert/strict';
import {expression} from '@maplibre/maplibre-gl-style-spec';
import {createReplayDataWriter,replayTimeFilter,observationCollection,playbackFrameReady,observeTerrainAvailability,prepareTerrain} from '../lib/map-observations.mjs';
const row=(id,t,lon=113,lat=-8)=>[id,lon,lat,t,null,1,0,0,0];
function visible(filter,observed){const parsed=expression.createExpression(filter);assert.equal(parsed.result,'success');return parsed.value.evaluate({zoom:10},{type:1,properties:{observed}});}
test('preloaded replay geometry hides future acquisitions and reveals the exact clock edge while scrubbing in both directions',()=>{
 const times=[1000,2000,3000];
 for(const cutoff of [999,1000,2500,3000,1000])assert.deepEqual(times.filter(t=>visible(replayTimeFilter(cutoff),t)),times.filter(t=>t<=cutoff));
 for(const cutoff of [NaN,Infinity,undefined])assert.equal(visible(replayTimeFilter(cutoff),1000),false);
});
test('a 40000-point replay uploads geometry once across 24 advancing frames and a pause; source replacement and new filters refresh it',()=>{
 const writes=[],source={setData:fc=>writes.push(fc)},write=createReplayDataWriter();
 const rows=Array.from({length:40000},(_,i)=>row('r'+i,i+1));
 for(let frame=0;frame<25;frame++){write(source,rows);assert.equal(writes.length,1);}
 assert.equal(writes[0].features.length,40000);
 const replacement={setData:fc=>writes.push(fc)};write(replacement,rows);assert.equal(writes.length,2);
 write(replacement,rows.slice(0,2));assert.equal(writes.length,3);assert.equal(writes[2].features.length,2);
});
test('invalid geometry or acquisition times never enter replay rendering, and feature IDs preserve observation lookup',()=>{
 const collection=observationCollection([row('valid',1000),row('future',2000),row('bad-time',NaN),row('bad-lon',1000,NaN),row('outside',1000,113,91)]);
 assert.deepEqual(collection.features.map(f=>f.properties.id),['valid','future']);
 assert.deepEqual(collection.features[0].geometry.coordinates,[113,-8]);assert.equal(collection.features[0].properties.observed,1000);
});

test('playback waits for movement and observation geometry before advancing; slow base tiles have a bounded wait',()=>{
 for(const state of [{moving:true,sourceLoaded:true,tilesLoaded:true,elapsed:20000},{moving:false,sourceLoaded:false,tilesLoaded:true,elapsed:20000},{moving:false,sourceLoaded:true,tilesLoaded:false,elapsed:1499}])assert.equal(playbackFrameReady(state),false);
 assert.equal(playbackFrameReady({moving:false,sourceLoaded:true,tilesLoaded:true,elapsed:0}),true);
 assert.equal(playbackFrameReady({moving:false,sourceLoaded:true,tilesLoaded:false,elapsed:1500}),true);
});

test('failed DEM completion stays flat; only successful destination or cached terrain can restore 3D',t=>{
 t.mock.timers.enable({apis:['setInterval']});
 const events=new Map(),calls=[];let moving=true,sourceLoaded=true,center={lng:112,lat:-8};
 const map={on:(e,f)=>{if(!events.has(e))events.set(e,new Set());events.get(e).add(f);},off:(e,f)=>events.get(e)?.delete(f),isSourceLoaded:()=>sourceLoaded,getCenter:()=>center,getZoom:()=>10,isMoving:()=>moving,setTerrain:x=>calls.push(x)};
 const emit=(type,e)=>{for(const f of events.get(type)||[])f(e);};
 const terrain=observeTerrainAvailability(map),stop=prepareTerrain(map,1.5,terrain.available);
 const tile={tileID:{canonical:{z:6,x:51,y:33}},state:'errored'};
 emit('sourcedata',{sourceId:'dem',tile});moving=false;t.mock.timers.tick(1000);assert.deepEqual(calls,[null]);
 tile.state='loaded';tile.dem={};emit('sourcedata',{sourceId:'dem',tile});sourceLoaded=false;t.mock.timers.tick(250);assert.equal(calls.length,1);
 sourceLoaded=true;t.mock.timers.tick(250);assert.deepEqual(calls,[null,{source:'dem',exaggeration:1.5}]);
 stop();assert.equal(events.get('idle').size,0);
 center={lng:127,lat:-1};assert.equal(terrain.available(),false);center={lng:112,lat:-8};assert.equal(terrain.available(),true);
 delete tile.dem;assert.equal(terrain.available(),false);
 const cancel=prepareTerrain(map,1.5,terrain.available);cancel();tile.dem={};emit('sourcedata',{sourceId:'dem',tile});t.mock.timers.tick(1000);assert.equal(calls.length,3);
 terrain.dispose();assert.equal(events.get('sourcedata').size,0);
});
