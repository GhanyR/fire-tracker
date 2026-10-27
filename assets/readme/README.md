# readme media

These are captures of Fire Tracker, not product mockups. Captured on **27 October 2026** from the [public map](https://ghanyr.github.io/fire-tracker/). They are dated examples, not current incident reports.

| Files | What they show |
|---|---|
| `map-light.jpg`, `map-dark.jpg` | The same Bromo–Semeru area, seven-day satellite window, two interface themes. |
| `observation.jpg` | One NASA FIRMS VIIRS NOAA-21 detection, acquired 27 October at 00:41 WIB, with time, FRP and confidence visible. A hotspot is not confirmation of a fire. |
| `history.gif`, `history-still.jpg` | Actual satellite-history playback with camera follow. Captured over about eight seconds, shortened to 4.84 seconds. The complete frame is retained; only size, palette and timing were reduced. The still is an original frame from the recording. This is not a fire-spread model. |
| `fleet-light.jpg`, `fleet-dark.jpg` | The public fleet demo with simulated UAVs and teams. The 3D basemap preview is not an aircraft camera feed. No physical aircraft was used. |
| `report.jpg` | The situation-report dialog with its selected period, source time and observation counts. |
| `mobile.jpg`, `mobile-list.jpg` | The same public map and dated regional list at a 390 × 844 browser viewport. No personal GPS was accessed. |
| `logo-light.*`, `logo-dark.*` | The existing flame/terrain mark, rendered for both GitHub themes. SVG and PNG versions are static; GIFs move once for 3.48 seconds and finish on a complete mark. |

Map routes used: [`#scene=bromo&hours=168`](https://ghanyr.github.io/fire-tracker/#scene=bromo&hours=168) and [`#fleet=1&demo=1`](https://ghanyr.github.io/fire-tracker/#fleet=1&demo=1). Satellite acquisition times and the snapshot collection time are different. Neither a capture date nor a snapshot refresh changes an observation's age.

The README uses static sources for readers who request reduced motion. Both GIFs play once; the playback section also links directly to the recording so it can be reopened. Hero and fleet images switch with GitHub's light/dark preference.

## update the captures

Use the deployed app, wait for the dated data and terrain to load, then capture the normal desktop viewport. For the phone views, check the responsive layout at 390 × 844 and reset the viewport afterward. Preserve the interface, data dates, map attribution and simulation labels. Do not add observations, change counts, or substitute a fabricated thermal view.

For a new history recording, select a time window, enable camera follow, press play, and record the actual interface. Keep an original still. Reduce the GIF to less than five seconds and two megabytes, with no looping extension. Encode from the recorded frames only. Keep screenshots below 350 KB when practical.

## render the logo

The geometry lives in [`tracker/lib/fire-brand.mjs`](../../tracker/lib/fire-brand.mjs). The renderer changes only the flame's vertical scale and color slightly; the terrain stays fixed. It requires Node, Python with Pillow, and `@resvg/resvg-js`. Rendering dependencies are separate from the app's runtime dependencies.

From the repository root:

```sh
media_dir=$(mktemp -d)
npm install --prefix "$media_dir" --no-save @resvg/resvg-js@2.6.2
python3 -m venv "$media_dir/venv"
"$media_dir/venv/bin/python" -m pip install Pillow
FIRE_TRACKER_MEDIA_PREFIX="$media_dir" \
FIRE_TRACKER_MEDIA_PYTHON="$media_dir/venv/bin/python" \
node tools/render-readme-logo.mjs
```

The screenshots retain source and basemap attribution. NASA FIRMS data, terrain and imagery keep their upstream terms; the project's MIT code license does not replace those terms. See [source notes](../../docs/REFERENCE.md#sumber-data--lisensi).
