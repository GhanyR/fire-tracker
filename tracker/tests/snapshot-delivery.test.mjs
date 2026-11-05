import test from 'node:test';import assert from 'node:assert/strict';
import * as proxy from '../lib/snapshot-proxy.mjs';
import {snapshotCoversRange} from '../lib/observation-time.mjs';
test('a newer observation window cannot be described by an expired snapshot',()=>{
 assert.equal(snapshotCoversRange({retrievedAt:'2026-11-02T00:00:00Z'},{start:Date.parse('2026-11-04T00:00:00Z')}),false);
 assert.equal(snapshotCoversRange({retrievedAt:'2026-11-05T00:00:00Z'},{start:Date.parse('2026-11-04T00:00:00Z')}),true);
 assert.equal(snapshotCoversRange(null,{start:0}),false);
});
test('snapshot proxy tries the public mirror when the primary fails and returns an uncached error when both fail',async()=>{
 let calls=[];const result=await proxy.fetchPublishedSnapshot(async (url)=>{calls.push(url);return calls.length===1?new Response('no',{status:503}):new Response('{"rows":[]}',{status:200,headers:{'content-type':'application/json'}});});
 assert.equal(result.status,200);assert.equal(await result.text(),'{"rows":[]}');assert.equal(calls.length,2);
 const failed=await proxy.fetchPublishedSnapshot(async()=>new Response('no',{status:503}));assert.equal(failed.status,502);assert.match(failed.headers.get('cache-control'),/no-store/);
});
