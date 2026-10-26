'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {demoDrones,mergeDroneFrame,validateBridgeUrl} from '../lib/drone-data.mjs';
export default function useDroneFeed(){
 const [vehicles,setVehicles]=useState([]),[status,setStatus]=useState('idle'),[error,setError]=useState(''),[mode,setMode]=useState('none'),[hasLiveSession,setHasLiveSession]=useState(false),[paused,setPaused]=useState(false),[now,setNow]=useState(Date.now());
 const session=useRef(0),cleanup=useRef(()=>{}),elapsed=useRef(0),pausedRef=useRef(false);
 const stop=useCallback(()=>{session.current++;cleanup.current();cleanup.current=()=>{};},[]);
 const disconnect=useCallback(()=>{stop();setMode('none');setStatus('idle');setVehicles([]);setError('');setPaused(false);},[stop]);
 const startDemo=useCallback(()=>{stop();setVehicles(mergeDroneFrame([],demoDrones(0)));elapsed.current=0;pausedRef.current=false;setPaused(false);setError('');setMode('demo');setStatus('demo');
  const timer=setInterval(()=>{if(pausedRef.current)return;elapsed.current+=500;setVehicles(old=>mergeDroneFrame(old,demoDrones(elapsed.current)));},500);cleanup.current=()=>clearInterval(timer);
 },[stop]);
 const togglePause=useCallback(()=>{pausedRef.current=!pausedRef.current;setPaused(pausedRef.current);},[]);
 const connect=useCallback((address,token='')=>{
  let url;try{url=validateBridgeUrl(address,location.protocol);}catch(e){setError(e.message);return false;}
  stop();const current=session.current;setHasLiveSession(true);setMode('live');setStatus('connecting');setError('');setVehicles([]);setPaused(false);
  let ws,timer,heartbeat,handshake,attempt=0,intentional=false;
  const open=()=>{if(current!==session.current||intentional)return;setStatus(attempt?'reconnecting':'connecting');
   try{ws=new WebSocket(url);}catch{setError('Bridge belum dapat dibuka. Periksa alamat dan koneksi.');setStatus('error');return;}
   handshake=setTimeout(()=>{if(current===session.current){setError('Bridge belum mengirim status. Periksa token dan alamat /ws.');ws.close();}},10000);
   ws.onopen=()=>{if(token)ws.send(JSON.stringify({type:'auth',token}));heartbeat=setInterval(()=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'ping'}));},15000);};
   ws.onmessage=e=>{if(current!==session.current||typeof e.data!=='string'||e.data.length>262144)return;let packet;try{packet=JSON.parse(e.data);}catch{return;}
    if(packet?.type==='error'){setError('Bridge menolak koneksi. Periksa token dan izin pembaca.');setStatus('error');return;}
    if(packet?.type==='hello'||packet?.type==='telemetry'||Array.isArray(packet?.drones)){clearTimeout(handshake);attempt=0;setStatus('connected');setError('');setVehicles(old=>mergeDroneFrame(old,packet));}
   };
   ws.onerror=()=>{if(current===session.current)setError('Koneksi bridge terputus. Periksa jaringan, TLS dan token.');};
   ws.onclose=e=>{clearInterval(heartbeat);clearTimeout(handshake);if(current!==session.current||intentional)return;if(e.code===1008){setStatus('error');setError('Token tidak diterima atau izin koneksi ditolak.');return;}setStatus('reconnecting');timer=setTimeout(open,Math.min(15000,1000*2**Math.min(attempt++,4)));};
  };open();cleanup.current=()=>{intentional=true;clearTimeout(timer);clearTimeout(handshake);clearInterval(heartbeat);ws?.close();};return true;
 },[stop]);
 useEffect(()=>{const tick=setInterval(()=>setNow(Date.now()),1000);return()=>{clearInterval(tick);stop();};},[stop]);
 return {vehicles,status,error,mode,hasLiveSession,paused,now,startDemo,togglePause,connect,disconnect};
}
