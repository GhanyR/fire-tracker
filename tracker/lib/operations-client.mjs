import {isStatic} from './data-client.mjs';
export const OPERATIONS_ORIGIN='https://fire-tracker.fiveprayerapp.chatgpt.site';
export function operationsBase(){return isStatic()&&!['localhost','127.0.0.1','[::1]'].includes(location.hostname)?OPERATIONS_ORIGIN:'';}
export async function operationsRequest(action,{method='GET',sessionId,token,body,signal,keepalive=false}={}){
 const headers={};if(body)headers['Content-Type']='application/json';if(sessionId)headers['X-Operation-Id']=sessionId;if(token)headers.Authorization=`Bearer ${token}`;
 const controller=new AbortController(),abort=()=>controller.abort(signal?.reason);if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(()=>controller.abort(new DOMException('Koneksi sesi terlalu lama. Coba lagi.','TimeoutError')),15000);
 try{const response=await fetch(`${operationsBase()}/api/operations/${action}`,{method,headers,body:body?JSON.stringify(body):undefined,cache:'no-store',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:controller.signal,keepalive});
 let result;try{result=await response.json();}catch{throw new Error('Server operasi belum tersedia. Coba lagi sebentar.');}
 if(!response.ok||!result.ok){const messages={401:'Kunci sesi tidak valid atau sesi sudah berakhir.',403:'Kunci ini tidak memiliki izin untuk tindakan tersebut.',429:'Terlalu banyak permintaan. Coba lagi dalam satu menit.',503:'Server operasi sementara tidak tersedia.'};const error=new Error(messages[response.status]||result.error||'Permintaan sesi belum berhasil.');error.status=response.status;throw error;}return result;}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}

}
export function parseFieldInvite(hash){const p=new URLSearchParams(String(hash).replace(/^#/,''));if(p.get('field')!=='1')return null;const sessionId=p.get('session')||'',inviteToken=p.get('invite')||'';return /^[A-Za-z0-9_-]{12,100}$/.test(sessionId)&&/^[A-Za-z0-9_-]{24,160}$/.test(inviteToken)?{sessionId,inviteToken}:null;}
export function fieldInviteUrl(sessionId,inviteToken){const u=new URL(location.pathname,location.origin);u.hash=new URLSearchParams({field:'1',session:sessionId,invite:inviteToken});return u.href;}
export const teamStatus={pending:'Belum berbagi GPS',ready:'Siap',enroute:'Dalam perjalanan',working:'Di lokasi',returning:'Kembali',need_assistance:'Perlu bantuan','need-assistance':'Perlu bantuan'};
export function teamFreshness(unit,now=Date.now()){if(unit.simulated)return 'demo';const t=Date.parse(unit.t);return !Number.isFinite(t)?'pending':now-t>60000?'stale':now-t>15000?'delayed':'fresh';}
export function demoResources(elapsed,now=Date.now()){return [{id:'TEAM-01',kind:'team',name:'Regu Alpha',mission:'Pemeriksaan lapangan',status:'working',lat:-8.055+Math.sin(elapsed/90000)*.001,lon:112.963},{id:'TEAM-02',kind:'team',name:'Regu Bravo',mission:'Pemeriksaan akses',status:'enroute',lat:-8.045,lon:112.975+Math.sin(elapsed/100000)*.002},{id:'VEH-01',kind:'vehicle',name:'Tanki 01',mission:'Dukungan air',status:'ready',lat:-8.038,lon:112.98}].map(u=>({...u,t:new Date(now).toISOString(),accuracy:8,simulated:true}));}

export function visibleOperationUnits(units,now=Date.now(),expiresAt=null){
 if(expiresAt&&Date.parse(expiresAt)<=now)return [];
 return units.map(u=>{const t=Date.parse(u.t);return Number.isFinite(t)&&t<=now+10000&&now-t<900000?u:{...u,lat:null,lon:null,accuracy:null,alt:null,alt_msl:null,hdg:null,spd:null,streams:[],status:u.status==='pending'?'pending':'stale'};});
}
