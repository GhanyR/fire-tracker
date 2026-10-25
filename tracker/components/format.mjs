export const number=value=>new Intl.NumberFormat('id-ID',{maximumFractionDigits:1}).format(value);
export const title=value=>String(value||'').toLocaleLowerCase('id').replace(/\b\p{L}/gu,c=>c.toLocaleUpperCase('id'));
export function time(value,zone='Asia/Jakarta'){if(!value)return 'Waktu belum tersedia';const d=new Date(value);if(!Number.isFinite(+d))return String(value);return new Intl.DateTimeFormat('id-ID',{timeZone:zone,day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false}).format(d)+' WIB';}
export function date(value){if(!value)return 'Belum tersedia';return new Intl.DateTimeFormat('id-ID',{timeZone:'UTC',day:'numeric',month:'short',year:'numeric'}).format(new Date(String(value).slice(0,10)+'T00:00:00Z'));}
export const sourceTime=(value)=>value?String(value).replace('T',' ').replace(/\.\d+Z$/,' UTC'):'Waktu belum tersedia';
export function age(value,now=Date.now()){const h=(now-new Date(value).getTime())/3600000;if(!Number.isFinite(h))return 'usia tidak diketahui';return h<1?`${Math.max(0,Math.round(h*60))} menit lalu`:h<24?`${Math.floor(h)} jam lalu`:`${Math.floor(h/24)} hari lalu`;}
export const confidenceNames=['Rendah','Nominal','Tinggi'];
export const navLink=c=>`https://www.google.com/maps/search/?api=1&query=${c[1]},${c[0]}`;
export const download=(filename,body,type='text/plain')=>{const u=URL.createObjectURL(new Blob([body],{type}));const a=document.createElement('a');a.href=u;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);};
