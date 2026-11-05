import {validateSnapshot} from './discovery.mjs';
export const PUBLIC_DATA='https://ghanyr.github.io/fire-tracker/data/';
export const REPOSITORY='https://github.com/GhanyR/fire-tracker';
export const isStatic=()=>typeof window!=='undefined'&&window.__FIRE_TRACKER_STATIC__===true;
export const assetUrl=path=>typeof document==='undefined'?'/'+path.replace(/^\//,''):new URL(path.replace(/^\//,''),document.baseURI).pathname;
export async function json(url,{signal,timeoutMs=35000,...options}={}){
 const request=new AbortController(),cancel=()=>request.abort(signal.reason);
 if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
 const timer=setTimeout(()=>request.abort(new DOMException('Request timed out','TimeoutError')),timeoutMs);
 try{const response=await fetch(url,{...options,signal:request.signal});if(!response.ok)throw new Error(`HTTP ${response.status}`);return await response.json();}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
}
export async function fetchObservations({signal}={}){const direct=isStatic()?assetUrl('data/observations.json'):PUBLIC_DATA+'observations.json';if(!isStatic())try{return validateSnapshot(await json('/api/snapshot',{signal,timeoutMs:135000}));}catch(error){if(signal?.aborted)throw error;}return validateSnapshot(await json(isStatic()?direct:'https://raw.githubusercontent.com/GhanyR/fire-tracker/data/data/observations.json',{cache:'no-cache',signal,timeoutMs:180000}));}
export function fetchWeather(lon,lat,options={}){const url=isStatic()?`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,precipitation&timezone=UTC`:`/api/weather?lon=${lon}&lat=${lat}`;return json(url,options);}

// Critical observations publish independently of optional GIS/context requests.
export function loadInitialFeeds(loaders,onResult,onError){
 let active=true;
 const run=(key,load)=>Promise.resolve().then(()=>active?load():undefined).then(value=>{if(active)onResult(key,value);}).catch(error=>{if(active)onError?.(key,error);});
 const critical=run('snapshot',loaders.snapshot);
 const completed={snapshot:critical};
 for(const [key,load] of Object.entries(loaders))if(key!=='snapshot')completed[key]=critical.then(()=>active?run(key,load):undefined);
 return {completed,settled:Promise.allSettled(Object.values(completed)),cancel:()=>{active=false;}};
}
