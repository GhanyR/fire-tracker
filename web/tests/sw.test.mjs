import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

test('app updates preserve offline data and caches belonging to other sites', async () => {
  const saved = new Map([
    ['pantau-api-v5-data', 'last FIRMS snapshot'],
    ['pantau-api-v5-tiles', 'downloaded imagery'],
    ['pantau-api-v5-pkg', 'offline incident package'],
    ['pantau-api-v4-shell', 'obsolete application'],
    ['another-site-v1-data', 'unrelated site data'],
  ]);
  const handlers = new Map();
  vm.runInNewContext(source, {
    self: {addEventListener: (name, handler) => handlers.set(name, handler), clients: {claim: async () => {}}},
    caches: {keys: async () => [...saved.keys()], delete: async key => saved.delete(key)},
  });
  let done;
  handlers.get('activate')({waitUntil: work => {done = work;}});
  await done;
  assert.equal(saved.get('another-site-v1-data'), 'unrelated site data');
  assert.equal(saved.get('pantau-api-v5-data'), 'last FIRMS snapshot');
  assert.equal(saved.get('pantau-api-v5-tiles'), 'downloaded imagery');
  assert.equal(saved.get('pantau-api-v5-pkg'), 'offline incident package');
  assert.equal(saved.has('pantau-api-v4-shell'), false);
});

test('private APIs and authenticated requests bypass offline caching',async()=>{
 const handlers=new Map();vm.runInNewContext(source,{self:{location:{origin:'https://example.org'},addEventListener:(name,handler)=>handlers.set(name,handler)},URL,caches:{open:async()=>({match:async()=>null,put:async()=>{}})},fetch:async()=>new Response('{}')});
 for(const request of [new Request('https://example.org/api/alerts/status',{headers:{Authorization:'Bearer private','X-Alert-Id':'watch'}}),new Request('https://example.org/api/operations/state'),new Request('https://example.org/export.json',{headers:{Authorization:'Bearer private'}})]){
  let intercepted=false;handlers.get('fetch')({request,respondWith:work=>{intercepted=true;work.catch(()=>{});}});assert.equal(intercepted,false,request.url);
 }
});
