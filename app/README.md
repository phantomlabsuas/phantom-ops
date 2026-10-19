# Phantom OPS v0.1 – live Fly view prototype

The first running version of Phantom OPS. It shows the Fly view agreed in the investigation (full-bleed map, PiP video,
top bar, alerts and command panel, 7-segment health strip) on **live data from the Veronte 1x autopilot** through
Veronte Link. It is a prototype: it covers what works end to end and leaves the rest out.

## Run it

Needs Node 20+ (tested with 24), Veronte Link running with an autopilot (SIL or hardware), and internet for the online
map tiles, or a local tile extract instead (see [Offline maps](#offline-maps)).

```bash
npm install --prefix app
```

```bash
npm --prefix app run dev
```

Open http://127.0.0.1:5173. `dev` starts two processes: the **bridge** (Node, multicast ↔ WebSocket, port 8787) and
the **web UI** (Vite, port 5173, proxies `/ws` to the bridge). Other scripts: `npm --prefix app test` (34 tests: codec
byte examples, decoding of real captured Link output, link glue, alert engine, command service), `npm --prefix app run typecheck`.

## Demo script (SIL)

1. **Fuel:** open the FUEL window (health strip) → FUEL QUANTITY INPUT → set the litres → **Send**. The autopilot's
   calculated remaining fuel (R3215) follows within 2 s and the FUEL segment shows it.
2. **Route:** press **+ WAYPOINT** (map toolbar) and click the map twice. The route is drawn in magenta with the leg
   distance and bearing; the Plan drawer lists the waypoints (altitude editable, drag on the map to move). Press the
   button again to stop adding.
3. **Take-off:** in the command panel's LAUNCH SEQUENCE, tap each step twice (the second tap 0.4–4 s after the first):
   **ARM** → **MOTORS ARM** → **TAKE-OFF READY** (you then have 30 s, shown as a countdown) → **TAKE-OFF**. The SIL climbs
   vertically to 50 m and the PDI switches to HOVER. The command panel switches to HOLD / RETURN HOME / LAND.
4. **Back down:** **LAND** (two taps) → the aircraft lands and the PDI returns to ARMED → **Motors off** → **Disarm**
   (STANDBY).

## Architecture

```
Veronte Link ──UDP multicast 225.200.1.0:51017/51018──▶ bridge (Node/TS) ──WebSocket /ws──▶ UI (React/TS, MapLibre)
                                                         │ decode VCP + telemetry (PDI chosen by vector hash)
                                                         │ alert engine (L1–L4, phase inhibits)
                                                         │ command service (whitelist, RX-ID ack, telemetry confirm)
```

| Part | Files | Notes |
|---|---|---|
| Bridge | `bridge/main.ts` | sockets, AP discovery and lock, Origin-checked WebSocket, store, 20 Hz deltas, 4 Hz alerts, 1 Hz status, video probe |
| | `bridge/vcp.ts` | application framing, User Event (50002), Variable set (50041), System status (50008) |
| | `bridge/pdi.ts`, `telemetry.ts` | vectors loaded from the PDI at run time; LSB-first bit-stream decoder |
| | `bridge/alerts.ts` | alert catalogue `config/alerts.json` + derived alerts (engine-out L4, engine state unknown, AP no report, telemetry lost); stale data holds alerts instead of clearing them |
| | `bridge/commands.ts` | command catalogue, phase / SIM gating, server-enforced two-step confirmation, Sent › Acknowledged › Executed lifecycle |
| | `bridge/*.test.ts`, `bridge/fixtures/` | tests; the fixture is real Link output captured from the SIL |
| Shared | `shared/protocol.ts` | WebSocket message types used by both sides |
| UI | `src/App.tsx`, `src/components/*`, `src/map/MapView.tsx` | Fly view; `src/state/store.ts` (zustand) holds bridge data, UI state and the planned route |
| | `src/components/RoutePlanner.tsx`, `src/map/geo.ts` | Plan drawer: waypoints, legs, totals |
| | `src/map/basemaps.ts` | online basemaps: candidate providers, start-up probe, dark-style import and repaint, label scaling (see [Online maps](#online-maps)) |
| | `src/map/offline.ts` | offline basemap: PMTiles archive via the `pmtiles://` protocol, Protomaps dark style for vector extracts |
| Web server | `vite.config.ts` | serves the UI; also serves `map.offlineDir` read-only at `/offline/` (byte ranges) in `dev` and `start` |
| Config | `config/bridge.config.json` | own address, multicast, PDI profiles + hashes, command whitelist, video URL, offline map folder (`map`, read by the web server) |
| | `config/alerts.json` | **draft** alert taxonomy (levels, segments, inhibits), generated from the Ops layout |
| | `config/var-names.json` | display names for system variables (from the Ops layout) |

### Why this stack

- **Web UI (React + TypeScript + Vite):** runs in any browser, and later in a kiosk shell (Electron or Tauri) on a rugged laptop or an ops-centre station.
- **Node bridge:** browsers cannot open UDP multicast sockets, so a local process has to own them. It also holds the safety-relevant logic (command gating, alert evaluation), which keeps that logic out of the UI, as CLAUDE.md asks. Being TypeScript, it shares its message types with the UI.
- **MapLibre GL:** open source and WebGL, with no API key or vendor lock-in. v0 uses keyless sources online (Esri World Imagery, OpenFreeMap vector tiles; see [Online maps](#online-maps)) and a local **PMTiles** extract offline. A keyed or commercial provider is one more entry in `src/map/basemaps.ts`.

### Resolution independence

Every size is in `rem` and comes from a small set of tokens at the top of `src/styles.css` (type sizes `--fs-*`, panel widths `--right-w`, `--drawer-w`, `--pip-w`). The root font size follows the viewport, `min(100vw/120, 100vh/64) × UI scale` with a 12 px floor, so the same layout scales without a rewrite. The top bar uses its own width-based unit so it always fits on one line.

| Viewport | Root size | Smallest operational text | Checked (2026-10-19) |
|---|---|---|---|
| 1920×951 (Edge maximized on 1080p) | 14.9 px | 13 px | fits, nothing clipped |
| 1920×1080 (design size) | 16 px | 14 px | fits, nothing clipped |
| 2560×1291 (Edge maximized on 1440p) | 20.2 px | 18.7 px (scale bar and footnotes 17.7 px) | fits, nothing clipped |
| 2560×1440 (fullscreen) | 21.3 px | 18.7 px | fits, nothing clipped |
| 3840×2160 | 32 px | 28 px | fits, nothing clipped |

Target on the 27" 2560×1440 monitors: text cap height of at least 16 arcmin at 65 cm (MIL-STD-1472 / ISO 9241-303), about 18.4 px for IBM Plex. Command panel needs no scrolling at any size above; the alerts panel shows three full cards and then compact rows.

- **Run it fullscreen (F11) or as an app window** (`msedge --app=http://localhost:5173`) on 2560×1440. A maximized browser window loses about 150 px of height to tabs and the taskbar, which makes everything about 5 % smaller.
- **Display settings** (gear icon, bottom of the left rail) can reduce the size to 80 % for a small window. 100 % is the ceiling: the panel widths are sized for the automatic text size. Browser zoom has no effect because the sizes follow the viewport.
- The map keeps the aircraft centred in the area the panels leave free, and its overlay lines and scale bar scale with the root size.
- Map labels (the dark map, its labels over the imagery, and offline vector extracts) also scale with the root size. Text that is part of raster tiles cannot.

## What is live in v0

| Element | Source |
|---|---|
| Top bar | phase (U1, 50008 as fallback), VTOL chips MC / TRANS / FW / LAND (B1213 / B1214 / B1212, phase 3), IAS R3130, AMSL R503, AGL R504, HDG R3, GS R2, control source from R3104 / R3106 with the Ops bands (unknown values shown as such), link B1310 / B1311, flight time, endurance (fuel ÷ R3208), AUDIO OFF warning until sound is enabled, MASTER WARNING / CAUTION (press to acknowledge), clock |
| Map | own aircraft (R501 / R500, heading R3; grey when stale), track trail, follow / re-centre (pauses while you zoom), satellite / dark / offline basemap, wind R3303 / R2813, scale bar, engine-out glide ring when airborne (AGL × 12, **assumed** ratio), **planned route**: click to add waypoints, drag to move, magenta route with leg distance / bearing, dashed lead from the aircraft |
| PiP | payload video iframe (mediamtx `pilotwindow_h264`), "NO VIDEO" placeholder when the server is down, swap with the map, dock to the four corners |
| Alerts | 159 AP alerts from the Ops layout + derived engine-out (L4, audible), engine state unknown, AP no report, telemetry lost, PDI mismatch. Acknowledging does not clear an alert; a telemetry gap holds alerts (tagged DATA LOST) instead of clearing them. Ground-phase inhibits are listed, never hidden. |
| Health strip | ENG, FUEL, ELEC, LIFT, NAV, LINK, AP with live values and sparklines. Greyscale while normal; solid colour for an unacknowledged alert, outline once acknowledged; an alert always shows even when data is stale; values from a device reporting No Comm are shown as frozen, not as live numbers. |
| Engine window | RPM gauge, CHT and MAT bars, throttle commanded / output / TPS, CHT trend, ECU supply, pump, ECU temp |
| Fuel window | fuel (R3215 calculated remaining, R3400 sensor as fallback; a warning when they disagree by more than 0.5 L, endurance uses the lower), %, burn rate and history, sensor, mass, temperature, pressure, endurance, **FUEL QUANTITY INPUT** (R3183, 0–7.5 L, ground only, as in the Ops Engine panel) |
| Commands | On the ground: **launch sequence** ARM (SIM wing switch B1241) → MOTORS ARM (SIM knob B1236 → B1232) → TAKE-OFF READY (PDI event 2) → TAKE-OFF (event 4), with live preconditions and the 30 s TAKE-OFF READY countdown, plus Motors off / Disarm. In the air: HOLD, RETURN HOME, LAND (events 14 / 80 / 12). Always: IAS mode MIN / CRS / MAX (events 93–95), altitude target (R3173). Hazardous commands need two taps, enforced by the bridge. Each shows Sent › Acknowledged › Executed from the AP reply and telemetry. |
| Systems drawer | every decoded variable (≈380) with name and live value, searchable |
| Event log drawer | alert onsets and clears, command steps, link changes |

## Verified on the SIL (2026-10-17, v0.1)

Driven through the UI against the live SIL (6041, Maintenance PDI):

| Command | Result | Acknowledged | Executed |
|---|---|---|---|
| FUEL 5.0 L (R3183) | R3183 = 5.0, R3215 = 5.00 L | 33 ms | 2.0 s |
| ARM | STANDBY → ARMED | 31 ms | 0.9 s |
| MOTORS ARM | B1232 = 1 | 29 ms | 0.1 s |
| TAKE-OFF READY | ARMED → TAKE-OFF READY | 26 ms | 0.2 s |
| TAKE-OFF | → TAKE-OFF, vertical climb to 50 m AGL → HOVER (PDI) | 22 ms | 0.3 s |
| LAND | → LANDING, touchdown → ARMED (PDI) | 26 ms | 0.4 s |
| Motors off, Disarm | B1232 = 0, → STANDBY | 25 / 21 ms | 0.1 / 0.3 s |

Route: two waypoints added by clicking the map, route and lead lines rendered, leg 991 m · 142°.

An independent decoder (written from the spec, not the app code) matched **89,185 bridge samples to Link's output with 0
mismatches** (380 variables, no lost packets, 2026-10-16). A 62-agent review then found 40 defects (alerts cleared on any
telemetry gap, no WebSocket Origin check, a malformed message could crash the bridge, wrong CONTROL display, a
double-click could pass the two-tap confirmation, and others); all were fixed in v0.1. A second 50-agent pass confirmed 19 smaller issues (derived ENGINE OUT not held during a telemetry gap, fuel readout contradicting the sensor-based alert, held Enter key could confirm, no bridge-side phase gate for HOLD/RTH/LAND, alerts carried over to a new autopilot, and others); those are fixed too, with 34 tests now. Its live regression matched 66,593 samples with 0 mismatches at 21 ms median latency.

### Earlier (2026-10-16)

- The bridge found the AP at 6041 and identified the **Maintenance PDI** from the V0 hash `0x347392F9`. The SIL runs the Maintenance PDI, not the flight PDI. Data arrives at about 69 msg/s, with 380 variables decoded.
- IAS MIN → acknowledged in 28 ms → executed (U1002 = 1) in 333 ms. CRUISE restored the same way.
- Altitude target R3173 := 100: the AP **accepted the Real write** (50041 echo matched; this is the first Real-variable write verified). Telemetry did not change, because on the ground a PDI block keeps R3173 at the current MSL. The UI showed "not executed" with that reason.
- Codec unit tests reproduce the verified SIL byte examples exactly.

## Safety and limits

- Commands go only to AP addresses listed in `commands.allowedApAddresses` (default `[6041]` = SIL). Add a hardware AP address deliberately; otherwise the command panel stays disabled.
- Hazardous commands (ARM, MOTORS ARM, TAKE-OFF READY, TAKE-OFF, HOLD, RTH, LAND) need a second tap 0.4–4 s after the first. The bridge enforces it (arm, then confirm); a double-click does not count. No command is ever sent automatically or resent.
- Launch and disarm commands are only accepted in the PDI phases where they apply (for example TAKE-OFF only in TAKE-OFF READY; disarm never in flight). ARM and MOTORS ARM drive the **SIM** switch bits and are refused unless the AP is in SIM mode (B1226 = 1); on hardware these are physical switches.
- Fuel entry is ground-only. The planned route is **not uploaded** to the autopilot: Veronte Link's flight-plan upload is not documented yet.
- The bridge accepts WebSocket connections only from the UI's origin (`allowedOrigins`, default `http://127.0.0.1:5173` and `http://localhost:5173`) or from local tools that send no Origin.
- Alert levels, segments and inhibits in `config/alerts.json` are a **draft** for review. In the SIL many "No Comm" alerts are active because ECU, PMU and ESC are not simulated.

## Online maps

Free tile services change without notice. On 2026-10-19 the map went blank for two reasons at once: Esri's Akamai edge
for `server.arcgisonline.com` (the old satellite and label source) started answering **403** to this office's public IP
(other UAE addresses, even on the same ISP, still get tiles, so it looks like an automatic per-IP block that may lift by
itself), and **CARTO** (the old dark map) now serves an "API KEY REQUIRED" image for every keyless tile. Since then:

- **Each online basemap has candidate providers** (`src/map/basemaps.ts`). When an online basemap is first needed the UI
  probes them in order from the browser (two real tiles, CORS, and not the same placeholder image for every tile; 8 s
  limit per request) and uses the first that passes. With OFFLINE chosen and its file present, nothing is probed.
  - **SAT:** Esri World Imagery from the **Wayback** archive (release 2026-09-24, `wayback.maptiles.arcgis.com`), then the
    old `server.arcgisonline.com` host, then Clarity (deprecated, retires March 2028), then Sentinel-2 cloudless 2016
    (10 m). Labels come from the dark map's text layers, drawn light on a dark halo over the imagery.
  - **DARK:** [OpenFreeMap](https://openfreemap.org) vector tiles (OpenStreetMap, no key, commercial use allowed),
    repainted with the same Protomaps dark palette as the offline map.
- **While flying,** tile failures are counted per basemap (404 for missing tiles does not count, and neither do errors
  while the browser reports no network). After 6 in a row:
  - HTTP refusals (401, 403, 429, 5xx): the provider is skipped for 10 minutes, doubling on repeats up to an hour (the
    escalation resets after a clean hour), and the next candidate is tried.
  - "Blocked or unreachable" (no HTTP answer, often our own connection): the first time, the candidates are only
    probed again and a provider that still answers is kept, with its failed tiles reloaded. A second time within 5
    minutes skips it as above, unless nothing at all can be reached (the skipped provider included), which means our own
    connection is down: then nobody is skipped.
- **Connection down:** the map shows "NO NETWORK" (the computer has no network) or "CONNECTION LOST" (neither online
  basemap can reach any of its providers; if only one can't, it is treated as that provider set failing and the other is used),
  keeps drawing the tiles it already has, and switches to OFFLINE if an extract is present. Another online basemap
  would not load either, so it is not tried. Tiles that failed meanwhile are reloaded when the connection is back.
- **Recovery is automatic:** a failed basemap is probed again after 1, 2, then every 5 minutes, and at once when the
  browser comes back online. A basemap running on a lesser provider (deprecated Clarity, or the 10 m Sentinel-2 mosaic)
  goes back to the first choice the same way, and the map says so meanwhile ("SAT: Sentinel-2 2016, 10 m (fallback)").
  While a probe runs, the map keeps showing what it showed before.
- **Fallback:** if the chosen basemap has no working provider, the map shows the first usable one of SAT, DARK, OFFLINE
  and says so on the map ("SAT unavailable · showing DARK"; hover it for the reasons). The choice is kept and comes back
  once it works. With nothing usable the map says **NO BASEMAP** instead of showing a silent black screen. A failed
  basemap's button turns amber; its tooltip gives the reason, and clicking it checks it again.
- **Display settings** lists the provider in use for each basemap, which candidates were passed over and why, and why any
  basemap failed. **Recheck** forgets the skips and probes everything again (and rescans the offline folder).
- **Licensed imagery:** keyless use of Esri tiles outside Esri's own apps is a licensing grey area. The documented route
  is an [ArcGIS Location Platform](https://location.arcgis.com) account (free tier: 2 million basemap tiles a month) and
  an API key with the Basemaps privilege. Put it in `app/.env.local` as `VITE_ARCGIS_API_KEY=...` (git-ignored; restrict
  the key to the referrers `http://127.0.0.1:5173` and `http://localhost:5173`) and restart `npm run dev`. The keyed
  source is then tried first; if it is refused, Display settings shows why under "Passed over".
- **Attribution:** "Powered by Esri" stays on the map next to the ⓘ button while Esri imagery is shown; the full credits
  are in the ⓘ control.
- If the old Esri host stays blocked for this office, Esri can decode the reference number on its 403 page
  (data_and_location_services@esri.com). Avoid automated test runs that load many tiles from the office IP.

## Offline maps

Field sites often have no internet. The **OFFLINE** basemap (map toolbar, or Display settings) draws a local
[PMTiles](https://docs.protomaps.com/pmtiles/) archive instead of the online tiles. With it selected and its file
present, the UI contacts no internet host (checked in the browser's network log). Choosing SAT or DARK, pressing
**Recheck**, or a missing offline file starts the online probes.

- **Where the file goes:** `map.offlineDir` in `config/bridge.config.json` (default `tiles`, that is `app/tiles/`, which is
  git-ignored; an absolute path such as a USB drive also works). `map.offlineFile` picks one archive; empty means the first
  `.pmtiles` file by name.
- **How it is served:** the web server (a plugin in `vite.config.ts`) serves that folder read-only at `/offline/` with HTTP
  byte ranges, which PMTiles needs, in both `npm run dev` and `npm start` (`vite preview`). `/offline/index.json` tells the
  UI what is there. The bridge is not involved.
- **Raster archives** (PNG, JPEG, WebP or AVIF tiles, 256 px) become one layer, dimmed like the online imagery.
- **Vector archives** must use the Protomaps basemap schema. They get the Protomaps **dark** style
  (`@protomaps/basemaps`, English names where OSM has them). Labels are drawn in the browser: Latin in the app's
  IBM Plex Sans Condensed, other scripts (Arabic, Hebrew and so on) in system fonts, shaped by MapLibre itself. No glyph
  server is needed.
- **POI and road-shield icons** need the Protomaps sprite sheet. Copy `sprites/v4/dark.json`, `dark.png`, `dark@2x.json`
  and `dark@2x.png` from [protomaps/basemaps-assets](https://github.com/protomaps/basemaps-assets) into
  `<offlineDir>/sprites/v4/`. Without them the labels still show, without icons.
- A dashed grey line marks the edge of the extract. With no aircraft position yet, choosing Offline zooms to the extract.
  When the view is entirely outside it, the map says "Outside the offline map area" (hover for the extract's bounds); when
  it is zoomed out below the extract's minimum zoom, it says which zoom to go to. While the file is still being looked for
  at start-up, the map says "Looking for the offline map…".
- **File missing or unreadable:** OFFLINE is disabled. Its tooltip and Display settings say why, and the browser console
  logs it. The map shows the first working online basemap, says so, and keeps the Offline choice. **Recheck** (Display
  settings) picks up a file added later, for example a USB drive plugged in after start-up, without a restart or reload.

### Making a vector extract for an operating area

1. Get the `pmtiles` command-line tool (a single program, BSD-3-Clause): download
   `go-pmtiles_<version>_Windows_x86_64.zip` from [go-pmtiles releases](https://github.com/protomaps/go-pmtiles/releases)
   and check its SHA-256 against the digest on the release page.
2. Pick a daily planet build from [maps.protomaps.com/builds](https://maps.protomaps.com/builds/). The URL format is
   `https://build.protomaps.com/YYYYMMDD.pmtiles`. The file is about 140 GB, but `extract` downloads only the part you
   ask for.
3. Extract a bounding box (west,south,east,north), or a polygon with `--region=area.geojson`. Add `--dry-run` to see the
   size first.

   ```bash
   pmtiles extract https://build.protomaps.com/20261015.pmtiles app/tiles/abu-dhabi-sil.pmtiles --bbox=54.35,24.25,54.95,24.65 --maxzoom=15
   ```

   This made the test extract in `app/tiles/` (60 × 45 km around the SIL position): 6.8 MB at `--maxzoom=14`, 15 MB at
   15 (the builds' maximum), in about 1.5 minutes. Dense cities are larger. Zoom 14 is usually enough, because MapLibre
   over-zooms vector tiles cleanly.
4. Check it with `pmtiles show app/tiles/abu-dhabi-sil.pmtiles` (tile type `mvt`, bounds, zoom range), copy the sprites
   (above), then press **Recheck** (Display settings) or reload the page.

### Making a raster (imagery) extract

PMTiles holds imagery too. Convert an MBTiles file with `pmtiles convert in.mbtiles out.pmtiles` (this path was tested
with a synthetic raster archive). GDAL can make the MBTiles file from a georeferenced image such as your own survey
orthophoto (these three commands were not tested here):

```bash
gdal_translate -of MBTILES -co TILE_FORMAT=JPEG ortho.tif ortho.mbtiles
```

```bash
gdaladdo -r average ortho.mbtiles 2 4 8 16 32
```

```bash
pmtiles convert ortho.mbtiles app/tiles/ortho.pmtiles
```

### Licences and attribution

- **Protomaps builds** are OpenStreetMap data (ODbL) plus Natural Earth (public domain). "© OpenStreetMap" must be shown.
  The archive carries this attribution in its metadata, and the map shows it in the ⓘ control automatically. Using an
  extract inside PhantomLabs is fine with that attribution. Giving an extract to others (for example shipping it with a
  customer system) brings ODbL share-alike obligations for the data, so check before doing that.
- **Software and assets:** `pmtiles` and `@protomaps/basemaps` (the style) are BSD-3-Clause. The sprites are derived from
  MIT-licensed tangrams/icons. IBM Plex is SIL OFL (already in the app).
- **Imagery:** do not bulk-download Esri World Imagery (any host, Wayback included) or other online tiles for offline use;
  their terms do not allow it without a licence. Use imagery you own or license, or open data such as Sentinel-2
  cloudless **2016** (CC BY 4.0; the 2018–2025 editions are non-commercial only) or Copernicus Sentinel-2 itself (10 m,
  attribution "Contains modified Copernicus Sentinel data").
- **Online attribution** is shown in the map's ⓘ control: "Powered by Esri · Esri, Vantor, Earthstar Geographics, and the
  GIS User Community" for the imagery, and "OpenFreeMap © OpenMapTiles Data from OpenStreetMap" for the dark map and labels.

## Not in v0

Uploading the planned route or a mission to the autopilot (protocol not documented), the autopilot's own mission (not in telemetry), home / alternate landing sites, LOS link edge, bingo (needs fuel and distance to home), EGT / CHT 2 / MAP (not in telemetry), PCS telemetry (no PCS PDI), Plan / Payload / Checklists / Handover workspaces, recording / replay UI (the bridge can record with `replay.recordTo`), and authentication / multi-operator control ownership.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Banner "BRIDGE OFFLINE" | `npm --prefix app run dev` not running, or the bridge exited: check its output. |
| Bridge exits with "port 8787 is in use" | another bridge is still running. Stop it. |
| "WAITING FOR AUTOPILOT" | Veronte Link not running, or no AP connected. |
| "TELEMETRY LAYOUT UNKNOWN" | the AP runs a PDI whose hashes are not in `pdiProfiles`. Add the profile and hashes. |
| "Loading SAT map…" / "Loading DARK map…" | the provider is being probed (up to 8 s per request; a few seconds normally). |
| Map black or grey, no notice | tiles of a provider that passed its probe are failing, but fewer than 6 in a row so far (or the first run of "unreachable" errors, after which the provider was probed again and kept), or a background tab has not drawn yet. Open Display settings, or press **Recheck**. |
| "NO NETWORK" / "CONNECTION LOST" | the computer has no network, or nothing on the internet answers. Tiles already loaded stay; choose OFFLINE if an extract is available. The map reloads by itself when the connection is back. |
| "SAT unavailable · showing …" or "NO BASEMAP" | hover the notice, or open Display settings, for each provider's error (HTTP 403, blocked or unreachable, placeholder image). Press **Recheck** once the network is back; see [Online maps](#online-maps). With no internet, choose OFFLINE (needs an extract, see [Offline maps](#offline-maps)). |
| "MAP UNAVAILABLE" in the map area | the browser has no WebGL2 (hardware acceleration off, remote desktop, GPU blocklist), or the map hit an error. Alerts, commands and the health strip keep working. **Retry map** rebuilds it; for WebGL2, turn hardware acceleration on in the browser settings. |
| "MAP PAUSED · graphics context lost" | the GPU was reset or ran short of memory. MapLibre restores the map by itself, usually within a second. |
| OFFLINE greyed out | hover it or open Display settings for the reason: no `map.offlineDir`, folder missing, no `.pmtiles` file, or `map.offlineFile` not found. Fix it, then press **Recheck**. |
| Offline map blank | the view is outside the extract (dashed line; the map also says so), or below the extract's minimum zoom. |
| Map layers not updating in a background tab | browsers throttle rendering of hidden tabs; it catches up when visible. |
