import {validateSnapshot} from './discovery.mjs';
export const PUBLIC_DATA='https://ghanyr.github.io/pantau-api-nusantara/data/';
export const REPOSITORY='https://github.com/GhanyR/pantau-api-nusantara';
export const isStatic=()=>typeof window!=='undefined'&&window.__FIRE_TRACKER_STATIC__===true;
export const assetUrl=path=>typeof document==='undefined'?'/'+path.replace(/^\//,''):new URL(path.replace(/^\//,''),document.baseURI).pathname;
export async function json(url,options={}){const response=await fetch(url,{...options,signal:options.signal||AbortSignal.timeout(35000)});if(!response.ok)throw new Error(`HTTP ${response.status}`);return response.json();}
export async function fetchObservations(){return validateSnapshot(await json(isStatic()?assetUrl('data/observations.json'):PUBLIC_DATA+'observations.json',{cache:'no-cache'}));}
export function fetchWeather(lon,lat,options={}){const url=isStatic()?`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,precipitation&timezone=UTC`:`/api/weather?lon=${lon}&lat=${lat}`;return json(url,options);}
