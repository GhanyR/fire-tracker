"""Regression tests for the public telemetry boundary; no real aircraft required."""
import asyncio
import json
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import drone_bridge as bridge
from aiohttp.test_utils import TestClient, TestServer


class NormalizationTests(unittest.TestCase):
    def test_coordinates_reject_nonfinite_boolean_and_numeric_strings(self):
        for bad in (float('inf'), float('-inf'), float('nan'), 10**400, True, '', '12.3', None):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                bridge.norm_telemetry({'lat': bad, 'lon': 100})

    def test_missing_measurements_stay_unknown_and_simulation_is_retained(self):
        data = bridge.norm_telemetry({'id': 'sim-1', 'lat': 0, 'lon': 0, 'link': 'sim'})
        for key in ('alt', 'alt_msl', 'hdg', 'spd', 'bat', 'armed'):
            self.assertIsNone(data[key], key)
        self.assertTrue(data['simulated'])
        self.assertTrue(bridge.norm_telemetry({'lat': 0, 'lon': 0, 'simulated': True})['simulated'])

    def test_source_time_requires_utc_and_preserves_observation_instant(self):
        data = bridge.norm_telemetry({'lat': 0, 'lon': 0, 't': '2026-10-26T08:00:00+00:00'})
        self.assertEqual(data['t'], '2026-10-26T08:00:00.000Z')
        for bad in ('yesterday', '2026-10-26T08:00:00', '2026-10-26T08:00:00+07:00', 0):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                bridge.norm_telemetry({'lat': 0, 'lon': 0, 't': bad})

    def test_optional_measurements_reject_corrupt_values(self):
        for key, bad in [('alt', float('inf')), ('hdg', 361), ('bat', 101), ('spd', -1), ('armed', 'false')]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                bridge.norm_telemetry({'lat': 0, 'lon': 0, key: bad})

    def test_future_position_cannot_poison_aircraft_ordering(self):
        with self.assertRaises(ValueError):
            bridge.norm_telemetry({'id':'uav','lat':-8,'lon':113,'t':'2099-01-01T00:00:00Z'})

    def test_cot_omits_unknown_track_but_keeps_known_zero(self):
        data = bridge.norm_telemetry({'id':'uav','lat':-8,'lon':113})
        state={'drones':{'uav':data},'detections':[],'reports':[]}
        self.assertNotIn('<track ', bridge.cot_events(state=state)[0])
        data.update(hdg=0,spd=0)
        self.assertIn('<track course="0" speed="0"',bridge.cot_events(state=state)[0])

    def test_non_loopback_binding_requires_authentication(self):
        with self.assertRaises(ValueError):
            bridge.create_app(host='0.0.0.0', publisher_token='', read_token='')
        bridge.create_app(host='127.0.0.1', publisher_token='', read_token='')
        bridge.create_app(host='0.0.0.0', publisher_token='publish-secret', read_token='read-secret')
        with self.assertRaises(ValueError):
            bridge.create_app(publisher_token='same-secret', read_token='same-secret')

    def test_mavlink_heartbeat_keeps_last_gps_observation_time(self):
        def message(kind, **fields):
            return SimpleNamespace(get_type=lambda: kind, get_srcSystem=lambda: 1, **fields)
        feed = bridge.MavlinkTelemetry(max_vehicles=2)
        position = message('GLOBAL_POSITION_INT', lat=-27634000, lon=1141032000,
                           relative_alt=80000, alt=120000, hdg=65535, time_boot_ms=1000)
        first = feed.ingest(position, received_at='2026-10-26T08:00:00Z')
        self.assertEqual(first['alt'], 80)
        self.assertIsNone(first['hdg'])
        self.assertIsNone(feed.ingest(position, received_at='2026-10-26T08:00:01Z'))
        beat = feed.ingest(message('HEARTBEAT', type=2, base_mode=128),
                           received_at='2026-10-26T08:01:00Z')
        self.assertEqual(beat['t'], '2026-10-26T08:00:00.000Z')
        self.assertTrue(beat['armed'])
        older = message('GLOBAL_POSITION_INT', lat=-10000000, lon=1100000000,
                        relative_alt=1, alt=1, hdg=0, time_boot_ms=900)
        self.assertIsNone(feed.ingest(older, received_at='2026-10-26T08:02:00Z'))


class BridgeIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def start(self, **kwargs):
        self.client = TestClient(TestServer(bridge.create_app(**kwargs)))
        await self.client.start_server()
        self.addAsyncCleanup(self.client.close)
        return self.client

    async def test_local_legacy_publisher_and_bounded_out_of_order_state(self):
        client = await self.start(publisher_token='', read_token='', max_vehicles=2, max_history=2)
        ws = await client.ws_connect('/ws')
        self.assertEqual((await ws.receive_json())['type'], 'hello')
        # Optional auth remains harmless for existing tokenless local clients.
        await ws.send_json({'type': 'auth', 'token': ''})
        first = {'id': 'a', 'lat': 1, 'lon': 2, 't': '2026-10-26T08:00:00Z'}
        self.assertEqual((await client.post('/telemetry', json=first)).status, 200)
        self.assertEqual((await ws.receive_json())['id'], 'a')
        older = {**first, 'lat': 8, 't': '2026-10-26T07:59:59Z'}
        self.assertEqual((await client.post('/telemetry', json=older)).status, 409)
        for name in ('b', 'c'):
            self.assertEqual((await client.post('/telemetry', json={**first, 'id': name})).status, 200)
        for i in range(3):
            self.assertEqual((await client.post('/report', json={'lat': 1, 'lon': 2, 'note': str(i)})).status, 200)
        state = await (await client.get('/state')).json()
        self.assertEqual([d['id'] for d in state['drones']], ['b', 'c'])
        self.assertEqual([r['note'] for r in state['reports']], ['1', '2'])
        await ws.close()

    async def test_http_auth_readers_cannot_publish_and_batch_is_atomic(self):
        client = await self.start(publisher_token='pub', read_token='read')
        self.assertEqual((await client.get('/state')).status, 401)
        self.assertEqual((await client.get('/state', headers={'Authorization': 'Bearer café'})).status, 401)
        self.assertEqual((await client.get('/state', headers={'Authorization': 'Bearer read'})).status, 200)
        body = {'lat': 1, 'lon': 2}
        self.assertEqual((await client.post('/telemetry', json=body, headers={'Authorization': 'Bearer read'})).status, 403)
        headers = {'Authorization': 'Bearer pub'}
        self.assertEqual((await client.post('/telemetry', json=[body, {'lat': 100, 'lon': 2}], headers=headers)).status, 400)
        self.assertEqual((await (await client.get('/state', headers=headers)).json())['drones'], [])
        self.assertEqual((await client.post('/telemetry', json=body, headers=headers)).status, 200)
        dated = {'id': 'dated', 'lat': 1, 'lon': 2, 't': '2026-10-26T08:00:00Z'}
        await client.post('/telemetry', json=dated, headers=headers)
        batch = [{'id': 'not-stored', 'lat': 3, 'lon': 4}, {**dated, 't': '2026-10-26T07:59:00Z'}]
        self.assertEqual((await client.post('/telemetry', json=batch, headers=headers)).status, 409)
        state = await (await client.get('/state', headers=headers)).json()
        self.assertNotIn('not-stored', [d['id'] for d in state['drones']])
        options = await client.options('/telemetry')
        self.assertIn('Authorization', options.headers['Access-Control-Allow-Headers'])

    async def test_ws_auth_precedes_snapshot_and_readers_cannot_publish(self):
        client = await self.start(publisher_token='pub', read_token='read', auth_timeout=1.0)
        bad = await client.ws_connect('/ws')
        self.assertEqual((await bad.receive()).type.name, 'CLOSE')
        wrong = await client.ws_connect('/ws')
        await wrong.send_json({'type': 'auth', 'token': 'wrong'})
        self.assertEqual((await wrong.receive()).type.name, 'CLOSE')
        viewer = await client.ws_connect('/ws')
        await viewer.send_json({'type': 'auth', 'token': 'read'})
        self.assertEqual((await viewer.receive_json())['type'], 'hello')
        await viewer.send_json({'type': 'telemetry', 'lat': 1, 'lon': 2})
        self.assertEqual((await viewer.receive_json())['type'], 'error')
        publisher = await client.ws_connect('/ws')
        await publisher.send_json({'type': 'auth', 'token': 'pub'})
        await publisher.receive_json()
        await publisher.send_json({'type': 'telemetry', 'id': 'uav', 'lat': 1, 'lon': 2})
        self.assertEqual((await viewer.receive_json())['id'], 'uav')
        await viewer.send_json({'type': 'ping'})
        self.assertEqual((await viewer.receive_json())['type'], 'pong')
        await publisher.close()
        await viewer.close()

    async def test_invalid_json_shape_is_a_client_error(self):
        client = await self.start(publisher_token='', read_token='')
        for body in (None, True, [1], {'lat': 1, 'lon': 2, 't': 'invalid'}):
            response = await client.post('/telemetry', data=json.dumps(body), headers={'Content-Type': 'application/json'})
            self.assertEqual(response.status, 400)


if __name__ == '__main__':
    unittest.main()
