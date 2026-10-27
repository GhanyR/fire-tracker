import {distanceKm} from './fire-data.mjs';
const DAY=86400000;
export function normalizeWatch(value){
 const {lat,lon,radiusKm,minConfidence=1}=value||{};
 if(![lat,lon,radiusKm,minConfidence].every(Number.isFinite)||lat< -12||lat>7||lon<94||lon>142||radiusKm<1||radiusKm>100||![0,1,2].includes(minConfidence))throw new Error('Choose a point in Indonesia and a radius between 1 and 100 km.');
 return {name:String(value.name||'Saved area').trim().slice(0,60)||'Saved area',lat,lon,radiusKm,minConfidence};
}
export function nearbyObservations(data,watch,{now=Date.now(),after=now-DAY,limit=100}={}){
 if(!watch||!data?.rows)return [];
 const seen=new Set(),found=[];
 for(const row of data.rows){
  if(!Array.isArray(row)||typeof row[0]!=='string'||seen.has(row[0])||![row[1],row[2],row[3],row[5]].every(Number.isFinite)||Math.abs(row[2])>90||Math.abs(row[1])>180||row[3]<=after||row[3]>now||row[3]<now-DAY||row[5]<watch.minConfidence)continue;
  const km=distanceKm([watch.lon,watch.lat],[row[1],row[2]]);
  if(km<=watch.radiusKm){seen.add(row[0]);found.push({row,distanceKm:km,name:data.municipalities?.[row[8]]||data.provinces?.[row[7]]||'Satellite observation',sensor:data.sources?.[row[6]]?.name||'NASA FIRMS'});}
 }
 return found.sort((a,b)=>b.row[3]-a.row[3]||a.distanceKm-b.distanceKm).slice(0,limit);
}
export function watchCircle(watch){
 const w=normalizeWatch(watch),rad=Math.PI/180,lat=w.lat*rad,lon=w.lon*rad,d=w.radiusKm/6371,ring=[];
 for(let i=0;i<64;i++){const bearing=2*Math.PI*i/64,y=Math.asin(Math.sin(lat)*Math.cos(d)+Math.cos(lat)*Math.sin(d)*Math.cos(bearing)),x=lon+Math.atan2(Math.sin(bearing)*Math.sin(d)*Math.cos(lat),Math.cos(d)-Math.sin(lat)*Math.sin(y));ring.push([x/rad,y/rad]);}
 ring.push([...ring[0]]);return {type:'Feature',properties:{radiusKm:w.radiusKm},geometry:{type:'Polygon',coordinates:[ring]}};
}
