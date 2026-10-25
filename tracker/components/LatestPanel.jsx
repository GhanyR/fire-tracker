'use client';
import {useMemo,useState} from 'react';
import {ArrowUpRight,ChevronDown,Clock3,MapPin,Mountain,Search,SlidersHorizontal} from 'lucide-react';
import {groupHotspots,latestRows} from '../lib/discovery.mjs';
import {SCENES} from '../lib/terrain-scenes.mjs';
import {number,title,time,age,confidenceNames} from './format.mjs';
export default function LatestPanel({rows,data,hours,scope,scene,query,now,refreshing,lastChecked,feedError,onSelect,onArea,onClear,onScene,onTab}){
 const [mode,setMode]=useState('wilayah'),[limit,setLimit]=useState(20);
 const groups=useMemo(()=>data?groupHotspots(rows,data):[],[rows,data]);
 const latest=useMemo(()=>latestRows(rows),[rows]);const newest=latest[0]?.[3];const snapshotLatest=data?.latestObservedAt?Date.parse(data.latestObservedAt):0;const stale=snapshotLatest>0&&snapshotLatest<now-hours*3600000;
 return <div className="latest-panel">
  <div className="section-eyebrow">PANTAUAN INDONESIA <span className="quiet-tag">NASA FIRMS</span></div>
  <div className="discovery-heading"><h2>Hotspot terbaru</h2><button aria-label="Buka filter dan lapisan" onClick={()=>onTab('lapisan')}><SlidersHorizontal size={16}/></button></div>
  <p className="discovery-scope">{query?`Hasil “${query}”`:scene?.name||scope||'Seluruh Indonesia'} · {hours===168?'7 hari terakhir':`${hours} jam terakhir`}</p>
  <div className="discovery-total"><strong>{data?number(rows.length):'—'}</strong><div><span>deteksi panas satelit</span><small>{number(groups.length)} kabupaten / wilayah</small></div></div>
  <div className="freshness"><Clock3 size={13}/><div><strong>{newest?time(newest):stale?'Data tersimpan sudah di luar jendela waktu':'Tidak ada deteksi sesuai filter'}</strong><span>{newest?`Pengamatan terbaru · ${age(newest,now)}`:stale?`Pengamatan terakhir: ${time(snapshotLatest)}`:'Coba perluas wilayah atau waktu.'}</span></div></div>
  {feedError&&<p className="feed-warning">Pembaruan belum tersedia. Snapshot: {data?.retrievedAt?time(data.retrievedAt):'belum diketahui'}.</p>}
  {(scene||scope||query)&&<button className="clear-scope" onClick={onClear}>Lihat seluruh Indonesia<ArrowUpRight size={12}/></button>}
  <div className="discovery-switch segmented"><button className={mode==='wilayah'?'selected':''} onClick={()=>{setMode('wilayah');setLimit(20);}}>Per wilayah <b>{number(groups.length)}</b></button><button className={mode==='titik'?'selected':''} onClick={()=>{setMode('titik');setLimit(20);}}>Titik terbaru</button></div>
  <p className="list-caption">Urut berdasarkan waktu pengamatan terbaru</p>
  <div className="hotspot-list">{mode==='wilayah'?groups.slice(0,limit).map(g=><button className="hotspot-row" key={g.id} onClick={()=>onArea(g)}><span className="hotspot-dot"/><div><strong>{title(g.name)}</strong><span>{title(g.province)}</span><small>{time(g.latest)}</small></div><div className="hotspot-count"><b>{number(g.count)}</b><span>deteksi</span><ArrowUpRight size={13}/></div></button>):latest.slice(0,limit).map(r=><button className="hotspot-row" key={r[0]} onClick={()=>onSelect({kind:'satellite',row:r,coordinates:[r[1],r[2]],id:r[0]})}><span className={`hotspot-dot confidence-${r[5]}`}/><div><strong>{title(data.municipalities[r[8]]||data.provinces[r[7]])}</strong><span>{data.sources[r[6]]?.name} · {confidenceNames[r[5]]}</span><small>{time(r[3])}</small></div><ArrowUpRight size={14}/></button>)}</div>
  {rows.length===0&&<div className="empty-list"><Search size={22}/><p>Tidak ada observasi untuk pencarian ini.</p><span>Ketiadaan deteksi bukan bukti tidak ada kebakaran.</span></div>}
  {(mode==='wilayah'?groups.length:latest.length)>limit&&<button className="wide-button" onClick={()=>setLimit(n=>n+30)}>Tampilkan berikutnya<ChevronDown size={13}/></button>}
  <details className="terrain-presets"><summary><Mountain size={14}/>Jelajahi medan 3D<ChevronDown size={13}/></summary><p>Pilih area untuk memusatkan peta dan menyaring data.</p>{SCENES.map(s=><button key={s.id} onClick={()=>onScene(s)}>{s.name}<ArrowUpRight size={12}/></button>)}</details>
  <p className="discovery-note">Deteksi satelit perlu verifikasi lapangan. Jumlah titik bukan jumlah kebakaran atau luas terbakar.</p>
  <p className="sync-note">{refreshing?'Memeriksa pembaruan…':lastChecked?`Diperiksa ${time(lastChecked)}`:'Menyiapkan data…'}<br/>Data nasional diperbarui terjadwal tiap 3 jam.</p>
 </div>;
}
