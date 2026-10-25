import test from 'node:test';
import assert from 'node:assert/strict';
import {SCENES,withinScene,filterSceneRows,sceneMetrics} from '../lib/terrain-scenes.mjs';
test('scene observations are restricted to its geographic extent',()=>{
 const scene=SCENES[0],inside=['a',112.95,-7.95,10,4,2,1,0,0],outside=['b',111,-2,10,5,1,1,0,0];
 assert.equal(withinScene([inside[1],inside[2]],scene),true);assert.deepEqual(filterSceneRows([inside,outside],scene),[inside]);assert.deepEqual(filterSceneRows([inside,outside],null),[inside,outside]);
});
test('FRP chart uses per-interval maximum and never sums overlapping detections',()=>{
 const rows=[['a',113,-8,10,40,2],['b',113,-8,15,30,1],['c',113,-8,70,null,0]];
 const m=sceneMetrics(rows,0,100,2);assert.deepEqual(m.maxFRP,[40,null]);assert.deepEqual(m.detections,[2,1]);assert.deepEqual(m.highConfidence,[1,0]);
});
