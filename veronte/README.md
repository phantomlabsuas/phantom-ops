# Veronte – how Phantom OPS gets live data

The Phantom Hawk flies a **Veronte 1x autopilot** (Embention, firmware 7.8). Phantom OPS gets its data from **Veronte Link 7**, which routes traffic between the autopilot and every ground application. This folder holds what is needed to replace the Fly-view mockup's simulated telemetry with real data and to send commands to the autopilot.

## Start here

1. [**integration-guide.md**](integration-guide.md): the data path, addresses, framing, receiving and decoding telemetry, sending commands (User Event, Variable set), the command lifecycle behind the Sent › Acknowledged › Executed chips, safety rules, and a proposed bridge structure.
2. [**ops-layout-data-map.md**](ops-layout-data-map.md): what each part of the Veronte Ops *Operational* layout reads, writes and triggers; the mapping to Phantom OPS Fly-view elements (top bar, health strip, map, command window); and the gaps.
3. [**telemetry-hashes.yaml**](telemetry-hashes.yaml): vector hashes for the flight PDI. You cannot decode telemetry without them.

## Cheat sheet

| | |
|---|---|
| Receive | UDP multicast `225.200.1.0:51017` on `127.0.0.1` (`SO_REUSEADDR`) |
| Send | UDP to `225.200.1.0:51018`, multicast IF `127.0.0.1`, TTL 1 |
| Framing | `Reserved(2) Len(2) Src(4) Dst(4) Type(2) Props(2)` big endian, payload little endian, optional CRC-32 |
| Own address | dedicated, configurable (e.g. 1100). Not 2 (Veronte Ops) or 1000 (maintenance app). |
| AP address | dynamic: Src of System status 50008 (app ID 3). SIL 6041, hardware 6248. PCS is 9999. |
| Telemetry | 50020: `Float32 time · Uint32 hash · LSB-first bit stream`. V0 10 Hz, V1 6 Hz, V2 0.5 Hz. |
| Commands | 50002 User Event (PDI button event), 50041 #235 Variable set. Properties `0xA0C0` (IDD 32). |
| Phase | U1 in V1, or byte 11 of 50008 |

## Folder contents

| Path | What it is |
|---|---|
| `integration-guide.md` | Phantom OPS integration guide (new) |
| `ops-layout-data-map.md` | Operational layout → variables → Phantom OPS mapping (new) |
| `telemetry-hashes.yaml` | Vector hashes of the flight PDI |
| `generated/telemetry-vectors.csv` | Every field of V0–V7: variable, kind, bit offset, size, name, whether Ops uses it |
| `generated/ops-layout-readouts.csv` | 214 read-out bindings: group, widget, variable, name, unit code, source device, vector, Ops colour bands |
| `generated/ops-layout-visibility.csv` | 90 show/hide conditions of the layout's conditional groups |
| `generated/ops-layout-alerts.csv` | 173 alerts: bit, text, trigger polarity, delay, sound, vector, proposed health segment |
| `generated/ops-layout-buttons.csv` | 24 layout buttons: event ID and what the PDI automations then do |
| `generated/ops-layout-writes.csv` | 22 sliders / knobs / inputs that write variables, with ranges |
| `generated/ops-layout-scripts.md` | The 3 JavaScript label scripts |
| `generated/pdi-button-events.csv` | All 34 button events of the flight PDI, with conditions and actions |
| `generated/summary.json` | Counts, vector sizes, conditional-only variables |
| `tools/extract_ops_layout.py` | Generator of `generated/` (standard library only) |
| `reference/*.md`, `link-architecture.svg` | Verified protocol notes, copied unchanged from `phantomhawk-maint/docs/Veronte` (2026-10-16): VCP protocol, Link architecture, PDI structure, telemetry, user events, variable write |
| `reference/ops-operational-layout-regions.md` | Screen-region description of the Operational workspace (from `phantomhawk-ops/Layouts`) |
| `reference/phmaint-link/*.py` | Working Python implementation of transport, codec, PDI loading and telemetry decoding, from the maintenance app (`phantomhawk-maint/src/phmaint/link`). Reference copy; it needs PyYAML and its own `procedure/` files to run. |

The reference copies keep their original wording. Where they mention "the app", `src/phmaint/…` or `procedure/…`, they mean the maintenance app in `C:\Projects\Operational\phantomhawk-maint`.

## Sources

| Source | Location |
|---|---|
| Protocol notes (maintained originals) | `C:\Projects\Operational\phantomhawk-maint\docs\Veronte\` |
| Veronte Ops layouts | `C:\Projects\Operational\phantomhawk-ops\Layouts\Operational.vws` (also `Engineering.vws`) |
| Flight PDI | `C:\Projects\Operational\phantomhawk-pdi\UAV-1xVeronte\setup\` (git, `ver_spdif_tm.xml` last changed 2026-09-29) |
| Maintenance PDI (differs from the flight PDI) | `C:\Projects\Operational\phantomhawk-maint\veronte\Maint PDI\` |
| Embention PDF | *Veronte Autopilot 1x VCP 7.6.39/1.0* (system variable names, unit tables) |

## Regenerating

Run this after the layout or the flight PDI changes:

```bash
python -I veronte/tools/extract_ops_layout.py "C:/Projects/Operational/phantomhawk-ops/Layouts/Operational.vws" "C:/Projects/Operational/phantomhawk-pdi/UAV-1xVeronte/setup" veronte/generated
```

After a PDI change, also re-record the vector hashes from a running AP and update `telemetry-hashes.yaml`.
