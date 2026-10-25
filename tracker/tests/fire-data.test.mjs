import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFirmsCSV,filterRows,pointInGeometry,normalizeCitizen,mergeRows,toCSV,nearestFacilities,normalizeSuppression,normalizeKobar,extractAssignedJSON,resolveShared} from '../lib/fire-data.mjs';
const now=Date.parse('2026-10-17T10:00:00Z');
test('FIRMS parses acquisition time as UTC, keeps null FRP and maps MODIS confidence',()=>{
 const result=parseFirmsCSV('latitude,longitude,acq_date,acq_time,confidence,frp,instrument\n-2.2,113.9,2026-10-17,0035,80,,MODIS\n0,NaN,2026-10-17,1000,80,3,MODIS',3);
 assert.equal(result.length,1);assert.equal(result[0][3],Date.parse('2026-10-17T00:35:00Z'));assert.equal(result[0][4],null);assert.equal(result[0][5],2);
});
test('FIRMS rejects missing latitude, time, and confidence instead of inventing zero values',()=>{
 const h='latitude,longitude,acq_date,acq_time,confidence,frp,instrument\n';assert.equal(parseFirmsCSV(h+',113.9,2026-10-17,1000,h,2,VIIRS',1).length,0);assert.equal(parseFirmsCSV(h+'-2.2,113.9,2026-10-17,,h,2,VIIRS',1).length,0);assert.equal(parseFirmsCSV(h+'-2.2,113.9,2026-10-17,1000,,2,VIIRS',1).length,0);
});
test('strict 24h excludes older, future and low confidence without treating age as fetch time',()=>{
 const rows=[['old',113,-2,now-86400001,1,2,1,0,0],['edge',113,-2,now-86400000,1,2,1,0,0],['future',113,-2,now+1,1,2,1,0,0],['low',113,-2,now,1,0,1,0,0]];
 assert.deepEqual(filterRows(rows,{now,hours:24,confidence:1}).map(x=>x[0]),['edge']);
});
test('country containment respects polygon holes and excludes neighbouring country',()=>{
 const geom={type:'Polygon',coordinates:[[[0,0],[10,0],[10,10],[0,10],[0,0]],[[3,3],[7,3],[7,7],[3,7],[3,3]]]};
 assert.equal(pointInGeometry([1,1],geom),true);assert.equal(pointInGeometry([5,5],geom),false);assert.equal(pointInGeometry([11,1],geom),false);
});
test('citizen normalization excludes training and never exposes reporter location',()=>{
 const f={geometry:{coordinates:[113,-2]},properties:{pkey:'a',created_at:'2026-10-17T09:00Z',is_training:true,report_data:{personLocation:{lat:1,lng:2}},text:'test',tags:{city:'Kobar'}}};
 assert.equal(normalizeCitizen(f),null);f.properties.is_training=false;const out=normalizeCitizen(f);assert.ok(out);assert.equal(out.officialVerification,false);assert.equal(JSON.stringify(out).includes('personLocation'),false);
});
test('merging deduplicates exact observations without collapsing different satellites',()=>{
 const a=['a',113,-2,now,1,1,1,0,0],b=['b',113,-2,now,1,1,2,0,0];assert.equal(mergeRows([a],[a,b]).length,2);
});
test('refresh preserves stable IDs and municipality on known observations',()=>{
 const existing=['stable-hash',113,-2,now,1,1,1,0,42],fresh=['fresh-key',113,-2,now,2,1,1,0,-1];const [r]=mergeRows([existing],[fresh]);assert.equal(r[0],'stable-hash');assert.equal(r[8],42);assert.equal(r[4],2);
});
test('repeated suppression at same point on different dates has distinct IDs and preserves source status',()=>{
 const f={geometry:{coordinates:[115,-2]},properties:{tanggal:'2026-10-16',lokasi:'Desa A',catatan:'Api Padam'}};
 const a=normalizeSuppression(f,'2026-10-10','2026-10-17');f.properties.tanggal='2026-10-15';const b=normalizeSuppression(f,'2026-10-10','2026-10-17');assert.notEqual(a.id,b.id);assert.equal(a.sourceStatus,'Api Padam');assert.equal(normalizeSuppression(f,'2026-10-16','2026-10-17'),null);
});
test('Kobar missing coordinate is absent and locale decimal area is retained',()=>{
 const out=normalizeKobar({id:1,tanggal:'2026-10-16',lat:null,lng:null,lahan_dipadamkan:'0,50'},'2026-10-10','2026-10-17');assert.equal(out.coordinates,null);assert.equal(out.areaExtinguishedHa,.5);
});
test('embedded dashboard JSON extraction respects semicolons and escaped strings',()=>{
 assert.deepEqual(extractAssignedJSON('window.penangananData = [{"note":"a; [b] \\"hi\\""}]; console.log(1);','penangananData'),[{note:'a; [b] "hi"'}]);
});
test('CSV neutralizes formula injection and escapes quotes',()=>{
 const csv=toCSV([['=IMPORTXML("bad")','a,b','line\nbreak',null]]);assert.ok(csv.includes("'=IMPORTXML"));assert.ok(csv.includes('"a,b"'));assert.ok(csv.includes('"line\nbreak"'));assert.ok(!csv.includes('null'));
});
test('CSV retains negative numeric coordinates as usable GIS numbers',()=>{
 const csv=toCSV([[-2.25,113.9,'-SUM(1,2)']]);assert.ok(csv.startsWith('\uFEFF-2.25,113.9,'));assert.ok(csv.includes("'-SUM"));
});
test('nearest facilities ignores absent and invalid coordinates',()=>{
 const r=nearestFacilities([113,-2],[{id:'bad',coordinates:null},{id:'bad2',coordinates:[0,0]},{id:'far',coordinates:[114,-2]},{id:'near',coordinates:[113.01,-2]}]);assert.equal(r[0].id,'near');assert.equal(r.length,2);assert.ok(r[0].distanceKm<2);
});
test('unknown shared ID still restores camera coordinates',()=>{
 const r=resolveShared(new URLSearchParams('id=unavailable&lon=113.5&lat=-2.3&zoom=11'),{rows:[]},{},null);assert.equal(r.item,null);assert.deepEqual(r.camera.center,[113.5,-2.3]);assert.equal(r.camera.zoom,11);
});
test('shared BMKG observation restores real snapshot point',()=>{
 const b={rows:[{longitude:113.5,latitude:-2.3,date_raw:'2026-10-17',time_raw:'10:10'}]};const r=resolveShared(new URLSearchParams('id=bmkg-0&kind=bmkg&lon=113.5&lat=-2.3'),{rows:[]},{},b);assert.equal(r.item.kind,'bmkg');assert.deepEqual(r.item.coordinates,[113.5,-2.3]);
});
