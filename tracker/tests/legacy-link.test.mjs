import test from 'node:test';
import assert from 'node:assert/strict';
import {legacyDestination} from '../lib/legacy-link.mjs';
test('existing incident and field-tool links retain their exact hash under the legacy app',()=>{
 for(const hash of ['#KRH-SB9Z','#KRH-SB9Z-3d','#KRH-SB9Z-2','#KRH-SB9Z-2-3d','#cuaca','#insiden','#integrasi','#sumber','#bot','#dekat','#drone','#laporan','#lainnya'])assert.equal(legacyDestination(hash,'https://example.org/fire-tracker/'),'https://example.org/fire-tracker/legacy/'+hash);
});
test('new observation and scene links continue opening Fire Tracker',()=>{
 for(const hash of ['','#scene=bromo-semeru','#id=abc&kind=satellite','#hours=24&q=Kapuas','#unknown'])assert.equal(legacyDestination(hash,'https://example.org/'),null);
});
