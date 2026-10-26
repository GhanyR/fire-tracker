'use client';
import {useEffect,useRef} from 'react';
import {droneFreshness} from '../lib/drone-data.mjs';
const icon='<span class="uav-halo"></span><span class="uav-bearing"><svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M20 9 25 18 20 16 15 18Z" fill="currentColor"/><path d="m15 18-6 7m16-7 6 7m-16-2-5-9m15 9 5-9M17 18h6v8h-6Z" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><circle cx="9" cy="26" r="4" stroke="currentColor" stroke-width="1.8"/><circle cx="31" cy="26" r="4" stroke="currentColor" stroke-width="1.8"/><circle cx="10" cy="12" r="4" stroke="currentColor" stroke-width="1.8"/><circle cx="30" cy="12" r="4" stroke="currentColor" stroke-width="1.8"/></svg></span><span class="uav-map-label"></span>';
export default function DroneLayer({map,vehicles,selectedId,now,onSelect}){
 const markers=useRef(new Map()),callback=useRef(onSelect);callback.current=onSelect;
 useEffect(()=>{if(!map)return;map.addSource('uav-trails',{type:'geojson',data:{type:'FeatureCollection',features:[]}});map.addLayer({id:'uav-trails',type:'line',source:'uav-trails',paint:{'line-color':['case',['get','demo'],'#e5b16b','#64c4ce'],'line-width':['case',['get','selected'],2.7,1.5],'line-opacity':['case',['get','selected'],.85,.42],'line-dasharray':[2,2]}});return()=>{for(const e of markers.current.values()){cancelAnimationFrame(e.raf);e.marker.remove();}markers.current.clear();try{if(map.getLayer('uav-trails'))map.removeLayer('uav-trails');if(map.getSource('uav-trails'))map.removeSource('uav-trails');}catch{}};},[map]);
 useEffect(()=>{if(!map)return;let cancelled=false;
 import('maplibre-gl').then(({default:ml})=>{if(cancelled)return;const ids=new Set(vehicles.map(d=>d.id));for(const [id,e] of markers.current)if(!ids.has(id)){cancelAnimationFrame(e.raf);e.marker.remove();markers.current.delete(id);}
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  for(const d of vehicles){let e=markers.current.get(d.id);if(!e){const button=document.createElement('button');button.type='button';button.className='uav-map-marker';button.innerHTML=icon;button.addEventListener('click',event=>{event.stopPropagation();callback.current?.(d.id);});e={button,marker:new ml.Marker({element:button,anchor:'center',opacityWhenCovered:1}).setLngLat([d.lon,d.lat]).addTo(map),display:[d.lon,d.lat],time:0};markers.current.set(d.id,e);}
   const signal=droneFreshness(d,now);e.button.className=`uav-map-marker ${d.simulated?'is-demo':''} ${selectedId===d.id?'is-selected':''} ${signal==='stale'||signal==='delayed'?'is-stale':''}`;e.button.setAttribute('aria-label',`${d.simulated?'Drone contoh':'Drone'} ${d.id}${signal==='stale'?' · posisi lama':''}`);e.button.querySelector('.uav-map-label').textContent=selectedId===d.id?d.id+(d.simulated?' · DEMO':''):'';e.button.querySelector('.uav-bearing').style.transform=`rotate(${d.hdg??0}deg)`;
   if(e.time!==d.time){cancelAnimationFrame(e.raf);const from=e.display.slice(),start=performance.now(),duration=reduced?0:400;let delta=d.lon-from[0];if(delta>180)delta-=360;if(delta<-180)delta+=360;const step=t=>{const p=duration?Math.min(1,(t-start)/duration):1;e.display=[from[0]+delta*p,from[1]+(d.lat-from[1])*p];e.marker.setLngLat(e.display);if(p<1)e.raf=requestAnimationFrame(step);};e.raf=requestAnimationFrame(step);e.time=d.time;}
  }
  map.getSource('uav-trails')?.setData({type:'FeatureCollection',features:vehicles.filter(d=>d.trail?.length>1).map(d=>({type:'Feature',properties:{demo:d.simulated,selected:d.id===selectedId},geometry:{type:'LineString',coordinates:d.trail.map(p=>p.slice(0,2))}}))});
 });return()=>{cancelled=true;};
 },[map,vehicles,selectedId,now]);
 return null;
}
