/** Persistent, opted-in satellite alerts. Never reads private operations GPS. */
import {buildPushPayload} from '@block65/webcrypto-web-push';

const DAY=86_400_000, HOUR=3_600_000, LIFETIME=90*DAY;
const SNAPSHOT='https://ghanyr.github.io/fire-tracker/data/observations.json';
const SUBJECT='https://github.com/GhanyR/fire-tracker';
const COLUMNS=['id','lon','lat','time','frp','confidence','sensor','province','municipality'];
const TRUSTED=new Set(['https://ghanyr.github.io','https://fire-tracker.fiveprayerapp.chatgpt.site']);
const METHODS={config:'GET',subscribe:'POST',status:'GET',unsubscribe:'POST',test:'POST',dispatch:'POST'};
const encoder=new TextEncoder(),decoder=new TextDecoder();
const configCache=new WeakMap();
class ApiError extends Error{constructor(status,message){super(message);this.status=status;}}
const fail=(status,message)=>{throw new ApiError(status,message);};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function fields(value,allowed){if(!object(value)||Object.keys(value).some(key=>!allowed.includes(key)))fail(400,'Invalid request fields.');}
function text(value,max,{required=true}={}){if(typeof value!=='string'||value.length>max||/[\u0000-\u001f\u007f]/.test(value)||(required&&!value.trim()))fail(400,'Invalid text.');return value.trim();}
function number(value,min,max){if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)fail(400,'Invalid numeric value.');return value;}
function encode(bytes){return btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');}
function decode(value,size){
 if(typeof value!=='string'||!value.length||value.length>512||!/^[A-Za-z0-9_-]+$/.test(value))throw new Error('Invalid key');
 const bytes=Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),x=>x.charCodeAt(0));
 if(bytes.length!==size||encode(bytes)!==value)throw new Error('Invalid key');return bytes;
}
const random=(size=32)=>encode(crypto.getRandomValues(new Uint8Array(size)));
async function digest(value){return encode(await crypto.subtle.digest('SHA-256',encoder.encode(value)));}
async function equalSecret(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length>256||b.length>256)return false;const x=await digest(a),y=await digest(b);let different=0;for(let i=0;i<x.length;i++)different|=x.charCodeAt(i)^y.charCodeAt(i);return different===0;}
async function configured(env){
 if(!object(env))return null;
 if(!configCache.has(env))configCache.set(env,(async()=>{
  try{
   const pub=decode(env.ALERT_VAPID_PUBLIC_KEY,65);if(pub[0]!==4)throw new Error();decode(env.ALERT_VAPID_PRIVATE_KEY,32);
   const storage=await crypto.subtle.importKey('raw',decode(env.ALERT_STORAGE_KEY,32),'AES-GCM',false,['encrypt','decrypt']);
   if(typeof env.ALERT_DISPATCH_TOKEN!=='string'||env.ALERT_DISPATCH_TOKEN.length<32||env.ALERT_DISPATCH_TOKEN.length>256)throw new Error();
   const publicKey=await crypto.subtle.importKey('raw',pub,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
   const privateKey=await crypto.subtle.importKey('jwk',{kty:'EC',crv:'P-256',x:encode(pub.slice(1,33)),y:encode(pub.slice(33)),d:env.ALERT_VAPID_PRIVATE_KEY},{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
   const probe=encoder.encode('Fire Tracker configuration');
   if(!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},publicKey,await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},privateKey,probe),probe))throw new Error();
   return {storage,vapid:{subject:SUBJECT,publicKey:env.ALERT_VAPID_PUBLIC_KEY,privateKey:env.ALERT_VAPID_PRIVATE_KEY}};
  }catch{return null;}
 })());
 return configCache.get(env);
}
function originAllowed(origin,url){
 if(!origin)return true;if(TRUSTED.has(origin)||origin===url.origin)return true;
 try{const u=new URL(origin);return u.origin===origin&&['http:','https:'].includes(u.protocol)&&['localhost','127.0.0.1','[::1]'].includes(u.hostname);}catch{return false;}
}
function appUrl(origin){return origin+(origin==='https://ghanyr.github.io'?'/fire-tracker/':'/');}
function endpoint(value){
 const raw=text(value,2048);let u;try{u=new URL(raw);}catch{fail(400,'Unsupported push endpoint.');}
 const host=u.hostname;
 const known=host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'||/^(?:[a-z0-9-]+\.)+push\.apple\.com$/.test(host)||/^(?:[a-z0-9-]+\.)+notify\.windows\.com$/.test(host);
 if(u.protocol!=='https:'||u.username||u.password||u.port||raw.includes('#')||u.pathname==='/'||!known)fail(400,'Unsupported push endpoint.');
 return u.href;
}
async function subscription(value,now){
 fields(value,['endpoint','expirationTime','keys']);fields(value.keys,['auth','p256dh']);
 if(encoder.encode(JSON.stringify(value)).length>8192)fail(413,'Subscription is too large.');
 const result={endpoint:endpoint(value.endpoint),expirationTime:value.expirationTime??null,keys:{auth:value.keys.auth,p256dh:value.keys.p256dh}};
 if(result.expirationTime!==null)number(result.expirationTime,now+1,Number.MAX_SAFE_INTEGER);
 try{decode(result.keys.auth,16);const pub=decode(result.keys.p256dh,65);if(pub[0]!==4)throw new Error();await crypto.subtle.importKey('raw',pub,{name:'ECDH',namedCurve:'P-256'},false,[]);}catch{fail(400,'Invalid push subscription keys.');}
 return result;
}
function watch(value){
 fields(value,['name','lat','lon','radiusKm','minConfidence']);
 const result={name:text(value.name,80),lat:number(value.lat,-12,7),lon:number(value.lon,94,142),radiusKm:number(value.radiusKm,1,100),minConfidence:number(value.minConfidence,0,2)};
 if(!Number.isInteger(result.minConfidence))fail(400,'Invalid confidence.');return result;
}
async function encrypt(config,id,value){const iv=crypto.getRandomValues(new Uint8Array(12));const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(id)},config.storage,encoder.encode(JSON.stringify(value)));return encode(iv)+'.'+encode(encrypted);}
async function decrypt(config,row){
 try{
  const [iv,cipher,...extra]=row.payload_ciphertext.split('.');if(extra.length)throw new Error();
  // Ciphertext is bounded by the originally accepted request, with a small AEAD overhead.
  if(!/^[A-Za-z0-9_-]{1,24000}$/.test(cipher))throw new Error();
  const bytes=Uint8Array.from(atob(cipher.replaceAll('-','+').replaceAll('_','/')),x=>x.charCodeAt(0));
  return JSON.parse(decoder.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(iv,12),additionalData:encoder.encode(row.id)},config.storage,bytes)));
 }catch{fail(503,'Stored alert preferences are unavailable.');}
}
function sql(db,query,...values){return db.prepare(query).bind(...values);}
async function cleanup(db,now){await db.batch([sql(db,'DELETE FROM alert_watches WHERE expires_at <= ?',now),sql(db,'DELETE FROM alert_deliveries WHERE observed_at <= ?',now-DAY),sql(db,'DELETE FROM alert_rate_limits WHERE expires_at <= ?',now)]);}
async function rate(db,key,now,period,maximum){
 const bucket=Math.floor(now/period);
 const result=await sql(db,`INSERT INTO alert_rate_limits (key,expires_at,count) SELECT ?,?,1 WHERE (SELECT count(*) FROM alert_rate_limits)<4096
  ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<? RETURNING count`,key+':'+bucket,(bucket+1)*period,maximum).first();
 if(!result)fail(429,'Alert rate limit reached. Try again later.');
}
async function readJson(request,maxBytes=12288){
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))fail(415,'Send application/json.');
 if(Number(request.headers.get('content-length'))>maxBytes)fail(413,'Request body is too large.');
 let total=0;const chunks=[],reader=request.body?.getReader();if(!reader)fail(400,'JSON body is required.');
 try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>maxBytes){await reader.cancel();fail(413,'Request body is too large.');}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(total);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
 try{const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!object(value))throw new Error();return value;}catch{fail(400,'Invalid JSON body.');}
}
function publicState(row,payload){return {id:row.id,watch:payload.watch,createdAt:new Date(row.created_at).toISOString(),expiresAt:new Date(row.expires_at).toISOString(),lastCheckedAt:row.last_checked_at===null?null:new Date(row.last_checked_at).toISOString()};}
async function owner(request,db,now){
 const id=request.headers.get('X-Alert-Id'),token=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get('Authorization')||'')?.[1];
 if(!id||!/^[A-Za-z0-9_-]{22}$/.test(id)||!token)fail(401,'Unauthorized or expired alert watch.');
 const row=await sql(db,'SELECT * FROM alert_watches WHERE id=? AND expires_at>?',id,now).first();
 if(!row||!await equalSecret(row.token_hash,await digest(token)))fail(401,'Unauthorized or expired alert watch.');return row;
}
async function timeout(operation,ms){
 const controller=new AbortController();let timer;
 try{return await Promise.race([operation(controller.signal),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('Request timed out'));},ms);})]);}finally{clearTimeout(timer);}
}
async function fetchSnapshot(fetcher,now){
 try{return await timeout(async signal=>{
  const response=await fetcher(SNAPSHOT,{cache:'no-store',redirect:'error',signal});if(!response.ok)throw new Error();
  const reader=response.body?.getReader();if(!reader)throw new Error();const chunks=[];let total=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;total+=value.length;if(total>32*1024*1024){await reader.cancel();throw new Error();}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(total);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}
  const data=JSON.parse(decoder.decode(bytes)),retrieved=Date.parse(data.retrievedAt);
  if(data.version!==1||JSON.stringify(data.columns)!==JSON.stringify(COLUMNS)||!Array.isArray(data.rows)||data.rows.length>300000||!Array.isArray(data.sources)||!Array.isArray(data.provinces)||!Array.isArray(data.municipalities)||!Number.isFinite(retrieved)||retrieved>now||retrieved<now-6*HOUR)throw new Error();
  return data;
 },20000);}catch{fail(502,'A current satellite snapshot is unavailable. No alerts were sent.');}
}
function distance(lat,lon,row){const r=x=>x*Math.PI/180,a=Math.sin(r(row[2]-lat)/2)**2+Math.cos(r(lat))*Math.cos(r(row[2]))*Math.sin(r(row[1]-lon)/2)**2;return 12742*Math.asin(Math.sqrt(Math.min(1,a)));}
function matches(data,row,watch,created,now){
 const seen=new Set(),out=[];
 for(const r of data.rows){
  if(!Array.isArray(r)||r.length!==9||typeof r[0]!=='string'||!r[0].length||r[0].length>128||/[\u0000-\u001f\u007f]/.test(r[0])||seen.has(r[0])||!Number.isFinite(r[1])||r[1]<-180||r[1]>180||!Number.isFinite(r[2])||r[2]<-90||r[2]>90||!Number.isFinite(r[3])||r[3]<=created||r[3]<=now-DAY||r[3]>now||!Number.isInteger(r[5])||r[5]<watch.minConfidence||r[5]>2||!Number.isInteger(r[6])||r[6]<0||r[6]>=data.sources.length||!Number.isInteger(r[7])||r[7]<0||r[7]>=data.provinces.length||!Number.isInteger(r[8])||r[8]<-1||r[8]>=data.municipalities.length)continue;
  seen.add(r[0]);const km=distance(watch.lat,watch.lon,r);if(km<=watch.radiusKm)out.push({row:r,km});
 }
 return out.sort((a,b)=>b.row[3]-a.row[3]||a.row[0].localeCompare(b.row[0]));
}
function notification(payload,found,data){
 const {row,km}=found[0];const label=String(data.municipalities[row[8]]||data.provinces[row[7]]||'Indonesia').replace(/[\u0000-\u001f\u007f]/g,'').slice(0,80);
 const url=new URL(payload.appUrl);url.hash=new URLSearchParams({id:row[0],kind:'satellite',time:String(row[3]),sensor:String(row[6]),lon:String(row[1]),lat:String(row[2]),zoom:'11',hours:'24'}).toString();
 return {title:'Satellite hotspots · needs verification',body:`${found.length} new satellite hotspot${found.length===1?'':'s'} near the saved area. ${label} · ${km.toFixed(1)} km · acquired ${new Date(row[3]).toISOString()}. Needs ground verification.`,url:url.href};
}
async function push(config,payload,message,fetcher,sendPush,readNow,beforeSend){
 const subscriptionValue=await subscription(payload.subscription,readNow()); // revalidate the stored destination before every network request
 const request=await buildPushPayload({data:message,options:{ttl:3600,urgency:'normal'}},subscriptionValue,config.vapid);
 if(request.body.byteLength>4096)throw new Error('Push payload too large');
 return timeout(async signal=>{
  if(!await beforeSend(readNow()))throw new Error('The watch lease is no longer active');
  const response=await (sendPush||fetcher)(subscriptionValue.endpoint,{...request,redirect:'error',signal});
  const result={status:response.status,retryAfter:response.headers?.get('Retry-After')};try{await response.body?.cancel();}catch{}return result;
 },10000);
}
async function claim(db,row,now){const lease=random(16);const claimed=await sql(db,`UPDATE alert_watches SET lease_token=?,lease_until=? WHERE id=? AND expires_at>? AND (lease_until IS NULL OR lease_until<=?) AND (next_attempt_at IS NULL OR next_attempt_at<=?) RETURNING id`,lease,now+120000,row.id,now,now,now).first();return claimed?lease:null;}
async function renew(db,row,lease,now){return !!await sql(db,'UPDATE alert_watches SET lease_until=? WHERE id=? AND lease_token=? AND lease_until>? AND expires_at>? RETURNING id',now+120000,row.id,lease,now,now).first();}
async function release(db,row,lease,now,{failed=false,retryAfter=null}={}){
 const seconds=Number(retryAfter),date=Date.parse(retryAfter),requested=Number.isFinite(seconds)&&seconds>0?seconds*1000:Number.isFinite(date)&&date>now?date-now:0;
 const delay=Math.min(DAY,Math.max(60000,requested||60000*2**Math.min(row.failure_count,10)));
 await sql(db,`UPDATE alert_watches SET lease_token=NULL,lease_until=NULL,next_attempt_at=?,failure_count=? WHERE id=? AND lease_token=?`,failed?now+delay:null,failed?Math.min(row.failure_count+1,16):0,row.id,lease).run();
}
async function accepted(db,row,lease,now,found){
 const statements=[];
 for(let i=0;i<found.length;i+=25){const part=found.slice(i,i+25),values=part.flatMap(({row:r})=>[row.id,r[0],r[3]]);statements.push(sql(db,`INSERT OR IGNORE INTO alert_deliveries (watch_id,observation_id,observed_at) SELECT column1,column2,column3 FROM (VALUES ${part.map(()=>'(?,?,?)').join(',')}) WHERE EXISTS (SELECT 1 FROM alert_watches WHERE id=? AND lease_token=?)`,...values,row.id,lease));}
 statements.push(sql(db,'UPDATE alert_watches SET last_checked_at=?,lease_token=NULL,lease_until=NULL,next_attempt_at=NULL,failure_count=0 WHERE id=? AND lease_token=?',now,row.id,lease));
 await db.batch(statements);
}

/** sendPush, when supplied, has fetch's (endpoint, RequestInit) contract. */
export async function handleAlerts(request,db,env,{now:readNow=Date.now,fetcher=fetch,sendPush}={}){
 const url=new URL(request.url),origin=request.headers.get('Origin'),trusted=originAllowed(origin,url);
 const headers=new Headers({'Cache-Control':'no-store','Vary':'Origin','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});
 if(origin&&trusted){headers.set('Access-Control-Allow-Origin',origin);headers.set('Access-Control-Allow-Methods','GET, POST, OPTIONS');headers.set('Access-Control-Allow-Headers','Authorization, Content-Type, X-Alert-Id');}
 const respond=(body,status=200)=>Response.json({ok:true,...body},{status,headers});
 try{
  if(!trusted)fail(403,'Origin is not allowed.');
  const route=/^\/api\/alerts\/([a-z]+)$/.exec(url.pathname)?.[1];
  if(!route||!METHODS[route]||url.search)fail(404,'Alert route not found.');
  if(request.method==='OPTIONS'){if(!origin)fail(403,'Origin is required.');return new Response(null,{status:204,headers});}
  if(request.method!==METHODS[route])fail(405,'Method is not allowed.');
  if(request.method==='POST'&&route!=='dispatch'&&!origin)fail(403,'Origin is required.');
  const now=readNow();if(!Number.isFinite(now))throw new Error();
  const config=await configured(env);
  if(route==='config')return respond({enabled:!!config&&!!db?.prepare,publicKey:config&&db?.prepare?config.vapid.publicKey:null,checkIntervalMinutes:15,snapshotIntervalHours:3});
  if(!db?.prepare||!db?.batch)fail(503,'Alert storage is unavailable.');
  if(route==='dispatch'&&!await equalSecret(request.headers.get('Authorization'),typeof env?.ALERT_DISPATCH_TOKEN==='string'&&env.ALERT_DISPATCH_TOKEN.length>=32?'Bearer '+env.ALERT_DISPATCH_TOKEN:null))fail(401,'Unauthorized dispatch.');
  await cleanup(db,now);
  if(route==='unsubscribe'){
   const row=await owner(request,db,now);await sql(db,'DELETE FROM alert_watches WHERE id=?',row.id).run();return respond({});
  }
  if(!config)fail(503,'Notifications are not configured.');
  if(route==='subscribe'){
   await rate(db,'request:'+await digest(request.headers.get('CF-Connecting-IP')||'anonymous'),now,60000,60);
   const body=await readJson(request);fields(body,['watch','subscription']);
   const preference=watch(body.watch),sub=await subscription(body.subscription,now);
   await rate(db,'create:'+await digest(request.headers.get('CF-Connecting-IP')||'anonymous'),now,HOUR,3);await rate(db,'create:global',now,60000,30);
   const id=random(16),token=random(),expiresAt=Math.min(now+LIFETIME,sub.expirationTime??Infinity);
   const ciphertext=await encrypt(config,id,{watch:preference,subscription:sub,appUrl:appUrl(origin)});
   const inserted=await sql(db,`INSERT INTO alert_watches (id,token_hash,endpoint_hash,payload_ciphertext,created_at,expires_at) SELECT ?,?,?,?,?,? WHERE (SELECT count(*) FROM alert_watches)<1000 ON CONFLICT(endpoint_hash) DO NOTHING RETURNING id`,id,await digest(token),await digest(sub.endpoint),ciphertext,now,expiresAt).first();
   if(!inserted)fail(409,'This browser already has a watch or alert capacity is full.');
   return respond({id,token,watch:preference,createdAt:new Date(now).toISOString(),expiresAt:new Date(expiresAt).toISOString(),lastCheckedAt:null},201);
  }
  if(route==='status'||route==='test'){
   const row=await owner(request,db,now);await rate(db,'manage:'+row.id,now,60000,60);
   const payload=await decrypt(config,row);
   if(route==='status')return respond(publicState(row,payload));
   await rate(db,'test:'+row.id,now,60000,1);await rate(db,'test-hour:'+row.id,now,HOUR,6);
   const lease=await claim(db,row,readNow());if(!lease)fail(429,'An alert delivery is already pending.');
   try{
    const result=await push(config,payload,{title:'Fire Tracker · test notification',body:'This is a test. No new satellite hotspot is being reported.',url:payload.appUrl},fetcher,sendPush,readNow,time=>renew(db,row,lease,time));
    if(result.status===404||result.status===410){await sql(db,'DELETE FROM alert_watches WHERE id=?',row.id).run();fail(410,'Push subscription has expired. Enable notifications again.');}
    if(result.status<200||result.status>=300){await release(db,row,lease,readNow(),{failed:true,retryAfter:result.retryAfter});fail(502,'The push provider did not accept the test.');}
    await release(db,row,lease,readNow());return respond({accepted:true});
   }catch(error){if(error instanceof ApiError)throw error;await release(db,row,lease,readNow(),{failed:true});fail(502,'The push provider did not accept the test.');}
  }
  const body=await readJson(request,1024);fields(body,['cursor']);
  if(body.cursor!==undefined&&body.cursor!==null&&(typeof body.cursor!=='string'||!/^[A-Za-z0-9_-]{22}$/.test(body.cursor)))fail(400,'Invalid dispatch cursor.');
  await rate(db,'dispatch',now,60000,120);
  const selected=(await sql(db,'SELECT * FROM alert_watches WHERE expires_at>? AND id>? ORDER BY id LIMIT 101',now,body.cursor||'').all()).results;
  const rows=selected.slice(0,100),nextCursor=selected.length>100?rows.at(-1).id:null;
  if(!rows.length)return respond({processed:0,sent:0,failed:0,nextCursor});
  const data=await fetchSnapshot(fetcher,now);let processed=0,sent=0,failed=0;
  for(const row of rows){
   const lease=await claim(db,row,readNow());if(!lease)continue;processed++;
   try{
    const payload=await decrypt(config,row);
    const delivered=new Set((await sql(db,'SELECT observation_id FROM alert_deliveries WHERE watch_id=?',row.id).all()).results.map(r=>r.observation_id));
    const found=matches(data,row,payload.watch,row.created_at,readNow()).filter(({row:r})=>!delivered.has(r[0])).slice(0,1000);
    if(!found.length){await accepted(db,row,lease,readNow(),[]);continue;}
    const used=await sql(db,'SELECT count(*) AS n FROM alert_deliveries').first();if(used.n+found.length>100000)throw new Error();
    // The final atomic renewal runs after payload encryption and immediately before network I/O.
    const result=await push(config,payload,notification(payload,found,data),fetcher,sendPush,readNow,time=>renew(db,row,lease,time));
    if(result.status===404||result.status===410){await sql(db,'DELETE FROM alert_watches WHERE id=?',row.id).run();failed++;continue;}
    if(result.status<200||result.status>=300){await release(db,row,lease,readNow(),{failed:true,retryAfter:result.retryAfter});failed++;continue;}
    await accepted(db,row,lease,readNow(),found);sent++;
   }catch{await release(db,row,lease,readNow(),{failed:true});failed++;}
  }
  return respond({processed,sent,failed,nextCursor});
 }catch(error){
  const status=error instanceof ApiError?error.status:503;
  if(status===429)headers.set('Retry-After','60');
  return Response.json({ok:false,error:error instanceof ApiError?error.message:'Alert service is temporarily unavailable.'},{status,headers});
 }
}
