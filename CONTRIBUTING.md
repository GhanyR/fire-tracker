# contributing

Small, focused changes are welcome. A clear bug report, a corrected place name, or a useful test fixture can help as much as a new feature. [Ghany Rasyid](https://github.com/GhanyR) maintains the project.

## useful places to start

- Report a wrong place name or boundary assignment with public coordinates, a source, and the observation time.
- Reproduce a problem with search, playback, exports, keyboard navigation, or a screen reader. Include the browser, steps, expected result, and what happened.
- Improve the Indonesian interface copy or the documentation. Keep the wording simple and specific.
- Add a missing data edge case: an absent FRP value, repeated satellite observations, or a timestamp boundary.
- Share a sanitized hardware compatibility report with the aircraft, controller, gateway, firmware, transport, and fields you actually tested.

Open an [issue](https://github.com/GhanyR/fire-tracker/issues) for a bug or proposal. For a larger change, describe the problem and approach before starting. Do not post private team positions, operation keys, tokens, or personal information. Satellite detections need verification; a screenshot alone does not confirm a fire.

## run the map

Use Node **22.13+**, Git, and curl. Python is only needed for the data pipeline or telemetry bridge.

```sh
git clone https://github.com/GhanyR/fire-tracker.git
cd fire-tracker
npm ci --prefix tracker
curl --fail -L https://ghanyr.github.io/fire-tracker/data/observations.json -o tracker/public/data/observations.json
npm run dev --prefix tracker
```

Open **http://127.0.0.1:5173** (or the port Vite prints). The snapshot download and basemap tiles need internet. Check the displayed source time: downloading a snapshot does not make its observations new.

This starts the React/MapLibre frontend. It does not start the private operations API or telemetry bridge. The [simulated fleet](http://127.0.0.1:5173/#fleet=1&demo=1) needs no aircraft, account, or personal GPS permission. See the [UAV guide](docs/UAV.md) for a local bridge and the [server guide](server/README.md) for deploying your own private API and configuring a published frontend. The Vite development server does not proxy that API by default.

## find the code

| Path | Role |
|---|---|
| [`tracker/`](tracker/) | Current React/MapLibre map, playback, panels, and frontend tests. |
| [`pipeline/`](pipeline/) | Python source collection, normalization, static data, exports, and notifications. |
| [`bridge/`](bridge/) | Python HTTP/WebSocket bridge and MAVLink telemetry input. |
| [`sdk/`](sdk/) | JavaScript telemetry/private-session client and gateway examples. |
| [`server/`](server/) | Optional private operations API, D1 migrations, and server tests. |
| [`schemas/`](schemas/) | Public data and telemetry contracts. |
| [`web/`](web/) | Legacy field-tools dashboard, static-site packaging, and offline-cache tests. |
| [`docs/`](docs/) | Data methods, hardware setup, private API, and the [full reference](docs/REFERENCE.md). |
| [`.github/workflows/update.yml`](.github/workflows/update.yml) | Scheduled collection, checks, and GitHub Pages packaging. |

## check a change

Run the checks for the parts you changed from the repository root. Frontend and server checks use Node; server tests use an in-memory SQLite database with synthetic fixtures.

```sh
npm test --prefix tracker
npm run build --prefix tracker
node --test server/tests/*.test.mjs
node --test web/tests/*.test.mjs
```

For Python, bridge, or SDK work, use **Python 3.12+** in a virtual environment:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r pipeline/requirements.txt -r bridge/requirements.txt
.venv/bin/python -m unittest discover -s pipeline/tests -v
.venv/bin/python -m unittest discover -s bridge/tests -v
PATH="$PWD/.venv/bin:$PATH" npm test --prefix sdk
```

The SDK tests start a local Python bridge, so the virtual environment must be on `PATH`. The MAVLink packet tests need `pymavlink`, included in the bridge requirements; they report a skip if it is unavailable. These checks use synthetic data, not personal GPS or a physical aircraft.

To exercise the pipeline without requesting upstream data:

```sh
.venv/bin/python pipeline/tests/make_fixtures.py
PAN_OFFLINE=1 .venv/bin/python -m pipeline.build --out /tmp/fire-tracker-fixtures --no-tiles
```

That output is test data. Do not publish it as current satellite observations. See [current static-site packaging](docs/REFERENCE.md#menjalankan-antarmuka-fire-tracker) and the separate [legacy field-tools setup](docs/REFERENCE.md#jalankan-sendiri).

## keep the data honest

Preserve original observation times, unknown values, source attribution, and simulation labels. Playback shows detection history; it does not measure fire spread or burned area. Keep private fleet locations out of public satellite feeds and map links. The [data guide](docs/DATA.md) and [operations contract](docs/OPERATIONS.md) explain those boundaries.

Drone integration stays **read-only**: no flight commands. Tests with encoded packets and local servers do not establish physical aircraft, radio, controller, or camera compatibility. Document separately what was tested on real hardware. See [UAV compatibility](docs/UAV.md#compatibility).

Respect upstream rate limits and reuse cached data. Keep paid API keys out of the default path; optional services need explicit configuration. Code is MIT licensed, while source data and imagery retain their own terms.

## send a pull request

Keep the change focused. Explain the problem, what changes for a user, and which checks you ran. Include before/after screenshots for interface changes, with simulation labels visible and no private locations or credentials. Update the relevant documentation when behavior or setup changes.
