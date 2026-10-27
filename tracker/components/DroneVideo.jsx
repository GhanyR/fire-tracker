'use client';

/* eslint-disable @next/next/no-img-element -- MJPEG requires the browser's native multipart image reader. */
import {useCallback,useEffect,useRef,useState} from 'react';
import {Camera,ChevronRight,Link2,Radio,Unplug,VideoOff,X} from 'lucide-react';
import {cameraTelemetry,createWhepSession,normalizeCameraStreams,releaseCameraMedia,validateCameraUrl} from '../lib/video-stream.mjs';

const statusLabels={idle:'Belum dihubungkan',connecting:'Menghubungkan kamera…',playing:'Video sedang diputar',receiving:'Gambar diterima',buffering:'Menunggu gambar baru…',paused:'Video dijeda',ended:'Tayangan berakhir',error:'Kamera tidak tersedia'};
const metric=value=>new Intl.NumberFormat('id-ID',{maximumFractionDigits:1}).format(value);
const telemetryTime=value=>typeof value==='number'&&Number.isFinite(value)&&value>0&&!Number.isNaN(new Date(value).getTime())?new Intl.DateTimeFormat('id-ID',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',second:'2-digit',timeZoneName:'short'}).format(value):null;

export default function DroneVideo({drone,onClose}){
 // Changing the selected unit also clears its temporary reader token.
 return <CameraSession key={drone?.id||'no-drone'} drone={drone} onClose={onClose}/>;
}

function CameraSession({drone,onClose}){
 const streams=normalizeCameraStreams(drone?.streams);
 const [selectedId,setSelectedId]=useState(()=>streams[0]?.id||''),[status,setStatus]=useState('idle'),[error,setError]=useState(''),[token,setToken]=useState(''),[activeKey,setActiveKey]=useState('');
 const selected=streams.find(stream=>stream.id===selectedId)||streams[0];
 const sourceKey=selected?JSON.stringify([drone?.id,selected.id,selected.url,selected.protocol,selected.kind]):'';
 const [previousSourceKey,setPreviousSourceKey]=useState(sourceKey);
 const videoRef=useRef(null),imageRef=useRef(null),dialogRef=useRef(null),closeRef=useRef(null),connectionRef=useRef(null),onCloseRef=useRef(onClose);
 if(previousSourceKey!==sourceKey){setPreviousSourceKey(sourceKey);setStatus('idle');setError('');setActiveKey('');setToken('');}
 useEffect(()=>{onCloseRef.current=onClose;},[onClose]);
 const shownStatus=activeKey&&activeKey!==sourceKey?'idle':status;
 const connected=!!activeKey&&activeKey===sourceKey&&!['idle','error','ended'].includes(shownStatus);
 const hasImage=['playing','receiving'].includes(shownStatus)&&activeKey===sourceKey;
 const telemetry=cameraTelemetry(drone),time=telemetryTime(drone?.time);
 const coordinates=typeof drone?.lat==='number'&&Number.isFinite(drone.lat)&&Math.abs(drone.lat)<=90&&typeof drone?.lon==='number'&&Number.isFinite(drone.lon)&&Math.abs(drone.lon)<=180?`${drone.lat.toFixed(5)}, ${drone.lon.toFixed(5)}`:null;

 const stop=useCallback(()=>{
  const connection=connectionRef.current;connectionRef.current=null;
  if(!connection)return;
  connection.active=false;
  for(const cleanup of connection.cleanups)cleanup();
  void connection.whep?.stop();
  releaseCameraMedia({video:connection.video,image:connection.image,hls:connection.hls});
 },[]);
 const close=useCallback(()=>{stop();onCloseRef.current?.();},[stop]);
 const disconnect=()=>{stop();setStatus('idle');setError('');setActiveKey('');};

 useEffect(()=>{
  // Metadata may change without changing a drone ID. Each new source needs a click.
  return stop;
 },[sourceKey,stop]);

 useEffect(()=>{
  const previous=document.activeElement;closeRef.current?.focus();
  const keydown=event=>{
   if(event.key==='Escape'){event.preventDefault();close();return;}
   if(event.key!=='Tab')return;
   const items=[...dialogRef.current.querySelectorAll('button:not([disabled]),input:not([disabled]),video[controls],[tabindex="0"]')].filter(element=>element.getClientRects().length);
   const first=items[0],last=items.at(-1);
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  };
  const dialog=dialogRef.current;dialog.addEventListener('keydown',keydown);
  return()=>{dialog.removeEventListener('keydown',keydown);if(previous?.isConnected)previous.focus();};
 },[close]);

 const connect=async event=>{
  event?.preventDefault();if(!selected)return;
  stop();setError('');
  let url;try{url=validateCameraUrl(selected.url,window.location.protocol);}catch(reason){setStatus('error');setError(reason.message);setActiveKey(sourceKey);return;}
  const video=videoRef.current,image=imageRef.current;
  const connection={active:true,cleanups:[],video,image,hls:null,whep:null};connectionRef.current=connection;
  setActiveKey(sourceKey);setStatus('connecting');
  const current=()=>connection.active&&connectionRef.current===connection;
  const update=next=>{if(current())setStatus(next);};
  const fail=message=>{if(!current())return;stop();setStatus('error');setError(message);};
  const listen=(target,name,callback)=>{target.addEventListener(name,callback);connection.cleanups.push(()=>target.removeEventListener(name,callback));};
  let lastFrame=0,started=false,stalledAt=0,frameCallback;
  const received=()=>{lastFrame=Date.now();stalledAt=0;if(current()&&!video.paused)update('playing');};
  const playing=()=>{started=true;received();};
  const waiting=()=>{if(started){stalledAt=stalledAt||Date.now();update('buffering');}};
  const play=()=>{if(current())void video.play().catch(()=>fail('Browser menahan pemutaran video. Hubungkan kembali untuk mencoba.'));};
  // Every timer/listener is owned by this connection and removed before clearing media.
  const startup=setTimeout(()=>fail('Belum ada gambar diterima. Periksa sumber kamera dan izin CORS.'),25000);
  connection.cleanups.push(()=>clearTimeout(startup));
  try{
   if(selected.protocol==='mjpeg'){
    listen(image,'load',()=>{clearTimeout(startup);update('receiving');});
    listen(image,'error',()=>fail('Gambar MJPEG tidak dapat dibuka. Periksa sumber kamera dan akses jaringan.'));
    image.src=url;return;
   }
   listen(video,'playing',()=>{clearTimeout(startup);playing();});
   listen(video,'waiting',waiting);listen(video,'stalled',waiting);
   listen(video,'pause',()=>{if(started&&current())update('paused');});
   listen(video,'ended',()=>{if(current()){stop();setStatus('ended');setError('Sumber tidak lagi mengirim video. Hubungkan kembali untuk mencoba.');}});
   listen(video,'error',()=>fail('Video tidak dapat diputar. Periksa sumber, codec, dan izin CORS.'));
   listen(video,'timeupdate',()=>{if(typeof video.requestVideoFrameCallback!=='function'&&!video.paused&&video.currentTime!==connection.lastTime){connection.lastTime=video.currentTime;received();}});
   if(typeof video.requestVideoFrameCallback==='function'){
    const frame=()=>{if(!current())return;received();frameCallback=video.requestVideoFrameCallback(frame);};
    frameCallback=video.requestVideoFrameCallback(frame);connection.cleanups.push(()=>video.cancelVideoFrameCallback(frameCallback));
   }
   const watchdog=setInterval(()=>{
    if(!current()||!started||video.paused)return;
    const delay=Date.now()-lastFrame;
    if(delay>12000){stalledAt=stalledAt||Date.now();update('buffering');}
    if(stalledAt&&Date.now()-stalledAt>15000)fail('Gambar tidak lagi diperbarui. Periksa koneksi lalu hubungkan kembali.');
   },2000);
   connection.cleanups.push(()=>clearInterval(watchdog));
   video.muted=true;
   if(selected.protocol==='whep'){
    if(typeof RTCPeerConnection==='undefined')throw new Error('WebRTC belum tersedia di browser ini.');
    connection.whep=createWhepSession({url,token,pageProtocol:window.location.protocol,onTrack:trackEvent=>{
     if(!current())return;
     video.srcObject=trackEvent.streams?.[0]||new MediaStream([trackEvent.track]);
     listen(trackEvent.track,'ended',()=>fail('Jalur video kamera telah berakhir.'));
     listen(trackEvent.track,'mute',waiting);play();
    },onConnectionState:state=>{if(['failed','disconnected','closed'].includes(state))fail('Koneksi WebRTC terputus. Hubungkan kembali untuk mencoba.');}});
    await connection.whep.start();
   }else if(selected.protocol==='hls'&&!video.canPlayType('application/vnd.apple.mpegurl')){
    const {default:Hls}=await import('hls.js');if(!current())return;
    if(!Hls.isSupported())throw new Error('HLS belum didukung browser ini. Pilih sumber lain.');
    const hls=new Hls({enableWorker:true});connection.hls=hls;
    hls.on(Hls.Events.ERROR,(_event,data)=>{if(data.fatal)fail('Koneksi HLS gagal. Periksa playlist, segmen video, codec, dan izin CORS.');});
    hls.on(Hls.Events.MANIFEST_PARSED,play);hls.loadSource(url);hls.attachMedia(video);
   }else{video.src=url;video.load();play();}
  }catch(reason){if(current())fail(reason.name==='AbortError'?'Koneksi kamera melewati batas waktu. Coba hubungkan kembali.':reason.name==='Error'?reason.message:'Kamera tidak dapat dihubungkan. Periksa sumber dan jaringan.');}
 };

 return <div className="drone-video-overlay" onPointerDown={event=>{if(event.target===event.currentTarget)close();}}>
  <section className="drone-video" role="dialog" aria-modal="true" aria-labelledby="drone-video-title" aria-describedby="drone-video-note" ref={dialogRef}>
   <header className="drone-video-header"><div className="drone-video-title"><span><Camera size={14}/> KAMERA UAV</span><h2 id="drone-video-title">{drone?.name||drone?.id||'Kamera drone'}</h2>{drone?.name&&<small>{drone.id}</small>}</div><button type="button" ref={closeRef} className="drone-video-close" onClick={close} aria-label="Tutup kamera"><X size={20}/></button></header>
   <div className="drone-video-body">
    <div className={`drone-video-stage ${hasImage?'has-image':''}`}>
     <video ref={videoRef} className={selected?.protocol==='mjpeg'?'drone-video-hidden':''} preload="none" muted playsInline controls={connected} aria-label={`Video kamera ${selected?.label||'drone'}`}/>
     <img ref={imageRef} className={selected?.protocol!=='mjpeg'?'drone-video-hidden':''} alt={`Tayangan kamera ${selected?.label||'drone'}`} referrerPolicy="no-referrer"/>
     <div className="drone-video-source-hud"><span><Camera size={13}/>{selected?selected.kind.toUpperCase():'KAMERA'}</span>{selected&&<strong>{selected.label}</strong>}</div>
     {!hasImage&&<div className="drone-video-unavailable"><span className={shownStatus==='connecting'?'camera-is-connecting':''}>{['error','ended'].includes(shownStatus)?<VideoOff size={32}/>:<Camera size={32} strokeWidth={1.3}/>}</span><h3>{!selected?'Belum ada kamera':shownStatus==='idle'?'Lihat dari udara':statusLabels[shownStatus]}</h3><p>{!selected?'Unit ini belum mengirim sumber kamera. Tambahkan stream pada bridge untuk melihat tayangannya.':error||(shownStatus==='idle'?'Hubungkan sumber untuk membuka tayangan kamera unit ini.':shownStatus==='paused'?'Video tidak sedang berjalan.':'Gambar disembunyikan sampai video kembali berjalan.')}</p>{selected&&!connected&&<button type="button" className="drone-video-primary" onClick={connect}><Link2 size={15}/>Buka tayangan</button>}{shownStatus==='paused'&&connected&&<button type="button" className="drone-video-primary" onClick={()=>void videoRef.current.play().catch(()=>{stop();setStatus('error');setError('Pemutaran video belum berhasil. Hubungkan kembali untuk mencoba.');})}>Lanjutkan video</button>}</div>}
     {hasImage&&telemetry.length>0&&<dl className="drone-video-telemetry">{telemetry.map(item=><div key={item.key}><dt>{item.label}</dt><dd>{metric(item.value)}<small>{item.unit}</small></dd></div>)}</dl>}
     {hasImage&&<div className="drone-video-frame-note">{selected.protocol==='mjpeg'?'Waktu gambar MJPEG tidak tersedia':'Waktu pengambilan frame tidak tersedia'}</div>}
    </div>
    <aside className="drone-video-sidebar"><div className="drone-video-sidebar-heading"><span>SUMBER KAMERA</span><small>{streams.length} tersedia</small></div>
     <div className="drone-video-choices" role="radiogroup" aria-label="Pilih sumber kamera">{streams.map(stream=><button type="button" key={stream.id} role="radio" aria-checked={stream.id===selected?.id} onClick={()=>{disconnect();setSelectedId(stream.id);setToken('');}}><span className="drone-video-kind">{stream.kind.toUpperCase()}</span><span><strong>{stream.label}</strong><small>{stream.protocol.toUpperCase()}</small></span><ChevronRight size={14}/></button>)}</div>
     {!streams.length&&<p className="drone-video-empty-source">Alamat HLS, MJPEG, WHEP, atau MP4 belum diberikan.</p>}
     {selected&&<form className="drone-video-connect" onSubmit={connect}>{selected.protocol==='whep'&&<label>Token pembaca <small>opsional · hanya sesi ini</small><input type="password" aria-label="Token pembaca kamera" value={token} onChange={event=>setToken(event.target.value)} maxLength={4096} autoComplete="off" disabled={connected}/></label>}<button type={connected?'button':'submit'} className={connected?'drone-video-disconnect':'drone-video-primary'} onClick={connected?disconnect:undefined}>{connected?<><Unplug size={14}/>Putuskan kamera</>:<><Link2 size={14}/>Hubungkan kamera</>}</button></form>}
     <div className={`drone-video-status status-${shownStatus}`} role="status" aria-live="polite"><Radio size={14}/><div><strong>{statusLabels[shownStatus]}</strong><p>{error||(selected?new URL(selected.url).host:'Menunggu sumber dari bridge')}</p></div></div>
     <div className="drone-video-position"><span>TELEMETRI UNIT</span>{coordinates&&<code>{coordinates}</code>}{time&&<p>Waktu telemetri<br/><strong>{time}</strong></p>}{!coordinates&&!time&&<p>Telemetri belum tersedia.</p>}<small>Waktu telemetri terpisah dari waktu gambar kamera.</small></div>
    </aside>
   </div>
   <footer className="drone-video-footer" id="drone-video-note"><span>Latensi sumber tidak diketahui. Tayangan dapat tertunda.</span><span>Pantauan kamera · kendali penerbangan di aplikasi pilot</span></footer>
  </section>
 </div>;
}
