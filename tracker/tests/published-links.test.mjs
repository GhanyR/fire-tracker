import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {retargetPublishedData} from '../scripts/retarget-data.mjs';

test('repository moves retarget retained metadata and KML without changing source freshness or raw observations',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'fire-tracker-links-'));
 try{
  const oldPages='https://example.github.io/previous-project',oldRepo='https://github.com/example/previous-project';
  const meta={pages_url:oldPages,repo_url:oldRepo,generated:'2026-10-25T00:00:00Z',tmax:1792886400000,det24:123};
  const raw='{"rows":[[1,2,1792886400000]],"retrievedAt":"2026-10-25T00:00:00Z"}';
  await mkdir(join(dir,'feeds'));await writeFile(join(dir,'meta.json'),JSON.stringify(meta));await writeFile(join(dir,'observations.json'),raw);
  await writeFile(join(dir,'feeds/network-link.kml'),`<name>Siaga Api</name><href>${oldPages}/data/feeds/incidents.kml</href>`);
  const pagesUrl='https://example.github.io/fire-tracker',repositoryUrl='https://github.com/example/fire-tracker';
  assert.equal(await retargetPublishedData(dir,{pagesUrl,repositoryUrl}),2);
  assert.deepEqual(JSON.parse(await readFile(join(dir,'meta.json'),'utf8')),{...meta,pages_url:pagesUrl,repo_url:repositoryUrl});
  assert.equal(await readFile(join(dir,'observations.json'),'utf8'),raw);
  assert.equal(await readFile(join(dir,'feeds/network-link.kml'),'utf8'),`<name>Fire Tracker</name><href>${pagesUrl}/data/feeds/incidents.kml</href>`);
  assert.equal(await retargetPublishedData(dir,{pagesUrl,repositoryUrl}),0);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('frontend-only packaging permits absent retained data',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'fire-tracker-links-'));
 try{assert.equal(await retargetPublishedData(dir,{pagesUrl:'https://example.github.io/fire-tracker'}),0);}finally{await rm(dir,{recursive:true,force:true});}
});
