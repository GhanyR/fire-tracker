import test from 'node:test';
import assert from 'node:assert/strict';
import {playbackBins,playbackFocus,nextPlaybackProgress} from '../lib/playback-focus.mjs';
import {temporalRange} from '../lib/observation-time.mjs';
const H=3600000, anchor=Date.UTC(2026,9,27), start=anchor-24*H;
const data={provinces:['JAWA TIMUR','KALIMANTAN TENGAH'],municipalities:['LUMAJANG','PALANGKA RAYA']};
const row=(id,lon,lat,t,p=0,m=0)=>[id,lon,lat,t,null,1,0,p,m];
const range={start,anchor,end:start+3*H,hours:24};

test('camera follows the latest newly revealed observation, not an older dense region or a future point',()=>{
 const rows=[row('older',113,-8,start+H),...Array.from({length:20},(_,i)=>row('dense'+i,114,-3,start+2.1*H,1,1)),row('newest',112.95,-8.1,start+2.9*H),row('near',112.96,-8.11,start+2.8*H),row('future',120,-1,start+3.1*H)];
 const focus=playbackFocus(rows,data,range);
 assert.equal(focus?.row[0],'newest');
 assert.equal(focus.name,'LUMAJANG');
 assert.equal(focus.count,2);
 assert.equal(focus.intervalCount,22);
 assert.ok(focus.bounds[0][0]>112.8&&focus.bounds[1][0]<113.2);
 assert.deepEqual(focus.center,[112.95,-8.1]);
});
test('empty intervals hold the camera rather than returning a stale target',()=>{
 assert.equal(playbackFocus([row('old',113,-8,start+H)],data,range),null);
});
test('window start is included once; invalid and out-of-window coordinates cannot become camera targets',()=>{
 const rows=[row('edge',113,-8,start),row('invalid',NaN,-8,start),row('outside',113,91,start),row('before',112,-8,start-1)];
 assert.equal(playbackFocus(rows,data,{...range,end:start})?.row[0],'edge');
 assert.equal(playbackFocus(rows,data,{...range,end:start+H+1}),null);
});
test('simultaneous acquisitions have a stable target regardless of source row ordering',()=>{
 const rows=[row('b',113,-8,start+2.5*H),row('a',112.9,-8,start+2.5*H)];
 assert.equal(playbackFocus(rows,data,range)?.row[0],'a');
 assert.equal(playbackFocus(rows,data,range)?.key,playbackFocus([...rows].reverse(),data,range)?.key);
});
test('playback jumps over empty bins, visits the final acquisition, and finishes at the current anchor',()=>{
 const bins=Array.from({length:24},(_,i)=>({count:[3,10,23].includes(i)?1:0}));
 assert.equal(nextPlaybackProgress(bins,0),100/6);
 assert.equal(nextPlaybackProgress(bins,100/6),100*11/24);
 assert.equal(nextPlaybackProgress(bins,100*11/24),100);
 assert.equal(nextPlaybackProgress(bins,100),100);
 assert.equal(nextPlaybackProgress(Array.from({length:24},()=>({count:0})),0),100);
});

test('complete stepping path focuses acquisitions on exact bin edges, including the final frame',()=>{
 for(const hours of [24,48,168]){
  const full=temporalRange({now:anchor,hours});const width=(full.anchor-full.start)/24;
  for(const edge of [0,1,2,23,24]){
   const rows=[row('edge-'+edge,113,-8,full.start+edge*width)];
   const bins=playbackBins(rows,full);
   let progress=0,seen=[];
   for(let step=0;step<26;step++){
    const at=temporalRange({now:anchor,hours,progress});const focus=playbackFocus(rows,data,at);
    if(focus)seen.push(focus.row[0]);
    if(progress>=100)break;
    progress=nextPlaybackProgress(bins,progress);
   }
   assert.ok(seen.includes('edge-'+edge),`${hours}h edge ${edge} skipped`);
  }
 }
});
