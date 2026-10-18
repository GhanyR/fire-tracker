# Basemap sources (Indonesia wildfire dashboard)

Built 2026-10-17. Every input was downloaded from raw.githubusercontent.com or registry.npmjs.org. Vector coordinates are rounded to 3 decimals (about 110 m). All files use WGS84 lon/lat (EPSG:4326).

## peat.geojson: PROXY, not an official peat map

No KLHK, BBSDLP, Wetlands International or CIFOR peat vector could be found on GitHub or npm. This layer combines two open proxies. The features do not overlap, and each one carries a `src` property.

| src | Feature(s) | Input | Licence |
|---|---|---|---|
| `wwf_teow_2001` | "Sumatran peat swamp forests", "Borneo peat swamp forests", "Peninsular Malaysian peat swamp forests" ecoregion polygons | WWF Terrestrial Ecoregions of the World (Olson et al. 2001, BioScience 51:933). Copy: github.com/earthlab/firedpy `firedpy/data/world_eco_regions/wwf_terr_ecos.gpkg` | WWF distributes it free with citation of Olson et al. 2001. No formal open licence found [unsourced]. |
| `soilgrids250m_histpr_10km` | Cells where the SoilGrids250m Histosol probability is 30% or more, outside the WWF polygons. Cells are closed with a 0.06 deg buffer, clipped to Natural Earth land, and polygons under about 100 km2 are dropped. | ISRIC SoilGrids250m (Hengl et al. 2017). The 1 km Histosol probability averaged to 0.1 deg: github.com/ISRICWorldSoil/SoilGrids250m `grids/CIFOR/HISTPR_10km.tif` | ODbL v1.0 (SoilGrids250m 2017) [verified] |

Caveats:
- Ecoregions show the historical extent of peat swamp forest at about 1:1M scale (2001). They do not include Central Kalimantan's large peat domes in full, and they do not cover Papua. The SoilGrids layer fills those gaps (Central Kalimantan, south Papua around Merauke and Mappi) at 10 km resolution, so it is blocky.
- The 30% threshold was chosen because Histosol probability >= 30% over the whole bbox adds up to about 134,000 km2. That is close to the official Indonesian peat area (BBSDLP 2019: 13.43 Mha).
- The combined layer is about 218,000 km2 (`area_km2` is approximate, deg2 x 12321). It includes Malaysian and Brunei peat, and in Indonesia it overstates the official extent. Use it for display and rough hotspot-on-peat flags, not for statistics.
- Other inputs I checked and rejected: `grids/CIFOR/peatlands_10km.tif` in the same ISRIC repo (rasterised "Indonesia_peatlands" but it only has values in Borneo), and the GLWD v2 peat classes in github.com/sovrynn/ecdo (binary 0.42 deg blocks, far too coarse).
- For an authoritative layer, use KLHK "Peta Lahan Gambut Indonesia 1:50.000" (BBSDLP 2019) or the KLHK KHG/FEG layers (sippeg.menlhk.go.id). Neither is reachable through GitHub or npm.

## roads.geojson, places.geojson, rivers.geojson, land.geojson

Source: Natural Earth 10m vector, github.com/nvkelso/natural-earth-vector (`geojson/` folder, master branch). Licence: public domain (Natural Earth terms of use).

All four are clipped to bbox lon 94 to 142, lat -12 to 7.

| File | Input | Processing | Properties kept |
|---|---|---|---|
| roads.geojson | ne_10m_roads | clipped, ferries dropped, simplified 0.003 deg | `type`, `scalerank`, `name` (rarely set) |
| places.geojson | ne_10m_populated_places | points inside bbox, sorted by pop_max descending | `name`, `pop_max`, `adm1name`, `iso_a2`, `featurecla`, `lat`, `lon` |
| rivers.geojson | ne_10m_rivers_lake_centerlines | clipped, simplified 0.003 deg | `name`, `featurecla`, `scalerank` |
| land.geojson | ne_10m_land | clipped, simplified 0.005 deg, islands under about 5 km2 dropped | `featurecla` |

Natural Earth 10m rivers are sparse in Indonesia (20 features, among them Kapuas, Barito, Mahakam, Kayan, Indragiri, Asahan, Digul, Mamberamo and Baliem).

## relief_indonesia.png (+ relief_indonesia.json)

- Input: NASA Visible Earth "Topography" image (id 73934), `gebco_08_rev_elev_21600x10800.png`. It is 1 arc-minute and derived from GEBCO_08 / SRTM. Copy: github.com/jasmeet0915/S.T.A.R (master).
- Cropped to lon 94.5 to 141.5, lat -11.5 to 6.5. Size 2820 x 1080 px at 1/60 deg/px. 8-bit grayscale.
- Value to metres: elevation_m ≈ value × 6400 / 255 (about 25.1 m per step). 0 means sea level, below sea level or ocean. 255 means 6400 m or more. I checked this against lake surfaces (Titicaca, Namtso, Qinghai, Great Salt Lake, Victoria); all matched within 1 step.
- Licence: NASA imagery, public domain in the US. Credit NASA Earth Observatory and GEBCO.

## imagery_indonesia.jpg (+ imagery_indonesia.json)

- Input: NASA Blue Marble Shaded Relief + Bathymetry (GIBS layer `BlueMarble_ShadedRelief_Bathymetry`). Taken as zoom-7 EPSG:3857 tiles from the npm package `@freetiler/nasa-bluemarble@1.0.17` (144 tiles) and reprojected to plate carree with bilinear resampling.
- Same bbox as the relief. Size 3760 x 1440 px at 1/80 deg/px. JPEG quality 84.
- Licence: NASA open data policy, free to use; credit to NASA / GIBS is requested. The npm wrapper is MIT.

## Not obtained

- Fire stations (OSM amenity=fire_station for Indonesia): I found no GitHub or npm extract.
