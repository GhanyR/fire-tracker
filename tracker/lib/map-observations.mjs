import {validCoordinates} from './fire-data.mjs';
export function observationCollection(rows){
 return {type:'FeatureCollection',features:rows.filter(r=>Array.isArray(r)&&validCoordinates([r[1],r[2]])&&Number.isFinite(r[3])).map((r,index)=>({type:'Feature',geometry:{type:'Point',coordinates:[r[1],r[2]]},properties:{id:r[0],index,confidence:r[5],frp:r[4],observed:r[3]}}))};
}
// Preload once per scope. Advancing or scrubbing the clock changes only a layer
// filter, so a slow device never has to finish reclustering a moving target.
export function createReplayDataWriter(){
 let lastSource,lastRows;
 return (source,rows)=>{if(source===lastSource&&rows===lastRows)return;source.setData(observationCollection(rows));lastSource=source;lastRows=rows;};
}
export function replayTimeFilter(at){
 return Number.isFinite(at)?['all',['==',['typeof',['get','observed']],'number'],['<=',['get','observed'],at]]:['literal',false];
}

export function playbackFrameReady({moving,sourceLoaded,tilesLoaded,elapsed}){return !moving&&sourceLoaded&&(tilesLoaded||elapsed>=15000);}

// Keep imagery and observations readable while a distant destination's terrain
// loads. The DEM remains requested by hillshade; restore elevation only after
// the new camera has settled and its tiles are available.
export function preparePlaybackTerrain(map,exaggeration,terrainAvailable){
 map.setTerrain(null);
 let timer,restored=false;
 const check=()=>{if(!restored&&!map.isMoving()&&terrainAvailable()){restored=true;clearInterval(timer);map.setTerrain({source:'dem',exaggeration});}};
 map.on('idle',check);timer=setInterval(check,250);
 return()=>{clearInterval(timer);map.off('idle',check);};
}

// A failed raster tile also counts as "source loaded". Use successful DEM
// events, including valid cached tiles, rather than restoring blank terrain.
export function observeTerrainAvailability(map){
 const tiles=new Map();
 const record=e=>{const tile=e.tile,id=tile?.tileID?.canonical;if(e.sourceId!=='dem'||!id)return;const key=`${id.z}/${id.x}/${id.y}`;if(tile.state==='loaded'&&tile.dem){tiles.set(key,tile);if(tiles.size>512)tiles.delete(tiles.keys().next().value);}else if(tile.state==='errored')tiles.delete(key);};
 map.on('sourcedata',record);
 const available=()=>{
  if(!map.isSourceLoaded('dem'))return false;
  const {lng,lat}=map.getCenter(),minZoom=Math.max(0,Math.floor(map.getZoom())-4),sin=Math.sin(lat*Math.PI/180);
  for(const [key,tile] of tiles){if(tile.state!=='loaded'||!tile.dem){tiles.delete(key);continue;}const {z,x,y}=tile.tileID.canonical,n=2**z,tx=Math.floor((lng+180)/360*n),ty=Math.floor((.5-Math.log((1+sin)/(1-sin))/(4*Math.PI))*n);if(z>=minZoom&&x===((tx%n)+n)%n&&y===ty)return true;}
  return false;
 };
 return {available,dispose:()=>{map.off('sourcedata',record);tiles.clear();}};
}
