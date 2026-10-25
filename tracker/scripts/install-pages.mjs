// Combine the terrain-first app with the existing field tools and fixed feeds.
import {cp,mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const target=resolve(process.argv[2]||'site');
await mkdir(join(target,'legacy'),{recursive:true});
const legacy=await readFile(join(target,'index.html'),'utf8');
await writeFile(join(target,'legacy/index.html'),legacy.replace('<head>','<head>\n<base href="../">'));
await cp(new URL('../dist/',import.meta.url),target,{recursive:true});
const assets=(await readdir(join(target,'assets'))).map(name=>'assets/'+name);
let worker=await readFile(new URL('../../web/sw.js',import.meta.url),'utf8');
worker=worker.replace("const V = 'pantau-api-v6'", "const V = 'pantau-api-v7'");
worker=worker.replace("const SHELL = [",`const SHELL = ${JSON.stringify([...assets,'favicon.svg','legacy/'])}.concat([`).replace("dist.min.js'];", "dist.min.js']);");
await writeFile(join(target,'sw.js'),worker);
console.log('Fire Tracker + legacy field tools assembled at',target);
