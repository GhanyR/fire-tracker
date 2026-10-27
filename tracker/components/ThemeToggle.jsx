'use client';
import {Moon,Sun} from 'lucide-react';
export default function ThemeToggle({theme,onChange}){
 const dark=theme==='dark';
 return <button className="theme-toggle" aria-label="Mode gelap" aria-pressed={dark} title={dark?'Gunakan mode terang':'Gunakan mode gelap'} onClick={()=>onChange(dark?'light':'dark')}><span className="theme-toggle-icons"><Sun size={13}/><Moon size={13}/><i/></span><span className="theme-toggle-label">{dark?'Gelap':'Terang'}</span></button>;
}
