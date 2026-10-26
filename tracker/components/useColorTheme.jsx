'use client';
import {useCallback,useEffect,useState} from 'react';
import {assetUrl} from '../lib/data-client.mjs';
const KEY='fire-tracker-color-theme';
export default function useColorTheme(initial='light'){
 const [theme,setTheme]=useState(initial==='dark'?'dark':'light');
 useEffect(()=>{try{const saved=localStorage.getItem(KEY);if(saved==='light'||saved==='dark')setTheme(saved);}catch{}const sync=e=>{if(e.key===KEY&&(e.newValue==='light'||e.newValue==='dark'))setTheme(e.newValue);};window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);},[]);
 useEffect(()=>{document.querySelectorAll('link[rel="icon"],link[rel="shortcut icon"]').forEach(link=>{link.href=assetUrl(theme==='dark'?'favicon-dark.svg':'favicon.svg');});},[theme]);
 const choose=useCallback(next=>{if(next!=='light'&&next!=='dark')return;setTheme(next);try{localStorage.setItem(KEY,next);}catch{}},[]);
 return [theme,choose];
}
