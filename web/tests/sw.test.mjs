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
