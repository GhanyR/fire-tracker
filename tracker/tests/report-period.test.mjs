import test from 'node:test';
import assert from 'node:assert/strict';
import {reportPeriod} from '../lib/report-period.mjs';
test('report period follows actual cards including live reports newer than a stored snapshot',()=>{
 assert.deepEqual(reportPeriod([{date:'2026-10-16'},{date:'2026-10-26'},{reportedAt:'2026-10-25T10:00:00Z'},{date:'invalid'}]),{from:'2026-10-16',to:'2026-10-26'});
 assert.deepEqual(reportPeriod([{date:'2026-10-26'}]),{from:'2026-10-26',to:'2026-10-26'});
});
test('empty or undated reports do not invent a current reporting window',()=>assert.equal(reportPeriod([{date:'invalid'},{}]),null));
