const cleanText=(value,max=80)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,max):'';
const attempt=fn=>{try{fn();}catch{ /* Releasing one resource must not retain the others. */ }};
const aborted=()=>new DOMException('Koneksi kamera dibatalkan.','AbortError');

export function validateCameraUrl(value,pageProtocol){
 if(typeof value!=='string'||!value.trim()||/[\u0000-\u001f\u007f]/.test(value))throw new Error('Alamat kamera tidak valid.');
 let url;try{url=new URL(value.trim());}catch{throw new Error('Gunakan alamat kamera HTTP atau HTTPS lengkap.');}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.hash)throw new Error('Alamat kamera harus HTTP atau HTTPS, tanpa kredensial atau fragmen.');
 const local=url.hostname==='localhost'||url.hostname.endsWith('.localhost')||url.hostname==='[::1]'||/^127\./.test(url.hostname);
 if(pageProtocol==='https:'&&url.protocol==='http:'&&!local)throw new Error('Situs HTTPS memerlukan sumber kamera HTTPS. Untuk sumber HTTP lokal, buka dashboard dari bridge lokal.');
 return url.href;
}

export function normalizeCameraStreams(value){
 if(!Array.isArray(value))return [];
 const streams=[],ids=new Set();
 for(const item of value){
  if(!item||typeof item!=='object'||Array.isArray(item))continue;
  const id=cleanText(item.id,64),label=cleanText(item.label);
  if(!id||ids.has(id)||!['eo','ir'].includes(item.kind)||!['hls','mjpeg','whep','mp4'].includes(item.protocol))continue;
  let url;try{url=validateCameraUrl(item.url);}catch{continue;}
  streams.push({id,label:label||id,kind:item.kind,protocol:item.protocol,url});ids.add(id);
  if(streams.length===4)break;
 }
 return streams;
}

export function cameraTelemetry(drone){
 const definitions=[['alt','Ketinggian relatif','m',-1000,25000],['spd','Kecepatan','m/s',0,500],['bat','Baterai','%',0,100],['hdg','Arah hadap','°',0,360]];
 return definitions.flatMap(([key,label,unit,min,max])=>typeof drone?.[key]==='number'&&Number.isFinite(drone[key])&&drone[key]>=min&&drone[key]<=max?[{key,label,unit,value:drone[key]}]:[]);
}

export function whepSessionUrl(endpoint,location){
 if(typeof location!=='string'||!location.trim())throw new Error('Kamera tidak memberi alamat sesi WHEP. Periksa header Location dan CORS.');
 const base=new URL(validateCameraUrl(endpoint));let url;
 try{url=new URL(location,base);}catch{throw new Error('Alamat sesi WHEP tidak valid.');}
 validateCameraUrl(url.href);
 if(url.origin!==base.origin)throw new Error('Alamat sesi WHEP harus memiliki origin yang sama dengan kamera.');
 return url.href;
}

export function releaseCameraMedia({video,image,hls,peer,objectUrls=[],urlApi=globalThis.URL}={}){
 if(hls)attempt(()=>hls.destroy());
 if(video){
  attempt(()=>video.pause());
  attempt(()=>video.srcObject?.getTracks().forEach(track=>attempt(()=>track.stop())));
  attempt(()=>{video.srcObject=null;});attempt(()=>video.removeAttribute('src'));attempt(()=>video.load());
 }
 if(image)attempt(()=>image.removeAttribute('src'));
 if(peer)attempt(()=>peer.close());
 for(const url of objectUrls)attempt(()=>urlApi.revokeObjectURL(url));
}

export function waitForIceGathering(peer,{signal,timeoutMs=5000}={}){
 if(signal?.aborted)return Promise.reject(aborted());
 if(peer.iceGatheringState==='complete')return Promise.resolve();
 return new Promise((resolve,reject)=>{
  let timer;
  const finish=error=>{clearTimeout(timer);peer.removeEventListener('icegatheringstatechange',changed);signal?.removeEventListener('abort',cancel);if(error)reject(error);else resolve();};
  const changed=()=>{if(peer.iceGatheringState==='complete')finish();};
  const cancel=()=>finish(aborted());
  peer.addEventListener('icegatheringstatechange',changed);signal?.addEventListener('abort',cancel,{once:true});
  timer=setTimeout(()=>finish(new Error('Pengumpulan ICE melewati batas waktu. Periksa jaringan kamera.')),timeoutMs);changed();
 });
}

// No network request or RTCPeerConnection is created until start() is called.
// Uses the client-offer WHEP flow; no microphone, outbound media, or data channel.
export function createWhepSession({url,token='',pageProtocol,fetchImpl=globalThis.fetch,peerFactory=()=>new RTCPeerConnection(),onTrack=()=>{},onConnectionState=()=>{},iceTimeoutMs=5000,requestTimeoutMs=15000}={}){
 let peer,controller,started=false,stopped=false,closed=false,sessionUrl,deleted=false,deletePromise=Promise.resolve(),requestTimer;
 const endpoint=()=>validateCameraUrl(url,pageProtocol);
 const headers=()=>token?{Authorization:`Bearer ${token}`} : {};
 const track=event=>{if(!stopped)onTrack(event);};
 const state=()=>{if(!stopped)onConnectionState(peer.connectionState);};
 const deleteSession=()=>{
  if(!sessionUrl||deleted)return deletePromise;
  deleted=true;const deleteController=new AbortController();const timer=setTimeout(()=>deleteController.abort(),4000);
  deletePromise=Promise.resolve().then(()=>fetchImpl(sessionUrl,{method:'DELETE',headers:headers(),credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:deleteController.signal,keepalive:true})).catch(()=>{}).finally(()=>clearTimeout(timer));
  return deletePromise;
 };
 const stop=()=>{
  stopped=true;clearTimeout(requestTimer);controller?.abort();
  if(peer&&!closed){closed=true;peer.removeEventListener('track',track);peer.removeEventListener('connectionstatechange',state);attempt(()=>peer.getReceivers().forEach(receiver=>attempt(()=>receiver.track?.stop())));attempt(()=>peer.close());}
  return deleteSession();
 };
 const check=()=>{if(stopped||controller?.signal.aborted)throw aborted();};
 const start=async()=>{
  if(started)throw new Error('Sesi kamera sudah dimulai.');
  started=true;if(stopped)throw aborted();
  try{
   const address=endpoint();if(typeof token!=='string'||/[\r\n]/.test(token)||token.length>4096)throw new Error('Token pembaca kamera tidak valid.');
   peer=peerFactory();controller=new AbortController();
   peer.addEventListener('track',track);peer.addEventListener('connectionstatechange',state);peer.addTransceiver('video',{direction:'recvonly'});
   const offer=await peer.createOffer();check();await peer.setLocalDescription(offer);check();
   await waitForIceGathering(peer,{signal:controller.signal,timeoutMs:iceTimeoutMs});check();
   let timedOut=false;requestTimer=setTimeout(()=>{timedOut=true;controller.abort();},requestTimeoutMs);
   let response;
   try{response=await fetchImpl(address,{method:'POST',headers:{'Content-Type':'application/sdp','Accept':'application/sdp',...headers()},body:peer.localDescription.sdp,signal:controller.signal,credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'});}
   catch{if(timedOut)throw new Error('Kamera tidak merespons tepat waktu.');check();throw new Error('Kamera tidak dapat dihubungkan. Periksa alamat, CORS, dan token pembaca.');}
   // A counter-offer can allocate a pending server session even though this
   // viewer supports only the client-offer/answer flow. Release that session.
   if(response.status===406&&response.headers.get('Location'))sessionUrl=whepSessionUrl(address,response.headers.get('Location'));
   if(response.status!==201)throw new Error(`Kamera menolak koneksi WHEP (HTTP ${response.status}).`);
   sessionUrl=whepSessionUrl(address,response.headers.get('Location'));
   if(stopped){await deleteSession();throw aborted();}
   if(!/^application\/sdp(?:;|$)/i.test(response.headers.get('Content-Type')||''))throw new Error('Jawaban kamera bukan SDP WHEP.');
   const answer=await response.text();check();
   if(!answer.trim().startsWith('v=0')||answer.length>1048576)throw new Error('Jawaban SDP kamera tidak valid.');
   await peer.setRemoteDescription({type:'answer',sdp:answer});check();clearTimeout(requestTimer);
   return peer;
  }catch(error){await stop();throw error;}
 };
 return {start,stop};
}
