'use client';
import {useEffect,useRef} from 'react';
import {droneFreshness} from '../lib/drone-data.mjs';
import {coverageFeatures} from '../lib/uav-preview.mjs';
const icon='<span class="uav-halo"></span><span class="uav-bearing"><svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M20 9 25 18 20 16 15 18Z" fill="currentColor"/><path d="m15 18-6 7m16-7 6 7m-16-2-5-9m15 9 5-9M17 18h6v8h-6Z" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><circle cx="9" cy="26" r="4" stroke="currentColor" stroke-width="1.8"/><circle cx="31" cy="26" r="4" stroke="currentColor" stroke-width="1.8"/><circle cx="10" cy="12" r="4" stroke="currentColor" stroke-width="1.8"/><circle cx="30" cy="12" r="4" stroke="currentColor" stroke-width="1.8"/></svg></span><span class="uav-map-label"></span>';
const planeIcon='<span class="uav-halo"></span><span class="uav-bearing"><svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M20 5v29m0-21L7 25v3l13-6 13 6v-3L20 13Zm0 15-6 6h12l-6-6Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg></span><span class="uav-map-label"></span>';
export default function DroneLayer({map,vehicles,selectedId,now,onSelect}){
 const markers=useRef(new Map()),callback=useRef(onSelect);callback.current=onSelect;
 useEffect(()=>{if(!map)return;const empty={type:'FeatureCollection',features:[]};for(const id of ['uav-trails','uav-coverage','uav-gaze','uav-targets'])map.addSource(id,{type:'geojson',data:empty});
 map.addLayer({id:'uav-coverage-fill',type:'fill',source:'uav-coverage',paint:{'fill-color':'#77e5d5','fill-opacity':['case',['get','selected'],.18,.08]}});
 map.addLayer({id:'uav-coverage-edge',type:'line',source:'uav-coverage',paint:{'line-color':'#9af7df','line-width':1.2,'line-opacity':.7}});
 map.addLayer({id:'uav-gaze',type:'line',source:'uav-gaze',paint:{'line-color':'#c5ffeb','line-width':1.2,'line-dasharray':[3,2],'line-opacity':.8}});
 map.addLayer({id:'uav-target-ring',type:'circle',source:'uav-targets',paint:{'circle-pitch-alignment':'map','circle-radius':13,'circle-color':'rgba(0,0,0,0)','circle-stroke-color':'#adffe8','circle-stroke-width':1.2,'circle-stroke-opacity':.8}});
 map.addLayer({id:'uav-target-dot',type:'circle',source:'uav-targets',paint:{'circle-pitch-alignment':'map','circle-radius':3,'circle-color':'#c8ffed'}});
 map.addLayer({id:'uav-trails',type:'line',source:'uav-trails',paint:{'line-color':['case',['get','preview'],'#94efdc',['get','demo'],'#e5b16b','#64c4ce'],'line-width':['case',['get','selected'],2.7,1.5],'line-opacity':['case',['get','selected'],.85,.42],'line-dasharray':[2,2]}});
 return()=>{for(const e of markers.current.values()){cancelAnimationFrame(e.raf);e.marker.remove();}markers.current.clear();try{for(const id of ['uav-trails','uav-target-dot','uav-target-ring','uav-gaze','uav-coverage-edge','uav-coverage-fill'])if(map.getLayer(id))map.removeLayer(id);for(const id of ['uav-trails','uav-coverage','uav-gaze','uav-targets'])if(map.getSource(id))map.removeSource(id);}catch{}};},[map]);
 useEffect(()=>{if(!map)return;let cancelled=false;
 import('maplibre-gl').then(({default:ml})=>{if(cancelled)return;const ids=new Set(vehicles.map(d=>d.id));for(const [id,e] of markers.current)if(!ids.has(id)){cancelAnimationFrame(e.raf);e.marker.remove();markers.current.delete(id);}
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  for(const d of vehicles){let e=markers.current.get(d.id);if(!e){const button=document.createElement('button');button.type='button';button.className='uav-map-marker';button.innerHTML=icon;button.addEventListener('click',event=>{event.stopPropagation();callback.current?.(d.id);});e={button,marker:new ml.Marker({element:button,anchor:'center',opacityWhenCovered:1}).setLngLat([d.lon,d.lat]).addTo(map),display:[d.lon,d.lat],time:0};markers.current.set(d.id,e);}
   if(e.airframe!==d.airframe){e.button.innerHTML=d.airframe==='fixed-wing'?planeIcon:icon;e.airframe=d.airframe;}const signal=droneFreshness(d,now);e.button.className=`uav-map-marker ${d.simulated?'is-demo':''} ${d.preview?'is-preview':''} ${selectedId===d.id?'is-selected':''} ${signal==='stale'||signal==='delayed'?'is-stale':''}`;e.button.setAttribute('aria-label',`${d.simulated?'Drone contoh':'Drone'} ${d.name||d.id}${d.name?' · '+d.id:''}${signal==='stale'?' · posisi lama':''}`);e.button.querySelector('.uav-map-label').textContent=selectedId===d.id?(d.name||d.id)+(d.simulated?' · DEMO':''):'';e.button.querySelector('.uav-bearing').style.transform=`rotate(${d.hdg??0}deg)`;
   e.button.style.zIndex=selectedId===d.id?'5':'1';e.button.setAttribute('aria-pressed',String(selectedId===d.id));if(e.sourceTime!==d.t){e.sourceTime=d.t;cancelAnimationFrame(e.raf);const from=e.display.slice(),start=performance.now(),duration=reduced?0:400;let delta=d.lon-from[0];if(delta>180)delta-=360;if(delta<-180)delta+=360;const step=t=>{const p=duration?Math.min(1,(t-start)/duration):1;e.display=[from[0]+delta*p,from[1]+(d.lat-from[1])*p];e.marker.setLngLat(e.display);if(p<1)e.raf=requestAnimationFrame(step);};e.raf=requestAnimationFrame(step);e.time=d.time;}
  }
  map.getSource('uav-trails')?.setData({type:'FeatureCollection',features:vehicles.filter(d=>d.trail?.length>1).map(d=>({type:'Feature',properties:{demo:d.simulated,preview:d.preview===true,selected:d.id===selectedId},geometry:{type:'LineString',coordinates:d.trail.map(p=>p.slice(0,2))}}))});
  const coverage=coverageFeatures(vehicles);coverage.features.forEach(f=>{f.properties.selected=f.properties.id===selectedId;});map.getSource('uav-coverage')?.setData(coverage);
  const previews=vehicles.filter(d=>d.simulated===true&&d.preview===true&&d.sensor?.target?.length===2);
  map.getSource('uav-gaze')?.setData({type:'FeatureCollection',features:previews.map(d=>({type:'Feature',properties:{id:d.id},geometry:{type:'LineString',coordinates:[[d.lon,d.lat],d.sensor.target]}}))});
  map.getSource('uav-targets')?.setData({type:'FeatureCollection',features:previews.map(d=>({type:'Feature',properties:{id:d.id},geometry:{type:'Point',coordinates:d.sensor.target}}))});
 });return()=>{cancelled=true;};
 },[map,vehicles,selectedId,now]);
 return null;
}
