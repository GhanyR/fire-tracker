import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as sdk from '../fire-tracker.mjs';

let server, url, bridge, bridgeUrl;
const received=[];
before(async()=>{
 server=createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;
  const seen={method:req.method,path:req.url,headers:req.headers,body:raw?JSON.parse(raw):null};received.push(seen);
  res.setHeader('Content-Type','application/json');
  if(req.headers.authorization==='Bearer denied'){res.writeHead(403);res.end(JSON.stringify({ok:false,error:'capability denied'}));return;}
  res.end(JSON.stringify({ok:true,sessionId:'session-1',adminToken:'admin-test',viewerToken:'viewer-test',publisherToken:'pub-test',inviteToken:'invite-test',deviceId:'member-1',deviceToken:'device-test',units:[],seen}));
 });server.listen(0,'127.0.0.1');await once(server,'listening');url=`http://127.0.0.1:${server.address().port}`;
 bridge=spawn('python3',[fileURLToPath(new URL('./bridge-fixture.py',import.meta.url))],{stdio:['ignore','pipe','pipe']});
 bridge.stderr.on('data',chunk=>process.stderr.write(chunk));
 const [line]=await once(bridge.stdout,'data');bridgeUrl=`http://127.0.0.1:${Number(line.toString().trim())}`;
});
after(async()=>{server?.closeAllConnections();if(server){server.close();await once(server,'close');}bridge?.kill();if(bridge?.exitCode===null)await once(bridge,'exit');});

test('operations SDK sends exact private API paths and capability headers without URL secrets',async()=>{
 assert.equal(typeof sdk.OperationsClient,'function');
 const anonymous=new sdk.OperationsClient({url});
 const created=await anonymous.create({label:'Training response'});assert.equal(created.adminToken,'admin-test');assert.equal(created.seen.path,'/api/operations/create');assert.deepEqual(created.seen.body,{label:'Training response'});assert.equal(created.seen.headers.authorization,undefined);
 const joined=await anonymous.join({sessionId:'session-1',inviteToken:'invite-test',name:'Team Alpha',kind:'team'});assert.deepEqual(joined.seen.body,{sessionId:'session-1',inviteToken:'invite-test',name:'Team Alpha',kind:'team'});assert.equal(joined.seen.path,'/api/operations/join');
 const publisher=new sdk.OperationsClient({url,sessionId:'session-1',token:'pub-test'});
 const state=await publisher.state();assert.equal(state.seen.method,'GET');assert.equal(state.seen.path,'/api/operations/state');assert.equal(state.seen.headers['x-operation-id'],'session-1');assert.equal(state.seen.headers.authorization,'Bearer pub-test');
 const original='2026-10-26T08:00:00.123456+00:00';
 const unit=await publisher.publishUnit({id:'aircraft-1',kind:'drone',lat:0,lon:0,t:original,name:'Alpha',airframe:'fixed-wing'});assert.equal(unit.seen.path,'/api/operations/unit');assert.equal(unit.seen.body.unit.t,original);assert.equal(unit.seen.body.unit.kind,'drone');assert.equal(unit.seen.body.unit.bat,null);assert.equal(unit.seen.body.unit.name,'Alpha');assert.equal(Object.hasOwn(unit.seen.body.unit,'type'),false);assert.equal(Object.hasOwn(unit.seen.body.unit,'link'),false);
 const member=new sdk.OperationsClient({url,sessionId:'session-1',token:joined.deviceToken});
 const position=await member.publishPosition({lat:0,lon:0,t:original,accuracy:0,status:'responding'});assert.equal(position.seen.path,'/api/operations/position');assert.deepEqual(position.seen.body,{lat:0,lon:0,t:original,accuracy:0,status:'responding'});assert.equal(position.seen.headers.authorization,'Bearer device-test');
 const stopped=await member.stopSharing();assert.deepEqual([stopped.seen.method,stopped.seen.path],['DELETE','/api/operations/device']);
 const ended=await new sdk.OperationsClient({url,sessionId:'session-1',token:created.adminToken}).endSession();assert.deepEqual([ended.seen.method,ended.seen.path],['DELETE','/api/operations/end']);
 assert.ok(received.every(r=>!/[?#]/.test(r.path)));
});

test('operations SDK refuses missing acquisition time, capabilities and URL credentials',async()=>{
 const client=new sdk.OperationsClient({url,sessionId:'session-1',token:'pub-test'});
 await assert.rejects(client.publishUnit({id:'uav',lat:0,lon:0}),/t/);
 await assert.rejects(client.publishPosition({lat:0,lon:0}),/t/);
 await assert.rejects(new sdk.OperationsClient({url,sessionId:'session-1'}).state(),/token/);
 await assert.rejects(new sdk.OperationsClient({url,token:'pub-test'}).state(),/sessionId/);
 for(const endpoint of [`${url}?token=secret`,`${url}#secret`,'https://user:secret@example.org'])assert.throws(()=>new sdk.OperationsClient({url:endpoint}));
 await assert.rejects(new sdk.OperationsClient({url,sessionId:'session-1',token:'denied'}).state(),/403/);
});

test('relay forwards real authenticated bridge telemetry to private HTTP API with original observation time',async()=>{
 const {relayBridgeToOperations}=await import('../examples/bridge-to-cloud.mjs');
 const errors=[];const relay=await relayBridgeToOperations({bridgeUrl,bridgeToken:'read-test',operationsUrl:url,sessionId:'relay-session',publisherToken:'cloud-pub-test',onError:e=>errors.push(e)});
 try{
  const count=received.length;const publisher=new sdk.FireTrackerClient({url:bridgeUrl,token:'pub-test'});
  await publisher.publishTelemetry({id:'relay-aircraft',lat:0,lon:0,t:'2026-10-26T08:00:00Z',simulated:true,name:'Relay Alpha',mission:'Synthetic test',airframe:'multirotor'});
  const deadline=Date.now()+2000;while(!received.slice(count).some(x=>x.body?.unit?.id==='relay-aircraft')&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));
  const forwarded=received.slice(count).find(x=>x.body?.unit?.id==='relay-aircraft');assert.ok(forwarded);assert.equal(forwarded.body.unit.t,'2026-10-26T08:00:00.000Z');assert.equal(forwarded.body.unit.kind,'drone');assert.equal(forwarded.body.unit.simulated,true);assert.equal(forwarded.body.unit.name,'Relay Alpha');assert.equal(forwarded.headers.authorization,'Bearer cloud-pub-test');assert.equal(forwarded.headers['x-operation-id'],'relay-session');assert.equal(forwarded.path,'/api/operations/unit');assert.deepEqual(errors,[]);
 }finally{await relay.close();}
});
