const finite=(x,min=-Infinity,max=Infinity)=>typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max?x:null;
const text=(x,max=64)=>typeof x==='string'?x.replace(/[\u0000-\u001f]/g,'').slice(0,max):'';
export function normalizeDrone(p,now=Date.now()){
 if(!p||typeof p!=='object'||Array.isArray(p))return null;
 const id=text(p.id),lat=finite(p.lat,-90,90),lon=finite(p.lon,-180,180);
 const match=typeof p.t==='string'&&/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(?:Z|\+00:00)$/.exec(p.t);
 const canonical=match?match[1]+'.'+(match[2]||'').padEnd(3,'0').slice(0,3)+'Z':null;const time=canonical?Date.parse(canonical):NaN;
 if(!Number.isFinite(time)||new Date(time).toISOString()!==canonical)return null;
 if(!id||lat===null||lon===null||!Number.isFinite(time)||time>now+10000)return null;
 return {id,lat,lon,time,t:new Date(time).toISOString(),alt:finite(p.alt,-1000,25000),alt_msl:finite(p.alt_msl,-1000,30000),hdg:finite(p.hdg,0,360),spd:finite(p.spd,0,500),bat:finite(p.bat,0,100),armed:typeof p.armed==='boolean'?p.armed:null,mode:text(p.mode,32),model:text(p.model),link:text(p.link,32),simulated:p.simulated===true||p.link==='sim'};
}
export function mergeDroneFrame(previous,frame,now=Date.now()){
 const incoming=Array.isArray(frame)?frame:Array.isArray(frame?.drones)?frame.drones:frame?.type==='telemetry'?[frame]:[];
 const map=new Map(previous.map(d=>[d.id,d]));
 for(const p of incoming.slice(-1000)){const d=normalizeDrone(p,now);if(!d)continue;const old=map.get(d.id);if(old&&d.time<old.time)continue;if(old&&d.time===old.time){d.lat=old.lat;d.lon=old.lon;}
  const trail=old?.trail||[];const changed=!old||d.time>old.time;
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
 return [0,1].map(i=>{const a=elapsedMs/(80000+i*26000)+i*Math.PI,r=.006+i*.003;return {type:'telemetry',id:`DEMO-0${i+1}`,lat:-8.015+Math.cos(a)*r,lon:112.955+Math.sin(a)*r/Math.cos(-8.015*Math.PI/180),alt:110+i*35,alt_msl:null,hdg:(a*180/Math.PI+90)%360,spd:8.4+i,bat:84-i*12,mode:'Demo pemantauan',armed:null,model:i?'Fixed-wing contoh':'Quadcopter contoh',link:'sim',simulated:true,t:new Date(now).toISOString()};});
}

export function shareCamera({selectedCoordinates,camera,demo=false,hasLiveSession=false}){return selectedCoordinates||(demo?[112.955,-8.015]:hasLiveSession?null:[camera.lon,camera.lat]);}
