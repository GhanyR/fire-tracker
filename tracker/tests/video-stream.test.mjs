import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCameraUrl,normalizeCameraStreams,cameraTelemetry,whepSessionUrl,releaseCameraMedia,waitForIceGathering,createWhepSession} from '../lib/video-stream.mjs';

test('camera URLs reject credentials and active schemes; HTTPS pages require HTTPS except loopback',()=>{
 assert.equal(validateCameraUrl(' https://camera.example/live.m3u8 ','https:'),'https://camera.example/live.m3u8');
 for(const url of ['javascript:alert(1)','data:video/mp4;base64,AA','file:///camera','https://user:secret@camera.example/','https://camera.example/#secret','/relative','https://camera.example/\nheader'])assert.throws(()=>validateCameraUrl(url));
 assert.throws(()=>validateCameraUrl('http://192.168.1.5/camera','https:'),/HTTPS/);
 assert.equal(validateCameraUrl('http://127.0.0.1:8889/camera','https:'),'http://127.0.0.1:8889/camera');
 assert.equal(validateCameraUrl('http://[::1]:8889/camera','http:'),'http://[::1]:8889/camera');
 assert.equal(validateCameraUrl('http://192.168.1.5/camera','http:'),'http://192.168.1.5/camera');
});

test('only provided EO/IR and supported protocols survive; stream IDs are unique and bounded',()=>{
 const eo={id:'front',label:'Depan',kind:'eo',protocol:'hls',url:'https://camera.example/front.m3u8'};
 const streams=normalizeCameraStreams([eo,{...eo,label:'duplicate'},{...eo,id:'bad-kind',kind:'thermal'},{...eo,id:'rtsp',protocol:'rtsp'},{...eo,id:'credentials',url:'https://secret:pass@camera.example/'},...Array.from({length:6},(_,i)=>({...eo,id:'ir'+i,kind:'ir',protocol:'whep',label:'IR\u0000 '+i,token:'do-not-copy'}))]);
 assert.deepEqual(streams.map(s=>[s.id,s.kind,s.protocol]),[['front','eo','hls'],['ir0','ir','whep'],['ir1','ir','whep'],['ir2','ir','whep']]);
 assert.equal(streams[1].label,'IR 0');assert.equal('token' in streams[1],false);assert.deepEqual(normalizeCameraStreams(null),[]);
});

test('telemetry HUD only includes known finite measurements and does not infer temperatures',()=>{
 assert.deepEqual(cameraTelemetry({alt:0,spd:4.5,bat:0,hdg:270,lat:-8,lon:112}).map(x=>[x.key,x.value]),[['alt',0],['spd',4.5],['bat',0],['hdg',270]]);
 assert.deepEqual(cameraTelemetry({alt:null,spd:'5',bat:101,hdg:NaN,temperature:80}),[]);
});

test('WHEP session deletion cannot target another origin or URL with credentials',()=>{
 assert.equal(whepSessionUrl('https://camera.example/whep','../session/abc'),'https://camera.example/session/abc');
 for(const location of ['',null,'https://evil.example/session','//evil.example/session','https://user:pass@camera.example/session','http://camera.example/session'])assert.throws(()=>whepSessionUrl('https://camera.example/whep',location));
});

test('media release stops tracks and peer, destroys HLS, clears stale pixels and revokes owned URLs',()=>{
 const effects=[];const track={stop:()=>effects.push('track')};
 const video={srcObject:{getTracks:()=>[track]},pause:()=>effects.push('pause'),removeAttribute:n=>effects.push('video-'+n),load:()=>effects.push('load')};
 const image={removeAttribute:n=>effects.push('image-'+n)};
 releaseCameraMedia({video,image,hls:{destroy:()=>effects.push('hls')},peer:{close:()=>effects.push('peer')},objectUrls:['blob:owned'],urlApi:{revokeObjectURL:u=>effects.push(u)}});
 assert.equal(video.srcObject,null);assert.deepEqual(effects,['hls','pause','track','video-src','load','image-src','peer','blob:owned']);
 assert.doesNotThrow(()=>releaseCameraMedia({video:{pause(){throw Error();},removeAttribute(){},load(){}}}));
});

class Peer extends EventTarget {
 constructor(){super();this.iceGatheringState='complete';this.connectionState='new';this.localDescription=null;this.closed=0;this.transceivers=[];}
 addTransceiver(kind,options){this.transceivers.push([kind,options]);}
 async createOffer(){return {type:'offer',sdp:'v=0\r\na=recvonly\r\n'};}
 async setLocalDescription(sdp){this.localDescription=sdp;}
 async setRemoteDescription(sdp){this.remoteDescription=sdp;}
 getReceivers(){return [];}
 close(){this.closed++;}
}

test('ICE gather wait rejects on timeout and abort instead of leaking listeners',async()=>{
 const peer=new Peer();await waitForIceGathering(peer,{timeoutMs:10});peer.iceGatheringState='gathering';
 await assert.rejects(waitForIceGathering(peer,{timeoutMs:5}),/ICE/);
 const controller=new AbortController();const waiting=waitForIceGathering(peer,{signal:controller.signal,timeoutMs:100});controller.abort();await assert.rejects(waiting,{name:'AbortError'});
});

test('WHEP is lazy until start, receives only video and terminates its authenticated session once',async()=>{
 const calls=[];let peer;
 const session=createWhepSession({url:'https://camera.example/whep',token:'read-token',pageProtocol:'https:',peerFactory:()=>peer=new Peer(),fetchImpl:async(url,options)=>{calls.push({url,options});return new Response(options.method==='POST'?'v=0\r\na=sendonly\r\n':null,{status:options.method==='POST'?201:204,headers:options.method==='POST'?{'Content-Type':'application/sdp','Location':'/session/one'}:{}});}});
 assert.equal(calls.length,0);assert.equal(peer,undefined);await session.start();
 assert.deepEqual(peer.transceivers,[['video',{direction:'recvonly'}]]);assert.equal(calls[0].options.method,'POST');assert.equal(calls[0].options.headers.Authorization,'Bearer read-token');assert.equal(calls[0].options.redirect,'error');assert.equal(calls[0].options.credentials,'omit');
 await session.stop();await session.stop();assert.equal(peer.closed,1);assert.equal(calls.length,2);assert.equal(calls[1].url,'https://camera.example/session/one');assert.equal(calls[1].options.method,'DELETE');assert.equal(calls[1].options.headers.Authorization,'Bearer read-token');
});

test('invalid WHEP answers close peer and unsafe Location never receives token or DELETE',async()=>{
 const calls=[];let peer;
 const session=createWhepSession({url:'https://camera.example/whep',token:'private',peerFactory:()=>peer=new Peer(),fetchImpl:async(url,options)=>{calls.push([url,options.method]);return new Response('v=0',{status:201,headers:{'Content-Type':'application/sdp','Location':'https://evil.example/secret'}});}});
 await assert.rejects(session.start(),/origine|origin|alamat/i);assert.equal(peer.closed,1);assert.deepEqual(calls,[['https://camera.example/whep','POST']]);await session.stop();assert.equal(calls.length,1);
});

test('aborting an in-flight WHEP POST closes peer immediately and deletes a late valid session',async()=>{
 let resolvePost,peer;const calls=[];
 const session=createWhepSession({url:'https://camera.example/whep',peerFactory:()=>peer=new Peer(),fetchImpl:async(url,options)=>{calls.push([url,options.method]);if(options.method==='POST')return new Promise(resolve=>resolvePost=resolve);return new Response(null,{status:204});}});
 const starting=session.start();while(!resolvePost)await new Promise(resolve=>setTimeout(resolve,0));await session.stop();assert.equal(peer.closed,1);
 resolvePost(new Response('v=0',{status:201,headers:{'Content-Type':'application/sdp','Location':'/session/late'}}));await assert.rejects(starting,{name:'AbortError'});assert.deepEqual(calls,[['https://camera.example/whep','POST'],['https://camera.example/session/late','DELETE']]);
});

test('a WHEP request deadline reports a timeout and closes the receiving peer',async()=>{
 let peer;
 const session=createWhepSession({url:'https://camera.example/whep',requestTimeoutMs:5,peerFactory:()=>peer=new Peer(),fetchImpl:(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}))});
 await assert.rejects(session.start(),error=>error.name!=='AbortError'&&/waktu/.test(error.message));assert.equal(peer.closed,1);
});

test('an unsupported WHEP counter-offer releases its safe pending session',async()=>{
 const calls=[];const session=createWhepSession({url:'https://camera.example/whep',peerFactory:()=>new Peer(),fetchImpl:async(url,options)=>{calls.push([url,options.method]);return options.method==='POST'?new Response('v=0',{status:406,headers:{'Content-Type':'application/sdp','Location':'/session/pending'}}):new Response(null,{status:204});}});
 await assert.rejects(session.start(),/WHEP/);assert.deepEqual(calls,[['https://camera.example/whep','POST'],['https://camera.example/session/pending','DELETE']]);
});

test('a malformed answer releases the allocated session and cannot retain its media peer',async()=>{
 const calls=[];let peer;
 const session=createWhepSession({url:'https://camera.example/whep',peerFactory:()=>peer=new Peer(),fetchImpl:async(url,options)=>{calls.push([url,options.method]);return options.method==='POST'?new Response('<html>login</html>',{status:201,headers:{'Content-Type':'text/html','Location':'/session/wrong-answer'}}):new Response(null,{status:204});}});
 await assert.rejects(session.start(),/SDP/);assert.equal(peer.closed,1);assert.deepEqual(calls,[['https://camera.example/whep','POST'],['https://camera.example/session/wrong-answer','DELETE']]);
});
