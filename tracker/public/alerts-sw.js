/* Dedicated push-only worker. It does not intercept or cache page/API requests. */
const APP_BASE=new URL('../',self.registration.scope);
function publicMapUrl(value){
 const target=new URL(APP_BASE);
 try{const source=new URL(value,APP_BASE);if(source.origin!==APP_BASE.origin||source.pathname!==APP_BASE.pathname)return target.href;
  const input=new URLSearchParams(source.hash.slice(1)),output=new URLSearchParams();
  for(const key of ['id','kind','time','sensor','lon','lat','zoom','hours']){const value=input.get(key);if(value&&value.length<=180)output.set(key,value);}
  target.hash=output.toString();
 }catch{}
 return target.href;
}
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('push',event=>{
 let payload={};try{payload=event.data?.json()||{};}catch{}
 const title=typeof payload.title==='string'?payload.title.slice(0,100):'Fire Tracker update';
 const body=typeof payload.body==='string'?payload.body.slice(0,900):'Open Fire Tracker to check the latest source information.';
 event.waitUntil(self.registration.showNotification(title,{body,icon:new URL('icons/alert-192.png',APP_BASE).href,badge:new URL('icons/alert-192.png',APP_BASE).href,tag:'fire-tracker-nearby',data:{url:publicMapUrl(payload.url)},renotify:true}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();const url=publicMapUrl(event.notification.data?.url);
 event.waitUntil((async()=>{const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const client of windows){const current=new URL(client.url);if(current.origin===APP_BASE.origin&&current.pathname===APP_BASE.pathname){await client.navigate(url);await client.focus();return;}}await self.clients.openWindow(url);})());
});
