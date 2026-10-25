import {validCoordinates} from './fire-data.mjs';
export const latestRows=rows=>[...rows].sort((a,b)=>b[3]-a[3]||(b[4]??-1)-(a[4]??-1)||String(a[0]).localeCompare(String(b[0])));
export function groupHotspots(rows,data){
 const groups=new Map();
 for(const r of rows){const id=`${r[7]}:${r[8]}`,name=data.municipalities[r[8]]||data.provinces[r[7]]||'Wilayah belum dipetakan';let g=groups.get(id);if(!g){g={id,name,province:data.provinces[r[7]],count:0,latest:0,maxFRP:null,bounds:[[r[1],r[2]],[r[1],r[2]]],row:r};groups.set(id,g);}g.count++;if(r[3]>g.latest){g.latest=r[3];g.row=r;}if(r[4]!==null)g.maxFRP=Math.max(g.maxFRP??0,r[4]);g.bounds[0][0]=Math.min(g.bounds[0][0],r[1]);g.bounds[0][1]=Math.min(g.bounds[0][1],r[2]);g.bounds[1][0]=Math.max(g.bounds[1][0],r[1]);g.bounds[1][1]=Math.max(g.bounds[1][1],r[2]);}
 return [...groups.values()].sort((a,b)=>b.latest-a.latest||b.count-a.count||a.name.localeCompare(b.name));
}
export function parseCoordinateSearch(query){const parts=query.trim().split(/[,;\s]+/);if(parts.length!==2||parts.some(x=>x===''||!Number.isFinite(Number(x))))return null;const [a,b]=parts.map(Number);return validCoordinates([b,a])?[b,a]:validCoordinates([a,b])?[a,b]:null;}
export function coordinateDMS([lon,lat]){const one=(v,positive,negative)=>{const ticks=Math.round(Math.abs(v)*36000),deg=Math.floor(ticks/36000),min=Math.floor(ticks%36000/600),sec=(ticks%600/10).toFixed(1).padStart(4,'0');return `${deg}°${String(min).padStart(2,'0')}′${sec}″${v<0?negative:positive}`;};return `${one(lat,'N','S')} ${one(lon,'E','W')}`;}
export function observationBrief(r,data,url){return ['Fire Tracker · Observasi satelit, belum terkonfirmasi di lapangan',`Lokasi: ${data.municipalities[r[8]]||'Wilayah belum dipetakan'}, ${data.provinces[r[7]]||'Indonesia'}`,`Koordinat: ${r[2].toFixed(6)}, ${r[1].toFixed(6)}`,`DMS: ${coordinateDMS([r[1],r[2]])}`,`Waktu pengamatan UTC: ${new Date(r[3]).toISOString()}`,`Sensor: ${data.sources[r[6]]?.name||'Tidak tersedia'}`,`Kepercayaan deteksi: ${['Rendah','Nominal','Tinggi'][r[5]]}`,`FRP: ${r[4]===null?'tidak tersedia':r[4]+' MW'}`,'Deteksi panas dapat berasal dari api, industri atau gunung api. Bukan batas api atau status pemadaman.',url].join('\n');}
export function validateSnapshot(data){
 if(!data||!Array.isArray(data.rows)||!Array.isArray(data.sources)||!Array.isArray(data.provinces)||!Array.isArray(data.municipalities)||!Number.isFinite(Date.parse(data.retrievedAt)))throw new Error('Format snapshot tidak dikenali');
 if(data.rows.some(r=>!Array.isArray(r)||r.length<9||!validCoordinates([r[1],r[2]])||!Number.isFinite(r[3])||!Number.isInteger(r[5])||r[5]<0||r[5]>2||!Number.isInteger(r[6])||r[6]<0||r[6]>=data.sources.length||!Number.isInteger(r[7])||r[7]<0||r[7]>=data.provinces.length||!Number.isInteger(r[8])||r[8]<-1||r[8]>=data.municipalities.length||r[4]!==null&&!Number.isFinite(r[4])))throw new Error('Observasi tidak valid');
 return data;
}
