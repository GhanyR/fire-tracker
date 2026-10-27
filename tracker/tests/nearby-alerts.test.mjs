import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeWatch,nearbyObservations,watchCircle} from '../lib/nearby-alerts.mjs';
const now=Date.UTC(2026,9,27,5), watch={name:'Bromo',lon:112.95,lat:-8.0,radiusKm:10,minConfidence:1};
const snapshot={municipalities:['KAB. MALANG'],provinces:['JAWA TIMUR'],sources:[{name:'VIIRS'}],rows:[['near',112.95,-8.01,now-1000,2,1,0,0,0],['far',114,-8,now-2000,3,2,0,0,0],['low',112.95,-8.01,now-1000,2,0,0,0,0],['old',112.95,-8.01,now-25*3600000,2,2,0,0,0],['future',112.95,-8.01,now+1000,2,2,0,0,0]]};
test('nearby list uses current acquisition time and radius, not publication or playback time',()=>{
 assert.deepEqual(nearbyObservations(snapshot,watch,{now}).map(x=>x.row[0]),['near']);
 assert.deepEqual(nearbyObservations({...snapshot,retrievedAt:new Date(now+10000).toISOString()},watch,{now,after:now}).map(x=>x.row[0]),[]);
});
test('nearby list deduplicates IDs and keeps newly acquired observations after watch start',()=>{
 const data={...snapshot,rows:[snapshot.rows[0],snapshot.rows[0],['late',112.95,-8.02,now-2000,null,2,0,0,0]]};
 const result=nearbyObservations(data,watch,{now,after:now-3000});
 assert.deepEqual(result.map(x=>x.row[0]),['near','late']);assert.ok(result[0].distanceKm>1&&result[0].distanceKm<1.2);
});
test('watch rejects invalid coordinates and unsupported radius instead of silently broadening coverage',()=>{
 assert.throws(()=>normalizeWatch({...watch,lon:0}));assert.throws(()=>normalizeWatch({...watch,radiusKm:0}));assert.throws(()=>normalizeWatch({...watch,minConfidence:3}));
 assert.equal(normalizeWatch({...watch,name:'  Bromo  '}).name,'Bromo');
});
test('watch boundary is closed and measures selected radius on the globe',()=>{
 const boundary=watchCircle(watch);const ring=boundary.geometry.coordinates[0];assert.deepEqual(ring[0],ring.at(-1));
 const north=ring[0];assert.ok(north[1]>-7.911&&north[1]<-7.909);assert.ok(Math.abs(north[0]-112.95)<.0001);
});
test('private watch camera stays out of public share links while a public observation remains shareable',async()=>{const {shareCamera}=await import('../lib/drone-data.mjs');const camera={lon:113.123456,lat:-8.123456};assert.equal(shareCamera({camera,privateArea:true,hasLiveSession:false}),null);assert.deepEqual(shareCamera({camera,privateArea:true,selectedCoordinates:[112,-7]}),[112,-7]);});
