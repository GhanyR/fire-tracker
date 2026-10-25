"""Public, ungrouped satellite observations for the Fire Tracker frontend."""
import datetime as dt
import hashlib
import math

from . import config


SENSORS = (
    ("SNPP", 1, "VIIRS_SNPP_NRT", "VIIRS S-NPP"),
    ("N20", 2, "VIIRS_NOAA20_NRT", "VIIRS NOAA-20"),
    ("N21", 4, "VIIRS_NOAA21_NRT", "VIIRS NOAA-21"),
    ("MODIS", 8, "MODIS_NRT", "MODIS Terra/Aqua"),
)


def create_observation_snapshot(det, kab, admin, fmeta, generated_at):
    """Retain individual valid detections from the preceding exact 168 hours.

    ``ts`` is the original acquisition time in Unix seconds, never the build
    time. Municipality indices refer to the original Admin labels. No spatial
    coalescing or cross-sensor deduplication is applied.
    """
    if generated_at.tzinfo is None or generated_at.utcoffset() is None:
        raise ValueError("generated_at must include a timezone")
    generated_at = generated_at.astimezone(dt.timezone.utc)
    end = generated_at.timestamp()
    start = end - 168 * 60 * 60
    provinces = sorted({str(province).upper() for province in admin.prov})
    province_index = {province: index for index, province in enumerate(provinces)}
    municipalities = [admin.label(index) for index in range(len(admin.prov))]
    sensor_index = {code: index for index, (_, code, _, _) in enumerate(SENSORS)}
    latest_by_sensor = [None] * len(SENSORS)
    rows = []
    frp_values = det.get("frp")
    for index, admin_index in enumerate(kab):
        try:
            lon, lat, timestamp, confidence, source, municipality = (
                float(value) for value in (
                    det["lon"][index], det["lat"][index], det["ts"][index],
                    det["conf"][index], det["sat"][index], admin_index))
        except (TypeError, ValueError, OverflowError):
            continue
        if not all(math.isfinite(value) for value in (lon, lat, timestamp, confidence, source, municipality)):
            continue
        if not (-180 <= lon <= 180 and -90 <= lat <= 90 and start <= timestamp <= end):
            continue
        if confidence not in (0, 1, 2) or source not in sensor_index:
            continue
        if not municipality.is_integer() or not 0 <= municipality < len(municipalities):
            continue
        municipality = int(municipality)
        sensor = sensor_index[source]
        try:
            frp = float(frp_values[index]) if frp_values is not None else None
        except (TypeError, ValueError, OverflowError):
            frp = None
        if frp is not None and not math.isfinite(frp):
            frp = None
        # Float hex preserves supplied coordinate/time precision, independently
        # of input ordering, refreshed metadata, FRP, confidence or admin labels.
        identity = "|".join((SENSORS[sensor][2], lon.hex(), lat.hex(), timestamp.hex()))
        observation_id = hashlib.sha256(identity.encode("ascii")).hexdigest()[:32]
        province = province_index[str(admin.prov[municipality]).upper()]
        rows.append([observation_id, lon, lat, round(timestamp * 1000), frp,
                     int(confidence), sensor, province, municipality])
        latest = latest_by_sensor[sensor]
        if latest is None or timestamp > latest:
            latest_by_sensor[sensor] = timestamp

    def observed_at(timestamp):
        return dt.datetime.fromtimestamp(timestamp, dt.timezone.utc).isoformat() if timestamp is not None else None

    sources = []
    for index, (key, _, source_id, name) in enumerate(SENSORS):
        metadata = fmeta.get(key, {})
        source = dict(id=source_id, name=name, url=config.FIRMS_BASE + config.FIRMS_FILES[key],
                      latestObservedAt=observed_at(latest_by_sensor[index]),
                      ok=key in fmeta and "error" not in metadata)
        if "error" in metadata:
            source["error"] = str(metadata["error"])
        if "rows_bbox" in metadata:
            try:
                source["rows_bbox"] = int(metadata["rows_bbox"])
            except (TypeError, ValueError, OverflowError):
                pass
        sources.append(source)
    latest = max((value for value in latest_by_sensor if value is not None), default=None)
    return dict(version=1, columns=["id", "lon", "lat", "time", "frp", "confidence", "sensor", "province", "municipality"],
                provinces=provinces, municipalities=municipalities, sources=sources, rows=rows,
                retrievedAt=generated_at.isoformat(), latestObservedAt=observed_at(latest))
