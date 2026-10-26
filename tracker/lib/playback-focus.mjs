import {validCoordinates} from './fire-data.mjs';

// Playback stops use (previous clock, next clock] intervals. The visual
// histogram uses [start, end), so its counts cannot schedule exact-edge stops.
export function playbackBins(rows, {start,anchor}) {
 const bins=Array.from({length:24},()=>({count:0}));
 if(!Number.isFinite(start)||!Number.isFinite(anchor)||anchor<=start)return bins;
 const width=(anchor-start)/24;
 for(const r of rows){
  if(!Array.isArray(r)||!validCoordinates([r[1],r[2]])||!Number.isFinite(r[3])||r[3]<start||r[3]>anchor)continue;
  bins[Math.min(23,Math.max(0,Math.ceil((r[3]-start)/width)-1))].count++;
 }
 return bins;
}

// Only the interval already revealed by the playback clock can drive the camera.
export function playbackFocus(rows, data, {start,end,anchor}) {
 if (![start,end,anchor].every(Number.isFinite)||anchor<=start||end<start||end>anchor) return null;
 const from=Math.max(start,end-(anchor-start)/24);
 const revealed=rows.filter(r=>Array.isArray(r)&&validCoordinates([r[1],r[2]])&&Number.isFinite(r[3])&&r[3]<=end&&(r[3]>from||from===start&&r[3]===start));
 revealed.sort((a,b)=>b[3]-a[3]||String(a[0]).localeCompare(String(b[0])));
 const row=revealed[0];if(!row)return null;
 // Keep one local scene readable even when the municipality spans distant areas.
 const nearby=revealed.filter(r=>Math.abs(r[2]-row[2])<=.18&&Math.abs(r[1]-row[1])*Math.cos(row[2]*Math.PI/180)<=.18);
 const bounds=nearby.reduce((b,r)=>[[Math.min(b[0][0],r[1]),Math.min(b[0][1],r[2])],[Math.max(b[1][0],r[1]),Math.max(b[1][1],r[2])]],[[row[1]-.018,row[2]-.014],[row[1]+.018,row[2]+.014]]);
 return {key:`${row[0]}:${row[3]}`,row,name:data.municipalities?.[row[8]]||data.provinces?.[row[7]]||'Titik pengamatan',province:data.provinces?.[row[7]]||'Indonesia',center:[row[1],row[2]],bounds,count:nearby.length,intervalCount:revealed.length,observedAt:row[3]};
}

export function nextPlaybackProgress(bins, progress) {
 const current=Number.isFinite(progress)?Math.max(0,Math.min(100,progress)):0;
 if(!Array.isArray(bins)||!bins.length)return 100;
 const next=bins.findIndex((b,i)=>b.count>0&&(i+1)*100/bins.length>current+1e-7);
 return next<0?100:(next+1)*100/bins.length;
}
