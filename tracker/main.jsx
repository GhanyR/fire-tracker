import React from 'react';
import {createRoot} from 'react-dom/client';
import FireDashboard from './components/FireDashboard';
import {legacyDestination} from './lib/legacy-link.mjs';
import './styles/globals.css';
import './styles/terrain-workspace.css';
import './styles/fire-tracker.css';
import './styles/uav-workspace.css';
window.__FIRE_TRACKER_STATIC__=true;
const legacy=legacyDestination(location.hash,document.baseURI);
if(legacy)location.replace(legacy);
else {
createRoot(document.getElementById('root')).render(<FireDashboard/>);
if ('serviceWorker' in navigator && import.meta.env.PROD) window.addEventListener('load',()=>navigator.serviceWorker.register(new URL('sw.js',document.baseURI)).then(r=>r.update()).catch(()=>{}));
}
