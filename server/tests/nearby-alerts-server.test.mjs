import test from 'node:test';
import assert from 'node:assert/strict';

const module = await import('../lib/nearby-alerts-server.mjs').catch(() => ({}));
test('alert API exposes disabled configuration without requiring a database or secrets', async () => {
  assert.equal(typeof module.handleAlerts, 'function', 'the dedicated alert handler must exist');
  const response = await module.handleAlerts(new Request('https://fire-tracker.fiveprayerapp.chatgpt.site/api/alerts/config'), null, {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {ok:true,enabled:false,publicKey:null,checkIntervalMinutes:15,snapshotIntervalHours:3});
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';
import {hkdfSync} from 'node:crypto';
const base='https://fire-tracker.fiveprayerapp.chatgpt.site';
const start=Date.parse('2026-10-27T06:00:00Z');
const b64=value=>Buffer.from(value).toString('base64url');
const decode=value=>new Uint8Array(Buffer.from(value,'base64url'));
async function material(){
 const vapid=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const pub=await crypto.subtle.exportKey('raw',vapid.publicKey),privateJwk=await crypto.subtle.exportKey('jwk',vapid.privateKey);
 const receiver=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const receiverPublic=new Uint8Array(await crypto.subtle.exportKey('raw',receiver.publicKey));
 const auth=crypto.getRandomValues(new Uint8Array(16));
 return {env:{ALERT_VAPID_PUBLIC_KEY:b64(pub),ALERT_VAPID_PRIVATE_KEY:privateJwk.d,ALERT_STORAGE_KEY:b64(crypto.getRandomValues(new Uint8Array(32))),ALERT_DISPATCH_TOKEN:b64(crypto.getRandomValues(new Uint8Array(32)))},receiver,receiverPublic,auth};
}
async function decodePush(options,m){
 const body=new Uint8Array(options.body),salt=body.slice(0,16),keyLength=body[20],senderPublic=body.slice(21,21+keyLength);
 assert.equal(new DataView(body.buffer,body.byteOffset).getUint32(16),4096);
 const sender=await crypto.subtle.importKey('raw',senderPublic,{name:'ECDH',namedCurve:'P-256'},false,[]);
 const shared=await crypto.subtle.deriveBits({name:'ECDH',public:sender},m.receiver.privateKey,256);
 const info=Buffer.concat([Buffer.from('WebPush: info\0'),m.receiverPublic,senderPublic]);
 const ikm=hkdfSync('sha256',Buffer.from(shared),m.auth,info,32);
 const cek=hkdfSync('sha256',ikm,salt,Buffer.from('Content-Encoding: aes128gcm\0'),16);
 const nonce=hkdfSync('sha256',ikm,salt,Buffer.from('Content-Encoding: nonce\0'),12);
 const key=await crypto.subtle.importKey('raw',cek,'AES-GCM',false,['decrypt']);
 const plain=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:nonce},key,body.slice(21+keyLength)));
 let end=plain.length-1;while(end>=0&&plain[end]===0)end--;assert.equal(plain[end],2);
 const authorization=options.headers.authorization;
 assert.match(authorization,/^vapid t=.+, k=.+$/);
 const token=authorization.match(/^vapid t=(.+), k=/)[1];const [head,payload,signature]=token.split('.');
 const claims=JSON.parse(Buffer.from(payload,'base64url'));
 assert.equal(claims.aud,'https://fcm.googleapis.com');assert.equal(claims.sub,'https://github.com/GhanyR/fire-tracker');
 assert.ok(claims.exp>Date.now()/1000 && claims.exp<Date.now()/1000+86400);
 const vapidPublic=await crypto.subtle.importKey('raw',decode(m.env.ALERT_VAPID_PUBLIC_KEY),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
 assert.equal(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},vapidPublic,decode(signature),new TextEncoder().encode(head+'.'+payload)),true);
 return JSON.parse(new TextDecoder().decode(plain.slice(0,end)));
}
async function fixture(t){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
 for(const name of (await readdir(new URL('../drizzle/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort())sqlite.exec(await readFile(new URL('../drizzle/'+name,import.meta.url),'utf8'));
 t.after(()=>sqlite.close());
 function prepare(sql){let values=[];return {bind(...args){values=args;return this;},async first(){return sqlite.prepare(sql).get(...values)??null;},async all(){return {results:sqlite.prepare(sql).all(...values)};},async run(){const r=sqlite.prepare(sql).run(...values);return {success:true,meta:{changes:Number(r.changes)}};}};}
 const db={prepare,async batch(statements){sqlite.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());sqlite.exec('COMMIT');return out;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 const m=await material(),pushes=[];let now=start,providerStatus=201,providerHeaders={},blockPush=null,pushStarted=null;
 let snapshot={version:1,columns:['id','lon','lat','time','frp','confidence','sensor','province','municipality'],rows:[],sources:[{id:'VIIRS_NOAA21_NRT',name:'VIIRS NOAA-21',url:'https://firms.modaps.eosdis.nasa.gov/public.csv',ok:true}],provinces:['JAWA TIMUR'],municipalities:['Kab. Synthetic'],retrievedAt:new Date(now).toISOString(),latestObservedAt:null};
 const fetcher=async(url,options={})=>{
  // Cloudflare Workers rejects redirect:error before any I/O.
  if(options.redirect==='error')throw new TypeError('Invalid redirect value: use manual in Workers.');
  assert.equal(options.redirect,'manual');
  if(url==='https://ghanyr.github.io/fire-tracker/data/observations.json')return Response.json(snapshot);
  assert.equal(new URL(url).hostname,'fcm.googleapis.com');
  pushStarted?.();if(blockPush)await blockPush;
  pushes.push({url,options,message:await decodePush(options,m)});
  return new Response('',{status:providerStatus,headers:providerHeaders});
 };
 const watch={name:'Saved synthetic area',lat:-8,lon:113,radiusKm:10,minConfidence:1};
 const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/synthetic-test-endpoint',expirationTime:null,keys:{auth:b64(m.auth),p256dh:b64(m.receiverPublic)}};
 async function call(action,{method=action==='config'||action==='status'?'GET':'POST',body,id,token,origin=base,ip='198.51.100.7',headers={},env=m.env,sendPush}={}){
  const response=await module.handleAlerts(new Request(base+'/api/alerts/'+action,{method,headers:{'Content-Type':'application/json','CF-Connecting-IP':ip,...(origin?{Origin:origin}:{}),...(id?{'X-Alert-Id':id}:{}),...(token?{Authorization:'Bearer '+token}:{}),...headers},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})}),db,env,{now:()=>now,fetcher,...(sendPush?{sendPush}:{})});
  return {status:response.status,body:method==='OPTIONS'?null:await response.json(),headers:response.headers};
 }
 async function subscribe(options={}){const r=await call('subscribe',{body:{watch,subscription},...options});assert.equal(r.status,201,JSON.stringify(r.body));return r.body;}
 const dispatch=(body={},extra={})=>call('dispatch',{body,origin:null,token:m.env.ALERT_DISPATCH_TOKEN,...extra});
 const row=(id='new-1',time=now+1000,extras={})=>[id,extras.lon??113.01,extras.lat??-8,time,extras.frp??null,extras.confidence??1,0,0,0];
 return {sqlite,db,m,pushes,watch,subscription,call,subscribe,dispatch,row,setTime:v=>now=v,setRows(rows,metadata={}){snapshot={...snapshot,rows,retrievedAt:new Date(now).toISOString(),latestObservedAt:rows.length?new Date(Math.max(...rows.map(r=>r[3]))).toISOString():null,...metadata};},provider(s,headers={}){providerStatus=s;providerHeaders=headers;},block(p){blockPush=p;return new Promise(resolve=>pushStarted=resolve);}};
}

test('subscription stores only encrypted preferences/subscription and hashed management tokens',async t=>{
 const f=await fixture(t),s=await f.subscribe();assert.equal(s.ok,true);assert.deepEqual(s.watch,f.watch);assert.equal(s.lastCheckedAt,null);assert.equal(Date.parse(s.expiresAt)-Date.parse(s.createdAt),90*86400000);
 const stored=JSON.stringify(f.sqlite.prepare('SELECT * FROM alert_watches').all());
 for(const secret of [s.token,f.watch.name,f.subscription.endpoint,f.subscription.keys.auth,f.subscription.keys.p256dh,'"lat"','"subscription"'])assert.equal(stored.includes(secret),false,secret);
 const state=await f.call('status',{id:s.id,token:s.token});assert.equal(state.status,200);assert.deepEqual(state.body.watch,f.watch);assert.equal(state.body.token,undefined);assert.equal(state.body.subscription,undefined);
 assert.equal(state.headers.get('cache-control'),'no-store');
});

test('management isolation, no-origin POST rejection, strict CORS and configuration failure are enforced',async t=>{
 const f=await fixture(t),s=await f.subscribe();
 assert.equal((await f.call('status',{id:s.id,token:'x'.repeat(43)})).status,401);
 assert.equal((await f.call('unsubscribe',{id:s.id,token:s.token,origin:null})).status,403);
 for(const origin of ['https://ghanyr.github.io.evil.test','https://other.chatgpt.site','null'])assert.equal((await f.call('subscribe',{origin,body:{watch:f.watch,subscription:f.subscription}})).status,403);
 assert.equal((await f.call('dispatch',{origin:null,body:{}})).status,401);
 assert.equal((await f.call('dispatch',{origin:null,token:s.token,body:{}})).status,401);
 const preflight=await f.call('subscribe',{method:'OPTIONS',origin:'https://ghanyr.github.io'});assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),'https://ghanyr.github.io');
 assert.equal((await f.call('subscribe',{body:{watch:f.watch,subscription:f.subscription},env:{}})).status,503);
 assert.equal((await f.call('config',{env:{...f.m.env,ALERT_VAPID_PRIVATE_KEY:'invalid'}})).body.enabled,false);
 assert.equal((await f.call('unsubscribe',{id:s.id,token:s.token,env:{}})).status,200);
});

test('rejects arbitrary push URLs, invalid curve/auth keys, oversized bodies and invalid watch values',async t=>{
 const f=await fixture(t);
 for(const endpoint of ['http://fcm.googleapis.com/push','https://127.0.0.1/push','https://evil.test/push','https://fcm.googleapis.com.evil.test/push','https://fcm.googleapis.com:8443/push','https://user:pass@fcm.googleapis.com/push','https://fcm.googleapis.com/push#secret']){
  assert.equal((await f.call('subscribe',{body:{watch:f.watch,subscription:{...f.subscription,endpoint}}})).status,400,endpoint);
 }
 for(const keys of [{...f.subscription.keys,auth:b64(new Uint8Array(15))},{...f.subscription.keys,p256dh:b64(new Uint8Array(65))}])assert.equal((await f.call('subscribe',{body:{watch:f.watch,subscription:{...f.subscription,keys}}})).status,400);
 for(const watch of [{...f.watch,lat:null},{...f.watch,lon:181},{...f.watch,radiusKm:0},{...f.watch,radiusKm:101},{...f.watch,minConfidence:3},{...f.watch,unexpected:'field'}])assert.equal((await f.call('subscribe',{body:{watch,subscription:f.subscription}})).status,400);
 assert.equal((await f.call('subscribe',{body:'x'.repeat(13000)})).status,413);
 assert.equal(f.sqlite.prepare('SELECT count(*) n FROM alert_watches').get().n,0);
});

test('dispatch matches only new acquisitions within radius/confidence and emits independently decryptable aes128gcm/VAPID push',async t=>{
 const f=await fixture(t),s=await f.subscribe();f.setTime(start+60000);
 f.setRows([f.row('before',start),f.row('inside',start+10000),f.row('outside',start+12000,{lon:114}),f.row('low',start+13000,{confidence:0}),f.row('future',start+90000)]);
 const result=await f.dispatch();assert.equal(result.status,200);assert.deepEqual({processed:result.body.processed,sent:result.body.sent,failed:result.body.failed,nextCursor:result.body.nextCursor},{processed:1,sent:1,failed:0,nextCursor:null});
 assert.equal(f.pushes.length,1);const push=f.pushes[0];assert.equal(push.options.headers['content-encoding'],'aes128gcm');assert.equal(push.options.headers.ttl,'3600');assert.equal(push.options.headers.urgency,'normal');
 assert.match(push.message.body,/1 .*satellite hotspot/i);assert.match(push.message.body,/verification/i);assert.match(push.message.body,/2026-10-27T06:00:10/);
 const url=new URL(push.message.url),params=new URLSearchParams(url.hash.slice(1));assert.equal(params.get('id'),'inside');assert.equal(params.get('lon'),'113.01');assert.equal(params.get('lat'),'-8');assert.equal(params.get('hours'),'24');assert.equal(url.href.includes(s.token),false);assert.equal(url.href.includes(s.id),false);
 assert.equal(f.sqlite.prepare('SELECT count(*) n FROM alert_deliveries').get().n,1);
 assert.equal((await f.call('status',{id:s.id,token:s.token})).body.lastCheckedAt,'2026-10-27T06:01:00.000Z');
 assert.equal((await f.dispatch()).body.sent,0);
 // Late, out-of-order acquisition after enrollment must not be lost behind a max-time cursor.
 f.setTime(start+120000);f.setRows([f.row('inside',start+10000),f.row('late',start+5000)]);assert.equal((await f.dispatch()).body.sent,1);assert.equal(f.pushes.length,2);
});

test('ignores acquisitions older than 24h and refuses stale/malformed snapshots without dispatching',async t=>{
 const f=await fixture(t);await f.subscribe();f.setTime(start+26*3600000);f.setRows([f.row('old',start+10000)]);assert.equal((await f.dispatch()).body.sent,0);
 f.setRows([f.row('fresh',start+25*3600000)],{retrievedAt:new Date(start).toISOString()});assert.equal((await f.dispatch()).status,502);assert.equal(f.pushes.length,0);
 f.setRows([f.row('fresh',start+25*3600000)],{columns:['wrong']});assert.equal((await f.dispatch()).status,502);assert.equal(f.pushes.length,0);
});

test('failed pushes remain retryable, accepted pushes alone enter the ledger, dead endpoints are deleted',async t=>{
 const f=await fixture(t),s=await f.subscribe();f.setTime(start+60000);f.setRows([f.row('retry',start+1000)]);f.provider(503);
 assert.equal((await f.dispatch()).body.failed,1);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM alert_deliveries').get().n,0);
 assert.equal((await f.dispatch()).body.sent,0); // retry backoff
 f.setTime(start+180000);f.provider(201);assert.equal((await f.dispatch()).body.sent,1);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM alert_deliveries').get().n,1);
 f.setTime(start+240000);f.setRows([f.row('expired-provider',start+200000)]);f.provider(410);assert.equal((await f.dispatch()).body.failed,1);assert.equal((await f.call('status',{id:s.id,token:s.token})).status,401);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM alert_deliveries').get().n,0);
});

test('test push is explicitly a test, rate-limited and never enters satellite delivery history',async t=>{
 const f=await fixture(t),s=await f.subscribe(),auth={id:s.id,token:s.token};
 assert.equal((await f.call('test',auth)).status,200);assert.match(f.pushes[0].message.title,/test/i);assert.match(f.pushes[0].message.body,/test/i);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM alert_deliveries').get().n,0);
 assert.equal((await f.call('test',auth)).status,429);assert.equal(f.pushes.length,1);
 assert.equal((await f.call('unsubscribe',auth)).status,200);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM alert_watches').get().n,0);assert.equal((await f.call('status',{...auth,method:'GET'})).status,401);
});

test('per-watch lease prevents overlapping dispatch requests from sending the same successful batch',async t=>{
 const f=await fixture(t);await f.subscribe();f.setTime(start+60000);f.setRows([f.row('concurrent',start+1000)]);
 let unblock;const entered=f.block(new Promise(r=>unblock=r));
 const first=f.dispatch();await entered;const second=await f.dispatch();assert.equal(second.body.sent,0);unblock();assert.equal((await first).body.sent,1);assert.equal(f.pushes.length,1);
});

test('expiry deletes watches and the delivery ledger and public config never reveals private material',async t=>{
 const f=await fixture(t),s=await f.subscribe();const config=await f.call('config');assert.equal(config.body.enabled,true);assert.equal(config.body.publicKey,f.m.env.ALERT_VAPID_PUBLIC_KEY);
 f.setTime(start+90*86400000);assert.equal((await f.call('status',{id:s.id,token:s.token})).status,401);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM alert_watches').get().n,0);
});

test('encrypted records cannot be swapped between watch IDs or read with a rotated storage key',async t=>{
 const f=await fixture(t),a=await f.subscribe();
 const b=await f.subscribe({body:{watch:{...f.watch,name:'Another private area'},subscription:{...f.subscription,endpoint:f.subscription.endpoint+'-2'}}});
 const cipher=f.sqlite.prepare('SELECT payload_ciphertext FROM alert_watches WHERE id=?').get(a.id).payload_ciphertext;
 f.sqlite.prepare('UPDATE alert_watches SET payload_ciphertext=? WHERE id=?').run(cipher,b.id);
 const changed=await f.call('status',{id:b.id,token:b.token});assert.equal(changed.status,503);assert.equal(JSON.stringify(changed.body).includes(f.watch.name),false);
 assert.equal((await f.call('status',{id:a.id,token:a.token,env:{...f.m.env,ALERT_STORAGE_KEY:b64(crypto.getRandomValues(new Uint8Array(32)))}})).status,503);
 assert.equal((await f.call('unsubscribe',{id:b.id,token:b.token,env:{}})).status,200);
});

test('enrollment rate limits and duplicate endpoint protection cannot replace another browser watch',async t=>{
 const f=await fixture(t),s=await f.subscribe();
 assert.equal((await f.call('subscribe',{body:{watch:{...f.watch,name:'Replacement'},subscription:f.subscription}})).status,409);
 await f.subscribe({body:{watch:f.watch,subscription:{...f.subscription,endpoint:f.subscription.endpoint+'-2'}}});
 assert.equal((await f.call('subscribe',{body:{watch:f.watch,subscription:{...f.subscription,endpoint:f.subscription.endpoint+'-3'}}})).status,429);
 assert.equal((await f.call('status',{id:s.id,token:s.token})).body.watch.name,f.watch.name);
});

test('dispatch pagination processes at most one hundred watches and returns a resumable cursor',async t=>{
 const f=await fixture(t);
 for(let i=0;i<101;i++){
  f.setTime(start+Math.floor(i/25)*60000);
  await f.subscribe({ip:'198.51.100.'+i,body:{watch:f.watch,subscription:{...f.subscription,endpoint:f.subscription.endpoint+'-'+i}}});
 }
 f.setRows([]);
 const first=await f.dispatch();assert.equal(first.body.processed,100);assert.match(first.body.nextCursor,/^[A-Za-z0-9_-]{22}$/);
 const second=await f.dispatch({cursor:first.body.nextCursor});assert.equal(second.body.processed,1);assert.equal(second.body.nextCursor,null);
 assert.equal((await f.dispatch({cursor:'not-a-valid-id'})).status,400);
 assert.equal(f.pushes.length,0);
});

test('headers-only client requests can test and stop without JSON content type',async t=>{
 const f=await fixture(t),s=await f.subscribe();
 const request=action=>new Request(base+'/api/alerts/'+action,{method:'POST',headers:{Origin:base,'X-Alert-Id':s.id,Authorization:'Bearer '+s.token}});
 let outgoing=0;
 const sender=async()=>{outgoing++;return new Response('',{status:201});};
 assert.equal((await module.handleAlerts(request('test'),f.db,f.m.env,{now:()=>start,sendPush:sender})).status,200);
 assert.equal(outgoing,1);
 assert.equal((await module.handleAlerts(request('unsubscribe'),f.db,f.m.env,{now:()=>start})).status,200);
 assert.equal(f.sqlite.prepare('SELECT count(*) n FROM alert_watches').get().n,0);
});

test('HTTP-date Retry-After delays a failed delivery without recording success or retrying early',async t=>{
 const f=await fixture(t);await f.subscribe();f.setTime(start+60000);f.setRows([f.row('rate-retry',start+1000)]);
 f.provider(429,{'Retry-After':new Date(start+11*60000).toUTCString()});assert.equal((await f.dispatch()).body.failed,1);
 f.setTime(start+5*60000);assert.equal((await f.dispatch()).body.processed,0);assert.equal(f.pushes.length,1);
 f.setTime(start+12*60000);f.provider(201);assert.equal((await f.dispatch()).body.sent,1);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM alert_deliveries').get().n,1);
});

test('empty fragments are rejected and authenticated status never allows private configuration in URLs',async t=>{
 const f=await fixture(t);
 assert.equal((await f.call('subscribe',{body:{watch:f.watch,subscription:{...f.subscription,endpoint:f.subscription.endpoint+'#'}}})).status,400);
 const s=await f.subscribe();
 const response=await module.handleAlerts(new Request(base+'/api/alerts/status?token='+s.token,{headers:{Origin:base,'X-Alert-Id':s.id,Authorization:'Bearer '+s.token}}),f.db,f.m.env);
 assert.equal(response.status,404);assert.equal((await response.text()).includes(s.token),false);
});

test('later watches receive fresh leases when the dispatch clock advances by 130 seconds',async t=>{
 const f=await fixture(t);await f.subscribe();await f.subscribe({body:{watch:f.watch,subscription:{...f.subscription,endpoint:f.subscription.endpoint+'-second'}}});
 f.setTime(start+60000);f.setRows([f.row('new-during-batch',start+1000)]);
 let entered,unblock;const secondStarted=new Promise(r=>entered=r),blocked=new Promise(r=>unblock=r),endpoints=[];
 const sender=async endpoint=>{
  endpoints.push(endpoint);
  if(endpoints.length===1)f.setTime(start+190000);
  else if(endpoints.length===2){entered();await blocked;}
  return new Response('',{status:201});
 };
 const first=f.dispatch({}, {sendPush:sender});await secondStarted;
 try{const overlap=await f.dispatch({}, {sendPush:sender});assert.equal(overlap.body.sent,0);}
 finally{unblock();await first;}
 assert.equal(endpoints.length,2);assert.equal(new Set(endpoints).size,2);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM alert_deliveries').get().n,2);
});

test('saved watch bounds match the Indonesia map, and test pushes use the injected clock for expiry',async t=>{
 const f=await fixture(t);
 assert.equal((await f.call('subscribe',{body:{watch:{...f.watch,lat:8},subscription:f.subscription}})).status,400);
 assert.equal((await f.call('subscribe',{body:{watch:{...f.watch,lon:93},subscription:f.subscription}})).status,400);
 const historical=1600000000000;f.setTime(historical);
 const s=await f.subscribe({body:{watch:f.watch,subscription:{...f.subscription,expirationTime:historical+60000}}});
 assert.equal((await f.call('test',{id:s.id,token:s.token})).status,200);
});


test('Worker-compatible no-follow requests reject provider redirects without recording delivery',async t=>{
 const f=await fixture(t);await f.subscribe();f.setTime(start+60000);f.setRows([f.row('redirect-case',start+1000)]);f.provider(302,{Location:'https://attacker.example/'});
 const result=await f.dispatch();assert.equal(result.status,200);assert.equal(result.body.sent,0);assert.equal(result.body.failed,1);assert.equal(f.pushes.length,1);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM alert_deliveries').get().n,0);
});
