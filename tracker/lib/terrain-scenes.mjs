export const SCENES=[
 {id:'bromo',name:'Bromo–Semeru',region:'Jawa Timur',province:'JAWA TIMUR',description:'Kaldera Tengger dan lereng Semeru',center:[112.955,-8.015],zoom:11.35,pitch:66,bearing:-26,bbox:[112.65,-8.30,113.25,-7.65]},
 {id:'ijen',name:'Ijen–Raung',region:'Jawa Timur',province:'JAWA TIMUR',description:'Bentang vulkanik di ujung timur Jawa',center:[114.115,-8.115],zoom:11.15,pitch:66,bearing:27,bbox:[113.8,-8.45,114.5,-7.8]},
 {id:'meratus',name:'Pegunungan Meratus',region:'Kalimantan Selatan',province:'KALIMANTAN SELATAN',description:'Punggungan hutan di Kalimantan Selatan',center:[115.55,-2.68],zoom:10.4,pitch:64,bearing:-36,bbox:[115.15,-3.2,116,-2.1]},
 {id:'kalteng',name:'Kalimantan Tengah',region:'Kalimantan Tengah',province:'KALIMANTAN TENGAH',description:'Dataran gambut dan kawasan hutan',center:[113.3,-2.2],zoom:7,pitch:58,bearing:-15,bbox:null}
];
export function withinScene(c,scene){if(!scene?.bbox)return true;if(!Array.isArray(c)||c.length<2)return false;const [w,s,e,n]=scene.bbox;return c[0]>=w&&c[0]<=e&&c[1]>=s&&c[1]<=n;}
export const filterSceneRows=(rows,scene)=>scene?.bbox?rows.filter(r=>withinScene([r[1],r[2]],scene)):rows;
export function sceneMetrics(rows,start,end,bins=40){const detections=Array(bins).fill(0),maxFRP=Array(bins).fill(null),highConfidence=Array(bins).fill(0);for(const r of rows){if(r[3]<start||r[3]>end)continue;const i=Math.min(bins-1,Math.floor((r[3]-start)/Math.max(1,end-start)*bins));detections[i]++;if(r[4]!==null&&Number.isFinite(r[4]))maxFRP[i]=Math.max(maxFRP[i]??0,r[4]);if(r[5]===2)highConfidence[i]++;}return {detections,maxFRP,highConfidence};}
