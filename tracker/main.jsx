import React from 'react';
import {createRoot} from 'react-dom/client';
import FireDashboard from './components/FireDashboard';
import './styles/globals.css';
import './styles/terrain-workspace.css';
import './styles/fire-tracker.css';
window.__FIRE_TRACKER_STATIC__=true;
createRoot(document.getElementById('root')).render(<FireDashboard/>);
if ('serviceWorker' in navigator && import.meta.env.PROD) window.addEventListener('load',()=>navigator.serviceWorker.register(new URL('sw.js',document.baseURI)).then(r=>r.update()).catch(()=>{}));
