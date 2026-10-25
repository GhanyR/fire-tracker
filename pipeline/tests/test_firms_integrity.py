import datetime as dt
import types
import unittest
from unittest.mock import patch
from pipeline import firms
from pipeline.tracker_feed import create_observation_snapshot


class FirmsIntegrityTests(unittest.TestCase):
    def fetch(self, records):
        text = 'latitude,longitude,acq_date,acq_time,confidence,frp,bright_ti4\n' + records
        with patch.object(firms.config, 'OFFLINE', False), patch.object(firms.config, 'FIRMS_FILES', {'SNPP':'test.csv'}), patch.object(firms.net, 'get', return_value=types.SimpleNamespace(text=text)):
            return firms.fetch_all()[0]

    def test_missing_frp_is_not_published_as_measured_zero(self):
        data = self.fetch('-2,114,2026-10-25,0100,n,,310\n-2,114,2026-10-25,0200,n,0,310')
        admin = types.SimpleNamespace(prov=['Kalimantan Tengah'], label=lambda index: 'Kab. Kapuas')
        snapshot = create_observation_snapshot(data, [0,0], admin, {}, dt.datetime(2026,10,25,3,tzinfo=dt.timezone.utc))
        self.assertEqual([row[4] for row in snapshot['rows']], [None,0])

    def test_missing_or_unknown_confidence_is_excluded(self):
        data = self.fetch('-2,114,2026-10-25,0100,,,310\n-2,114,2026-10-25,0200,unknown,4,310\n-2,114,2026-10-25,0300,h,4,310')
        self.assertEqual(data['conf'].tolist(), [2])

    def test_bad_acquisition_time_does_not_discard_the_whole_sensor(self):
        data = self.fetch('-2,114,invalid,2500,n,4,310\n-2,114,2026-10-25,,n,4,310\n-2,114,2026-10-25,0300,n,4,310')
        self.assertEqual(len(data['lat']),1)


if __name__=='__main__': unittest.main()
