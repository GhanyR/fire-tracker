/** Render the existing flame/terrain geometry; no generated artwork or remote service. */
import {createRequire} from 'node:module';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {FIRE_BRAND as B} from '../tracker/lib/fire-brand.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(join(resolve(process.env.FIRE_TRACKER_MEDIA_PREFIX||root),'package.json'));
const {Resvg}=require('@resvg/resvg-js');
const target=join(root,'assets/readme'),frames=join(target,'.logo-frames');
await mkdir(frames,{recursive:true});
for(const dark of [false,true]){
 const theme=dark?'dark':'light',bg=dark?'#0d1117':'#ffffff',terrain=dark?B.terrainDark:B.terrain;
 const svg=(scale=1,brightness=0)=>`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="212" viewBox="0 0 80 106"><title>Fire Tracker flame and mountain</title><rect width="80" height="106" fill="${bg}"/><g transform="translate(0 86) scale(1 ${scale}) translate(0 -86)"><path d="${B.flamePath}" fill="rgb(${228+brightness} ${85+Math.round(brightness/2)} 34)"/></g><path d="${B.terrainPath}" fill="${terrain}"/></svg>\n`;
 await writeFile(join(target,`logo-${theme}.svg`),svg());
 await writeFile(join(target,`logo-${theme}.png`),new Resvg(svg()).render().asPng());
 for(let i=0;i<36;i++){
  const t=i/35,scale=1+.018*Math.sin(t*Math.PI*2),brightness=Math.round(9*Math.sin(t*Math.PI)**2);
  await writeFile(join(frames,`${theme}-${String(i).padStart(3,'0')}.png`),new Resvg(svg(scale,brightness)).render().asPng());
 }
}
const result=spawnSync(process.env.FIRE_TRACKER_MEDIA_PYTHON||'python3',['-c',`
from PIL import Image
from pathlib import Path
import sys
p=Path(sys.argv[1]); dest=Path(sys.argv[2])
for theme in ['light','dark']:
 frames=[Image.open(f).convert('RGB').quantize(colors=128,dither=Image.Dither.NONE) for f in sorted(p.glob(theme+'-*.png'))]
 # No loop extension: play once, then leave a complete logo visible.
 frames[0].save(dest/(f'logo-{theme}.gif'),save_all=True,append_images=frames[1:],duration=[400]+[70]*34+[700],optimize=True,disposal=2)
`,frames,target],{stdio:'inherit'});
if(result.status!==0)throw new Error('Pillow GIF encoding failed');
await rm(frames,{recursive:true});
console.log('Rendered static and once-playing logo assets from the approved paths.');
