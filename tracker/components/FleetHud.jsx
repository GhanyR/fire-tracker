'use client';
import {Camera,Drone,Map,Navigation,Video,X} from 'lucide-react';
import {number,time} from './format.mjs';
const metric=(x,unit='')=>Number.isFinite(x)?number(Math.round(x*10)/10)+unit:'—';
export default function FleetHud({drone,feed,virtual,onVirtual,onCamera,onClose}){
 if(!drone)return null;
 return <div className={`fleet-hud ${virtual?'expanded':''}`}><div className="fleet-map-heading"><div><span className={drone.simulated?'demo':''}><i/>{drone.simulated?'SIMULASI ARMADA':'TELEMETRI TERHUBUNG'}</span><strong>{drone.name||drone.id}</strong><small>{drone.mission||'Pantauan UAV'}</small></div><div><button className={virtual?'active':''} onClick={onVirtual}><Map size={14}/>Peta 3D</button>{drone.streams?.length>0&&<button onClick={onCamera}><Video size={14}/>Kamera</button>}{virtual&&<button aria-label="Tutup pantauan 3D" onClick={onClose}><X size={15}/></button>}</div></div>
 {virtual&&<><div className="fleet-view-corner one"/><div className="fleet-view-corner two"/><div className="fleet-view-corner three"/><div className="fleet-view-corner four"/><div className="fleet-view-mark"><i/><i/></div><div className="fleet-view-note">PETA 3D · BUKAN VIDEO KAMERA</div><div className="fleet-view-telemetry"><div><span>ALT REL</span><strong>{metric(drone.alt,' m')}</strong></div><div><span>KECEPATAN</span><strong>{metric(drone.spd,' m/s')}</strong></div><div><span>ARAH</span><strong>{metric(drone.hdg,'°')}</strong></div><div><span>BATERAI</span><strong>{metric(drone.bat,'%')}</strong></div><small>{time(drone.time)} · {drone.lat.toFixed(5)}, {drone.lon.toFixed(5)}</small></div></>}
 </div>;
}
