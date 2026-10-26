import test from 'node:test';
import assert from 'node:assert/strict';
import * as ops from '../lib/operations-client.mjs';
const now=Date.UTC(2026,9,27,1),unit={id:'team-1',kind:'team',name:'Regu uji',lat:-8,lon:113,t:new Date(now-900000).toISOString(),accuracy:8};
test('offline clients remove coordinates at the retention boundary without mutating source timestamps',()=>{
 const result=ops.visibleOperationUnits?.([unit],now);
 assert.equal(result?.[0]?.lat,null);assert.equal(result?.[0]?.lon,null);assert.equal(result?.[0]?.t,unit.t);assert.equal(unit.lat,-8);
 assert.equal(ops.visibleOperationUnits?.([{...unit,t:new Date(now-899999).toISOString()}],now)?.[0]?.lat,-8);
});
test('expired sessions cannot retain units or camera targets and unknown or future observation times do not show positions',()=>{
 assert.deepEqual(ops.visibleOperationUnits?.([unit],now,new Date(now).toISOString()),[]);
 for(const t of [null,'invalid',new Date(now+20000).toISOString()])assert.equal(ops.visibleOperationUnits?.([{...unit,t}],now)?.[0]?.lat,null);
});
