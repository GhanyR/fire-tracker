"""Contract tests for the ungrouped Fire Tracker satellite feed."""
import datetime as dt
import importlib
import importlib.util
import json
import unittest

import numpy as np


NOW = dt.datetime(2026, 10, 25, 12, tzinfo=dt.timezone.utc)
NOW_TS = 1792929600


class Admin:
    names = ["Kapuas", "Kota Palembang", "Pulang Pisau"]
    prov = ["Kalimantan Tengah", "Sumatera Selatan", "Kalimantan Tengah"]

    def label(self, index):
        name = self.names[index]
        return name if name.startswith("Kota ") else "Kab. " + name


def detections(rows):
    return {key: np.array([row[index] for row in rows], dtype=object)
            for index, key in enumerate(("lon", "lat", "ts", "frp", "conf", "sat"))}


class TrackerFeedTests(unittest.TestCase):
    def snapshot(self, rows, kab=None, fmeta=None, generated_at=NOW):
        # This assertion makes the missing feature an explicit contract failure.
        self.assertIsNotNone(importlib.util.find_spec("pipeline.tracker_feed"),
                             "the raw satellite feed adapter must exist")
        create = importlib.import_module("pipeline.tracker_feed").create_observation_snapshot
        return create(detections(rows), np.array(kab if kab is not None else [0] * len(rows)),
                      Admin(), fmeta or {}, generated_at)

    def test_preserves_raw_observations_from_each_sensor_and_exact_admin_labels(self):
        feed = self.snapshot([
            [114.1, -2.75, NOW_TS - 60, 12.5, 0, 1],
            [114.1, -2.75, NOW_TS - 60, 12.5, 1, 2],
            [105.22, -3.37, NOW_TS, 0, 2, 4],
            [114.101, -2.751, NOW_TS - 120, 8, 2, 8],
        ], [0, 0, 1, 2])
        self.assertEqual(feed["version"], 1)
        self.assertEqual(feed["columns"], ["id", "lon", "lat", "time", "frp", "confidence",
                                           "sensor", "province", "municipality"])
        self.assertEqual(feed["provinces"], ["KALIMANTAN TENGAH", "SUMATERA SELATAN"])
        self.assertEqual(feed["municipalities"], ["Kab. Kapuas", "Kota Palembang", "Kab. Pulang Pisau"])
        self.assertEqual([row[1:] for row in feed["rows"]], [
            [114.1, -2.75, 1792929540000, 12.5, 0, 0, 0, 0],
            [114.1, -2.75, 1792929540000, 12.5, 1, 1, 0, 0],
            [105.22, -3.37, 1792929600000, 0, 2, 2, 1, 1],
            [114.101, -2.751, 1792929480000, 8, 2, 3, 0, 2],
        ])
        self.assertEqual(len({row[0] for row in feed["rows"]}), 4)
        self.assertEqual(feed["retrievedAt"], "2026-10-25T12:00:00+00:00")
        self.assertEqual(feed["latestObservedAt"], "2026-10-25T12:00:00+00:00")

    def test_uses_exact_168_hour_utc_window_including_boundary(self):
        feed = self.snapshot([
            [114, -2, NOW_TS - 604800, 4, 1, 1],
            [114, -2, NOW_TS - 604800.001, 4, 1, 1],
            [114, -2, NOW_TS + .001, 4, 1, 1],
            [114, -2, NOW_TS, 4, 1, 1],
        ], generated_at=NOW.astimezone(dt.timezone(dt.timedelta(hours=7))))
        self.assertEqual([row[3] for row in feed["rows"]], [1792324800000, 1792929600000])
        self.assertEqual(feed["retrievedAt"], "2026-10-25T12:00:00+00:00")

    def test_rejects_malformed_coordinates_times_confidence_source_and_admin(self):
        bad = [
            [float("nan"), -2, NOW_TS, 1, 1, 1], [114, float("inf"), NOW_TS, 1, 1, 1],
            [181, -2, NOW_TS, 1, 1, 1], [114, -91, NOW_TS, 1, 1, 1],
            [114, -2, float("nan"), 1, 1, 1], [114, -2, "invalid", 1, 1, 1],
            [114, -2, NOW_TS, 1, -1, 1], [114, -2, NOW_TS, 1, 3, 1],
            [114, -2, NOW_TS, 1, 1.5, 1], [114, -2, NOW_TS, 1, 1, 3],
            [114, -2, NOW_TS, 1, 1, 1.5],
            [114, -2, NOW_TS, 1, 1, 1], [114, -2, NOW_TS, 1, 1, 1],
        ]
        feed = self.snapshot(bad, [0] * 11 + [-1, 3])
        self.assertEqual(feed["rows"], [])
        self.assertIsNone(feed["latestObservedAt"])
        self.assertTrue(all(source["latestObservedAt"] is None for source in feed["sources"]))
        json.dumps(feed, allow_nan=False)

    def test_missing_and_nonfinite_frp_stays_null_and_ids_survive_refresh_and_reordering(self):
        rows = [[114, -2, NOW_TS - 60, value, 1, 1]
                for value in [None, float("nan"), float("inf"), "unknown", 0]]
        feed = self.snapshot(rows)
        self.assertEqual([row[4] for row in feed["rows"]], [None, None, None, None, 0])
        # FRP, confidence and administrative assignment are not observation identity.
        other = self.snapshot([[114, -2, NOW_TS - 60, 18, 2, 1]], [2], generated_at=NOW + dt.timedelta(minutes=1))
        self.assertEqual({row[0] for row in feed["rows"]}, {other["rows"][0][0]})
        a = self.snapshot([[114, -2, NOW_TS - 60, 3, 1, 1], [114.001, -2, NOW_TS - 60, 3, 1, 1]])
        b = self.snapshot([[114.001, -2, NOW_TS - 60, 3, 1, 1], [114, -2, NOW_TS - 60, 3, 1, 1]])
        self.assertEqual([row[0] for row in a["rows"]], [row[0] for row in reversed(b["rows"])])
        self.assertNotEqual(a["rows"][0][0], a["rows"][1][0])
        json.dumps(feed, allow_nan=False)

    def test_sources_keep_original_urls_errors_and_only_public_metadata(self):
        feed = self.snapshot([[114, -2, NOW_TS - 60, 3, 1, 1]], fmeta={
            "SNPP": {"rows_bbox": 7, "url": "https://wrong.invalid", "token": "private"},
            "N20": {"error": "download failed", "secret": "private"},
            "N21": {"rows_bbox": 0}, "MODIS": {"rows_bbox": 0},
        })
        sources = feed["sources"]
        self.assertEqual([source["id"] for source in sources],
                         ["VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT", "MODIS_NRT"])
        self.assertTrue(all(source["name"] for source in sources))
        self.assertEqual(sources[0]["url"], "https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_SouthEast_Asia_7d.csv")
        self.assertEqual(sources[0]["latestObservedAt"], "2026-10-25T11:59:00+00:00")
        self.assertTrue(sources[0]["ok"])
        self.assertEqual(sources[0]["rows_bbox"], 7)
        self.assertFalse(sources[1]["ok"])
        self.assertEqual(sources[1]["error"], "download failed")
        self.assertIsNone(sources[1]["latestObservedAt"])
        self.assertTrue(sources[2]["ok"])
        self.assertNotIn("private", json.dumps(feed))


if __name__ == "__main__":
    unittest.main()
