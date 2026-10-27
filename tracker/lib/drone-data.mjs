const finite=(x,min=-Infinity,max=Infinity)=>typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max?x:null;
const text=(x,max=64)=>typeof x==='string'?x.replace(/[\u0000-\u001f]/g,'').slice(0,max):'';
function cameraStreams(value){
 if(!Array.isArray(value))return [];const ids=new Set();return value.slice(0,4).flatMap(p=>{
  if(!p||typeof p!=='object'||Array.isArray(p)||!['eo','ir'].includes(p.kind)||!['hls','mjpeg','whep','mp4'].includes(p.protocol))return [];
  const id=text(p.id,40);if(!id||ids.has(id)||typeof p.url!=='string'||p.url.length>2048||/[\u0000-\u0020]/.test(p.url))return [];
  let url,path;try{url=new URL(p.url);path=decodeURIComponent(url.pathname);}catch{return [];}if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.hash||/(?:^|\/)(?:commands?|arm|disarm|takeoff|land|reboot|control)(?:\/|$)/i.test(path)||[...url.searchParams.keys()].some(k=>/token|secret|key|auth|password|^(?:cmd|command|action|control)$/i.test(k)))return [];
  ids.add(id);return [{id,label:text(p.label,80),kind:p.kind,protocol:p.protocol,url:p.url}];
 });
}
export function normalizeDrone(p,now=Date.now()){
 if(!p||typeof p!=='object'||Array.isArray(p))return null;
 const id=text(p.id),lat=finite(p.lat,-90,90),lon=finite(p.lon,-180,180);
 const match=typeof p.t==='string'&&/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(?:Z|\+00:00)$/.exec(p.t);
 const canonical=match?match[1]+'.'+(match[2]||'').padEnd(3,'0').slice(0,3)+'Z':null;const time=canonical?Date.parse(canonical):NaN;
 if(!Number.isFinite(time)||new Date(time).toISOString()!==canonical)return null;
 if(!id||lat===null||lon===null||!Number.isFinite(time)||time>now+10000)return null;
 return {id,lat,lon,time,t:p.t,alt:finite(p.alt,-1000,25000),alt_msl:finite(p.alt_msl,-1000,30000),hdg:finite(p.hdg,0,360),spd:finite(p.spd,0,500),bat:finite(p.bat,0,100),armed:typeof p.armed==='boolean'?p.armed:null,mode:text(p.mode,32),model:text(p.model),link:text(p.link,32),simulated:p.simulated===true||p.link==='sim',name:text(p.name,80),mission:text(p.mission,160),airframe:['multirotor','fixed-wing'].includes(p.airframe)?p.airframe:'unknown',flightStatus:['airborne','landed'].includes(p.flightStatus)?p.flightStatus:'unknown',linkQuality:finite(p.linkQuality,0,100),streams:cameraStreams(p.streams)};
}
const sourceOrder=d=>{const m=typeof d.t==='string'&&/^(.*T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(?:Z|\+00:00)$/.exec(d.t);return m?Date.parse(m[1]+'Z')*1000+Number((m[2]||'').padEnd(6,'0')):d.time*1000;};
export function mergeDroneFrame(previous,frame,now=Date.now()){
 const incoming=Array.isArray(frame)?frame:Array.isArray(frame?.drones)?frame.drones:frame?.type==='telemetry'?[frame]:[];
 const map=new Map(previous.map(d=>[d.id,d]));
 for(const p of incoming.slice(-1000)){const d=normalizeDrone(p,now);if(!d)continue;const old=map.get(d.id);if(old&&sourceOrder(d)<sourceOrder(old))continue;if(old&&sourceOrder(d)===sourceOrder(old)){d.lat=old.lat;d.lon=old.lon;}
  const trail=old?.trail||[];const changed=!old||sourceOrder(d)>sourceOrder(old);
  map.set(d.id,{...d,trail:changed?[...trail,[d.lon,d.lat,d.time]].slice(-80):trail});
 }
 return [...map.values()].sort((a,b)=>b.time-a.time||a.id.localeCompare(b.id)).slice(0,100);
}
export function droneFreshness(drone,now=Date.now()){if(drone.simulated)return 'demo';const age=now-drone.time;return age>60000?'stale':age>15000?'delayed':'fresh';}
export function validateBridgeUrl(value,protocol='https:'){
 let url;try{url=new URL(value);}catch{throw new Error('Masukkan alamat WebSocket bridge yang lengkap.');}
 if(!['ws:','wss:'].includes(url.protocol))throw new Error('Alamat harus diawali wss:// (atau ws:// dari dashboard lokal).');
 if(protocol==='https:'&&url.protocol!=='wss:')throw new Error('Situs HTTPS memerlukan wss://. Untuk bridge lokal, buka dashboard dari http://127.0.0.1:8787.');
 if(url.username||url.password||[...url.searchParams.keys()].some(k=>/token|secret|key|auth|password/i.test(k)))throw new Error('Letakkan token di kolom token, bukan di alamat.');
 return url.href;
}
export function demoDrones(elapsedMs,now=Date.now()){
 const units=[['Rajawali','Survei perimeter','fixed-wing',92,160,18],['Elang','Pemetaan asap','fixed-wing',78,210,21],['Garuda','Pengamatan sektor utara','fixed-wing',65,180,19],['Merpati','Pemantauan jalur evakuasi','multirotor',84,95,8.4],['Kestrel','Observasi dekat regu','multirotor',53,75,7],['Maleo','Cadangan di titik kumpul','multirotor',97,0,0]];
 return units.map(([name,mission,airframe,bat,alt,spd],i)=>{const landed=i===5,a=elapsedMs/(80000+i*26000)+i*Math.PI/3,r=.006+i*.003;return {type:'telemetry',id:`DEMO-0${i+1}`,name,mission,airframe,flightStatus:landed?'landed':'airborne',linkQuality:96-i*5,streams:[],lat:landed?-8.026:-8.015+Math.cos(a)*r,lon:landed?112.948:112.955+Math.sin(a)*r/Math.cos(-8.015*Math.PI/180),alt,alt_msl:null,hdg:landed?null:(a*180/Math.PI+90)%360,spd,bat,mode:landed?'Demo siaga':'Demo pemantauan',armed:!landed,model:airframe==='fixed-wing'?'Fixed-wing contoh':'Quadcopter contoh',link:'sim',simulated:true,t:new Date(now).toISOString()};});
}

export function shareCamera({selectedCoordinates,camera,demo=false,hasLiveSession=false}){return selectedCoordinates||(demo?[112.955,-8.015]:hasLiveSession?null:[camera.lon,camera.lat]);}

export function fleetTelemetryStatus(drone,feed={}){
 const now=feed.now??Date.now(),age=Math.max(0,Math.floor((now-drone.time)/1000));
 if(drone.simulated)return {state:'demo',label:'SIMULASI ARMADA',age};
 if(feed.status!=='connected')return {state:feed.status||'idle',label:feed.status==='reconnecting'?'KONEKSI TERPUTUS':feed.status==='connecting'?'MENGHUBUNGKAN':'TELEMETRI TERPUTUS',age};
 const state=droneFreshness(drone,now);
 return {state,label:state==='stale'?'GPS LAMA':state==='delayed'?'GPS TERTUNDA':'GPS TERKINI',age};
}
