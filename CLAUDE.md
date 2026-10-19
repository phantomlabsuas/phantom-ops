# Phantom OPS: project context for Claude Code

PhantomLabs UAS is building **Phantom OPS**, its own ground control station (GCS) software. The plan is to develop it in-house, not buy it. The software must fly the aircraft and run its missions.

- **Aircraft:** fixed-wing VTOL. It cruises on an internal-combustion engine (ICE, possibly a hybrid with a generator) and uses electric quad motors for lift.
- **Missions:** long endurance, 8–20 h and up.
- **Core UX requirement:** the mission (map, video, tasking) owns the screen. Aircraft health must stay visible and warn reliably, without sitting in front of the pilot all the time ("mission-first, health-peripheral").

Owner: Ilan Rosen (ilan.rosen@phantomlabsuas.com). Work so far was done in a Claude (Cowork) session on 2026-10-02, and this folder holds everything from it.

## What's in this folder

| Path | What it is |
|---|---|
| `docs/research/gcs-ux-benchmark-research.md` | **Main research doc**: executive summary, 5 benchmark products, comparison matrix, VTOL/ICE/endurance specifics, human-factors evidence, alert taxonomy, 16 design principles, 22-item requirements backlog, standards, open questions, sources |
| `docs/research/raw-reports/01-gcs-vendors-ui-ux.md` | Full vendor findings: Auterion, UAV Navigation, Shield AI, Textron, Lockheed VCSi, Insitu, Quantum, plus others and open source |
| `docs/research/raw-reports/02-vtol-ice-long-endurance-ops.md` | Transition UX, MAVLink EFI/FUEL/GENERATOR messages, ArduPilot ICE, fatigue, handover, the Nogales lessons, SORA/EASA rules, 25 UX requirements |
| `docs/research/raw-reports/03-hmi-alerting-human-factors.md` | FAA/MIL alerting rules, ECAM/G1000, UAV HF research, ISA-101/EEMUA, proposed alert taxonomy and inhibits |
| `docs/project-summary.md` | Short summary that is also kept in the claude.ai Project "phantom-ops" |
| `mockup/fly-view/` | Interactive Fly-view mockup (source, assets, generators). See its README |
| `reference/upstream-snapshots/` | ArduPilot and MAVLink source files read during research (snapshots from Oct 2026) |
| `app/` | **Phantom OPS v0**: running Fly-view prototype on live Veronte data. Node bridge (multicast ↔ WebSocket, alerts, gated commands) + React/TypeScript/MapLibre UI, resolution-independent (rem). Run: `npm --prefix app run dev`. See `app/README.md` |
| `veronte/` | **Live-data integration with the Veronte 1x autopilot via Veronte Link**: integration guide, Veronte Ops Operational-layout data map, telemetry hashes, generated variable/alert/command tables, verified protocol notes and a reference Python codec. Start at `veronte/README.md` |

**Online originals.** These are private to Ilan unless he shares them.

- Research doc: https://claude.ai/code/artifact/92323f7c-eb78-4110-b4c7-2007bff567d9
- Mockup canvas: https://claude.ai/artifact/VaWQGv4yfVVaLV8R26vCtU

## Decisions so far

These are drafts. Confirm them with Ilan before treating them as final.

**Benchmarks (learn from, do not buy)**

- UAV Navigation Visionair: alarm depth and tiers.
- Auterion Mission Control: interaction polish, the RTL point, hold-to-confirm.
- Lockheed VCSi: crew roles, alerts you can act on, look-ahead.
- Insitu INEXA: long-endurance ICE operations, Platform Kit vs Mission Kit split.
- Quantum QBase/MOSAIC: low-training field workflow.

**Layout**

- Full-bleed map.
- Payload video in a picture-in-picture (PiP) window that docks to any corner and can swap with the map.
- Thin top bar with mode, VTOL phase strip, flight data, control owner, link, bingo, MASTER WARNING/CAUTION and clock.
- Left rail menu.
- Right panel: alerts on top, a **mini command window** below.
- 7-segment health strip at the bottom: ENG, FUEL, ELEC, LIFT, NAV, LINK, AP.

**Health strip behaviour**

- Segments stay greyscale while normal. They change colour only when a value leaves its band.
- FUEL and ENG segments open small windows above the strip.

**Alert model: 6 levels**

| Level | Name | Colour and shape |
|---|---|---|
| L4 | Time-critical | Red octagon, voice |
| L3 | Warning | Red triangle |
| L2 | Caution | Amber diamond |
| L1 | Advisory | White circle (not cyan, which means "friendly" in MIL-STD-2525) |
| L0 | Trend / pre-alert | — |
| M | Maintenance only | — |

- Acknowledging an alert does not clear it.
- Alerts are inhibited by flight phase, never silently.
- Engine-out is always L4 and audible.
- Planned engine stops (`Q_LAND_ICE_CUT`) never alarm.

**Map**

- Health is shown as its mission consequence: engine-out glide ring, which alternate landing sites are reachable, the LOS link edge, and an off-screen home indicator with RTB time and fuel.

**Commands**

- HOLD and RTB need a second tap to confirm.
- Speed and altitude use −/+, then Send or Cancel.
- Each command shows Sent › Acknowledged › Executed.

**Theme**

- Dark, for night operations.
- Fonts: IBM Plex Sans Condensed and IBM Plex Mono.
- Route in magenta, own aircraft in cyan, amber `#FFB547`, red `#FF5A5F`.

## Open questions (need Ilan's input)

1. Autopilot stack: evidence says **Veronte 1x (Embention), firmware 7.8, via Veronte Link 7**: the Phantom Hawk flight PDI and the Veronte Ops layouts are in `C:\Projects\Operational\`. See `veronte/`. Confirm with Ilan that Phantom OPS targets Veronte only (no MAVLink).
2. Engine, ECU and generator models. These set the limit bands, for example CHT amber/red.
3. Crew model:
   - One pilot or a pilot plus payload operator?
   - A field launch-and-recovery crew plus a remote cruise crew?
   - One operator flying several aircraft?
4. Target hardware: rugged laptop, 7–10" handheld, or an ops-centre multi-monitor station.
5. SAIL level and certification path. SORA OSO #20 requires HMI evidence from simulation at Medium robustness.
6. Is remote alert escalation (phone or watch) acceptable for security and emissions control?
7. Which left-menu workspace to design next. Shift handover was suggested.
8. Lift configuration: the flight PDI has **three** lift ESCs (Left, Right, Tail) and a tilt servo, not four motors as stated above. Confirm, then fix the aircraft line.

## Suggested next steps

- ~~Port the mockup to a real front-end app~~ Done as v0 in `app/` (2026-10-16); v0.1 (2026-10-17) adds the SIL launch sequence (arm → take-off → land), fuel quantity entry, route planning on the map (drawn only) and offline PMTiles maps, after a 62-agent verification. Next: review the draft alert taxonomy and ground go/no-go handling (`app/config/alerts.json`), find the Veronte flight-plan upload protocol (capture Ops), home/RTH data, and the PCS PDI.
- Define a telemetry adapter layer. For the Veronte AP this is VCP via Veronte Link (`veronte/integration-guide.md`). The MAVLink notes below apply only if a MAVLink autopilot is also supported: MAVLink `EFI_STATUS`, `FUEL_STATUS`, `GENERATOR_STATUS`, `EXTENDED_SYS_STATE`, `STATUSTEXT` parsing for transition stages, and lift-assist inference from `SERVO_OUTPUT_RAW`.
- Keep the safety-critical core (commands, alerting, engine control) separate from the convenience UI. It may need DO-178C-style assurance.
- Build a SITL scenario harness: transition failure, engine-out, icing, lost link, handover, alert-rate metrics.

## Notes for working here

- The map and IR video in the mockup are **synthetic** placeholders, made with `mockup/fly-view/asset-generators/*.py` (numpy, scipy, Pillow). Map tile servers were blocked from the cloud session.
- All telemetry values in the mockup are illustrative but consistent with each other: 11.4 L fuel at 2.4 L/h gives bingo in 3:12, against 3.7 L of bingo fuel plus 2.4 L reserve.
