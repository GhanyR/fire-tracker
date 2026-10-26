import {DESIGN_BRANCH} from './design-branch.mjs';
import {SCENES,filterSceneRows} from './terrain-scenes.mjs';
import {filterRows} from './fire-data.mjs';
import {temporalRange,summarizeSituation} from './observation-time.mjs';
export const DESIGN_CONCEPTS=Object.freeze([
 {id:'atlas',letter:'A',name:'Atlas',label:'Terang. Tenang. Terbaca.',description:'Peta sebagai pusat. Tipografi editorial dan panel ringan untuk membaca situasi dengan tenang.',strength:'Seimbang untuk publik dan tim pemantau',tradeoff:'Nuansa sinematik lebih halus',color:'#536e51'},
 {id:'vector',letter:'B',name:'Vector',label:'Pusat pantau, fokus penuh.',description:'Kanvas gelap dengan aksen es, kronologi jelas, dan status UAV yang selalu dekat.',strength:'Pemantauan lama dan konteks drone',tradeoff:'Informasi lebih padat',color:'#72e5dc'},
 {id:'ember',letter:'C',name:'Ember',label:'Medan yang bercerita.',description:'Peta memenuhi layar. Kontras hangat, gerak kamera, dan satu tombol putar yang menonjol.',strength:'Presentasi, video dan berbagi',tradeoff:'Daftar observasi lebih ringkas',color:'#ed845c'},
 {id:'field',letter:'D',name:'Field',label:'Jelas saat dibutuhkan.',description:'Ruang kerja bersih dengan kendali besar, daftar yang terbaca, dan detail satu ketukan.',strength:'Pemakaian lapangan dan ponsel',tradeoff:'Ekspresi visual lebih fungsional',color:'#3e70c8'},
]);
const ids=new Set(DESIGN_CONCEPTS.map(c=>c.id));
const scenes=new Set(SCENES.map(s=>s.id));
export function designRoute(hash='') {const p=new URLSearchParams(String(hash).replace(/^#/,''));return {design:ids.has(p.get('design'))?p.get('design'):!p.has('design')&&ids.has(DESIGN_BRANCH)?DESIGN_BRANCH:'compare',sceneId:scenes.has(p.get('scene'))?p.get('scene'):'bromo',hours:[24,48,168].includes(Number(p.get('hours')))?Number(p.get('hours')):24};}
export function designHash({design='compare',sceneId='bromo',hours=24}={}) {const p=new URLSearchParams({designs:'1',design:ids.has(design)?design:'compare',scene:scenes.has(sceneId)?sceneId:'bromo',hours:String([24,48,168].includes(hours)?hours:24)});return '#'+p;}
export function designSnapshot(data,{now=Date.now(),hours=24,sceneId='bromo',progress=100,query=''}={}) {
 const scene=SCENES.find(s=>s.id===sceneId)||SCENES[0];
 const range={...temporalRange({now,hours,progress}),historical:progress<100,progress:Math.max(0,Math.min(100,progress))};
 const province=scene.bbox?-1:data.provinces.indexOf(scene.province);
 const scoped=filterSceneRows(filterRows(data.rows,{now:range.anchor,hours,province,query,provinces:data.provinces,municipalities:data.municipalities}),scene).filter(r=>scene.bbox||province>=0&&r[7]===province);
 const rows=scoped.filter(r=>r[3]<=range.end).sort((a,b)=>b[3]-a[3]||String(a[0]).localeCompare(String(b[0])));
 const summary=summarizeSituation(scoped,data,range);
 return {scene,range,rows,summary,allCount:scoped.length};
}
