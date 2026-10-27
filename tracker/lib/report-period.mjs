// Derive the displayed period from the current filtered report cards, not snapshot metadata.
export function reportPeriod(rows){
 const dates=rows.map(r=>r.reportedAt||r.date||r.sourceTime).filter(t=>typeof t==='string'&&Number.isFinite(Date.parse(t))).sort((a,b)=>Date.parse(a)-Date.parse(b));
 return dates.length?{from:dates[0],to:dates.at(-1)}:null;
}
