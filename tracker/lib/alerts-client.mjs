import {operationsBase} from './operations-client.mjs';
import {normalizeWatch} from './nearby-alerts.mjs';
import {assetUrl} from './data-client.mjs';
export const ALERT_STORAGE='fire-tracker:nearby-alert:v1';
export async function alertsRequest(action,{saved,body,method=body?'POST':'GET'}={}){
 const headers={};if(body)headers['Content-Type']='application/json';if(saved){headers['X-Alert-Id']=saved.id;headers.Authorization=`Bearer ${saved.token}`;}
 const response=await fetch(`${operationsBase()}/api/alerts/${action}`,{method,headers,body:body?JSON.stringify(body):undefined,credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(25000)});
 let result;try{result=await response.json();}catch{throw new Error('The alerts service could not be reached. Try again shortly.');}
 if(!response.ok||!result.ok){const error=new Error(result.error||'The alerts request failed. Please try again.');error.status=response.status;throw error;}return result;
}
export function alertSupport(){
 if(typeof window==='undefined')return {supported:false,reason:'Checking this browser…'};
 const ios=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1),installed=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 if(ios&&!installed)return {supported:false,needsInstall:true,reason:'On iPhone or iPad, add Fire Tracker to your Home Screen in Safari, then open it there to enable alerts. Requires iOS/iPadOS 16.4 or later.'};
 if(!window.isSecureContext||!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))return {supported:false,reason:'Push alerts are unavailable in this browser. Open Fire Tracker in Chrome, Edge, Firefox, or supported Safari.'};
 return {supported:true,reason:'This browser supports push alerts.'};
}
export async function alertRegistration(){
 const registration=await navigator.serviceWorker.register(assetUrl('alerts-sw.js'),{scope:assetUrl('alerts/')});
 if(!registration.active){const worker=registration.installing||registration.waiting;if(!worker)throw new Error('The notification worker is not ready. Try again.');await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>finish(new Error('The notification worker took too long. Try again.')),15000);const changed=()=>{if(worker.state==='activated')finish();else if(worker.state==='redundant')finish(new Error('The notification worker could not start.'));};function finish(error){clearTimeout(timeout);worker.removeEventListener('statechange',changed);error?reject(error):resolve();}worker.addEventListener('statechange',changed);changed();});}
 return registration;
}
export function applicationKey(value){const normal=value.replace(/-/g,'+').replace(/_/g,'/'),bytes=atob(normal+'='.repeat((4-normal.length%4)%4));return Uint8Array.from(bytes,c=>c.charCodeAt(0));}

export function readSavedAlert(raw,now=Date.now()){
 try{const value=JSON.parse(raw);if(!/^[A-Za-z0-9_-]{22}$/.test(value?.id)||!/^[A-Za-z0-9_-]{43}$/.test(value?.token)||!(Date.parse(value.expiresAt)>now))return null;return {...value,watch:normalizeWatch(value.watch)};}catch{return null;}
}
export const isStaleWatchError=error=>[401,404,410].includes(error?.status);
export async function clearLocalAlert({storage=globalThis.localStorage,worker=globalThis.navigator?.serviceWorker,scope}={}){
 storage?.removeItem(ALERT_STORAGE);
 try{const registration=await worker?.getRegistration(scope||new URL('alerts/',document.baseURI).href),subscription=await registration?.pushManager.getSubscription();await subscription?.unsubscribe();}catch{}
}
