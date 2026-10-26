'use client';
import {useMemo,useState} from 'react';
import {ArrowUpRight,ChevronDown,Clock3,FileText,Globe2,MapPin,Mountain,Play,Search,SlidersHorizontal} from 'lucide-react';
import {groupHotspots,latestRows} from '../lib/discovery.mjs';
import {AGE_BANDS,ageBand} from '../lib/observation-time.mjs';
import {SCENES} from '../lib/terrain-scenes.mjs';
import {number,title,time,age,confidenceNames} from './format.mjs';
export default function LatestPanel({summary,range,actualNow,onPlay,onReport,onOverview,rows,data,hours,scope,scene,query,now,refreshing,lastChecked,feedError,onSelect,onArea,onClear,onScene,onTab}){
 const [mode,setMode]=useState('wilayah'),[limit,setLimit]=useState(20);
 const groups=summary.groups;
 const latest=useMemo(()=>latestRows(rows),[rows]);const newest=latest[0]?.[3];const snapshotLatest=data?.latestObservedAt?Date.parse(data.latestObservedAt):0;const stale=snapshotLatest>0&&snapshotLatest<now-hours*3600000;
 return <div className="latest-panel">
  <div className="section-eyebrow">SITUASI WILAYAH <span className="quiet-tag">{range.historical?'REKAMAN':'NASA FIRMS'}</span></div>
  <div className="discovery-heading"><h2>{hours===168?'Tujuh hari terakhir':hours+' jam terakhir'}</h2><button aria-label="Buka filter dan lapisan" onClick={()=>onTab('lapisan')}><SlidersHorizontal size={16}/></button></div>
  <p className="discovery-scope">{query?`Hasil “${query}”`:scene?.name||scope||'Seluruh Indonesia'} · {range.historical?'hingga '+time(range.end):'waktu pengamatan satelit'}</p>
  <div className="discovery-total"><strong>{data?number(rows.length):'—'}</strong><div><span>deteksi panas satelit</span><small>{number(groups.length)} kabupaten / wilayah</small></div></div>
  <div className="age-summary"><div className="age-summary-bar">{AGE_BANDS.map(b=><i key={b.id} style={{background:b.color,width:(summary.total?summary.byAge[b.id]/summary.total*100:0)+'%'}}/>)}</div><div className="age-summary-values">{AGE_BANDS.map(b=><div key={b.id}><span><i style={{background:b.color}}/>{b.label}</span><strong>{number(summary.byAge[b.id])}</strong></div>)}</div></div>
  <div className="freshness"><Clock3 size={14}/><div><strong>{newest?`Terakhir diamati ${age(newest,now)}`:stale?'Pengamatan tersimpan sudah lama':'Belum ada deteksi pada waktu ini'}</strong><span>{newest?time(newest):stale?time(snapshotLatest):'Perluas waktu atau wilayah untuk melihat riwayat.'}</span>{range.historical&&<span>Usia dihitung pada waktu pemutaran.</span>}</div></div>
  {!range.historical&&newest&&actualNow-newest>3*3600000?<p className="observation-gap">Belum ada pengamatan dalam 3 jam terakhir pada cakupan ini. Data satelit mengikuti lintasan; ini bukan video langsung.</p>:null}
  <div className="discovery-actions"><button className="situation-entry" onClick={onReport}><FileText size={14}/>Laporan situasi<ArrowUpRight size={13}/></button><button aria-label="Lihat sebaran Indonesia" onClick={onOverview}><Globe2 size={16}/></button></div>
  <button className="discovery-story" onClick={onPlay} disabled={!rows.length}><Play size={13} fill="currentColor"/>Lihat urutan pengamatan<ArrowUpRight size={12}/></button>
  {feedError&&<p className="feed-warning">Pembaruan belum tersedia. Snapshot: {data?.retrievedAt?time(data.retrievedAt):'belum diketahui'}.</p>}
  {(scene||scope||query)&&<button className="clear-scope" onClick={onClear}>Lihat seluruh Indonesia<ArrowUpRight size={12}/></button>}
  <div className="discovery-switch segmented"><button className={mode==='wilayah'?'selected':''} onClick={()=>{setMode('wilayah');setLimit(20);}}>Per wilayah <b>{number(groups.length)}</b></button><button className={mode==='titik'?'selected':''} onClick={()=>{setMode('titik');setLimit(20);}}>Titik terbaru</button></div>
  <p className="list-caption">{mode==='wilayah'?'Deteksi 0–3 jam lebih dulu, lalu pengamatan terbaru':'Urut berdasarkan waktu pengamatan terbaru'}</p>
  <div className="hotspot-list">{mode==='wilayah'?groups.slice(0,limit).map(g=><button className="hotspot-row" key={g.id} onClick={()=>onArea(g)}><span className={`hotspot-dot age-${ageBand(g.latest,now)}`}/><div><strong>{title(g.name)}</strong><span>{title(g.province)}</span><small><b className={`observation-age age-${ageBand(g.latest,now)}`}>{age(g.latest,now)}</b> {time(g.latest)}</small></div><div className="hotspot-count"><b>{number(g.count)}</b><span>deteksi</span>{g.freshCount>0&&<small>{number(g.freshCount)} · 0–3 jam</small>}<ArrowUpRight size={13}/></div></button>):latest.slice(0,limit).map(r=><button className="hotspot-row" key={r[0]} onClick={()=>onSelect({kind:'satellite',row:r,coordinates:[r[1],r[2]],id:r[0]})}><span className={`hotspot-dot age-${ageBand(r[3],now)}`}/><div><strong>{title(data.municipalities[r[8]]||data.provinces[r[7]])}</strong><span>{data.sources[r[6]]?.name} · {confidenceNames[r[5]]}</span><small><b className={`observation-age age-${ageBand(r[3],now)}`}>{age(r[3],now)}</b> {time(r[3])}</small></div><ArrowUpRight size={14}/></button>)}</div>
  {rows.length===0&&<div className="empty-list"><Search size={22}/><p>Tidak ada observasi untuk pencarian ini.</p><span>Ketiadaan deteksi bukan bukti tidak ada kebakaran.</span></div>}
  {(mode==='wilayah'?groups.length:latest.length)>limit&&<button className="wide-button" onClick={()=>setLimit(n=>n+30)}>Tampilkan berikutnya<ChevronDown size={13}/></button>}
  <details className="terrain-presets"><summary><Mountain size={14}/>Jelajahi medan 3D<ChevronDown size={13}/></summary><p>Pilih area untuk memusatkan peta dan menyaring data.</p>{SCENES.map(s=><button key={s.id} onClick={()=>onScene(s)}>{s.name}<ArrowUpRight size={12}/></button>)}</details>
  <p className="discovery-note">Deteksi satelit perlu verifikasi lapangan. Jumlah titik bukan jumlah kebakaran atau luas terbakar.</p>
  <p className="sync-note">{refreshing?'Memeriksa pembaruan…':lastChecked?`Diperiksa ${time(lastChecked)}`:'Menyiapkan data…'}<br/>Data nasional diperbarui terjadwal tiap 3 jam.</p>
 </div>;
}
