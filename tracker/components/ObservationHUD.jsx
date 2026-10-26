'use client';
import {Clock3,FileText,History} from 'lucide-react';
import {age,number,time} from './format.mjs';
export default function ObservationHUD({summary,range,now,playing,scope,onReport}){
 const historical=range.historical||playing,latest=summary.latest;
 return <div className={`observation-hud ${historical?'historical':''}`}><span className="observation-hud-icon">{historical?<History size={17}/>:<Clock3 size={17}/>}</span><div><span>{historical?'REKAMAN · '+scope:scope+' · '+(range.hours===168?'7 HARI':range.hours+' JAM')}</span><strong>{historical?time(range.end):latest?`Terakhir diamati ${age(latest,now)}`:'Belum ada pengamatan sesuai filter'}</strong><small>{historical?`${number(summary.total)} deteksi hingga waktu ini`:latest?time(latest):'Coba perluas waktu atau wilayah'}</small></div><button aria-label="Buka laporan situasi" onClick={onReport}><FileText size={16}/></button></div>;
}
