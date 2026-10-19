# Operational Layout – Data Map

| | |
|---|---|
| **Scope** | What every live element of the Veronte Ops **Operational** workspace reads, writes or triggers on the autopilot, and how that maps to the Phantom OPS Fly view. |
| **Source** | `C:\Projects\Operational\phantomhawk-ops\Layouts\Operational.vws` (Ops 7.8.76, 503 widgets), flight PDI `phantomhawk-pdi/UAV-1xVeronte/setup` (7.8.70). |
| **Generated tables** | [`generated/`](generated/), produced by [`tools/extract_ops_layout.py`](tools/extract_ops_layout.py). Re-run it after any layout or PDI change (command in [README](README.md#regenerating)). |
| **Status** | Extracted 2026-10-16. Variable → vector mapping is exact (from `tm.xml`). Mapping to Phantom OPS elements is a **draft** for review. |

Notation: `R` Real, `U` Uint16, `B` Bit, `P` position, followed by the variable ID (e.g. `R3502`). "V1" = telemetry vector 1 (see [integration-guide §4.3](integration-guide.md#43-vectors-of-the-flight-pdi)). All variables are from the AP unless marked **PCS** (device 9999).

---

## 1. Inventory

| Item | Count | Table |
|---|---|---|
| Widgets (incl. nested) | 503 (185 labels, 111 conditional groups, 100 images, 24 bars, 24 action buttons, 19 sliders, …) | – |
| Read-outs (label, bar, tape, attitude) | 214 bindings, 180 to the AP, 34 to the PCS | [`ops-layout-readouts.csv`](generated/ops-layout-readouts.csv) |
| Visibility conditions (`Group conditional.checkText`) | 90 (36 are heading / wind arrow pointers) | [`ops-layout-visibility.csv`](generated/ops-layout-visibility.csv) |
| Alerts (two *Veronte Alerts* panels) | 173: UAV 159, PCS 14 | [`ops-layout-alerts.csv`](generated/ops-layout-alerts.csv) |
| Action buttons → User Event (50002) | 24 | [`ops-layout-buttons.csv`](generated/ops-layout-buttons.csv) |
| Sliders / knob / input → Variable set (50041) | 22 | [`ops-layout-writes.csv`](generated/ops-layout-writes.csv) |
| Label scripts (JS) | 3 | [`ops-layout-scripts.md`](generated/ops-layout-scripts.md) |
| Distinct AP variables used | 138 + those in conditions, scripts and alerts. **All are in telemetry**; 15 only in conditional vectors (§5). | [`summary.json`](generated/summary.json) |

## 2. Region by region

Region names follow [`reference/ops-operational-layout-regions.md`](reference/ops-operational-layout-regions.md).

### 2.1 HUD window and UAV mode

| Element | Variables | Vector | Notes |
|---|---|---|---|
| Attitude ball | R8 roll, R7 pitch, R6 yaw; desired R108 roll, R107 pitch | V0 | radians |
| Heading pointer (36 image groups) | R6 yaw | V0 | one image per 10°, chosen by `checkText` ranges |
| HDG command | R3177 *Knobs HDG cmd* (knob + input box, **write**) | V1 | rad. HDG chip shown when U1 = 12 (HDG phase) |
| Wind | R2813 wind speed, R3303 *Wind Azimuth (GUI)* | V1 | 16 arrow images by R3303 |
| MOTORS DISARMED banner | `B1243 <= 0.5 \|\| B1232 == 0` | V1 | B1243 *Wing disarm switch*, B1232 *KNOBS MOTORS ARM CMD* |
| Wing safety / nav / strobe icons | B1243 = 0, B2199, B2198 | V1 | |
| UAV mode chip | B1213 *Flying multi*, B1212 *Flying FW*, B1214 *Flying transition* | V1 | → Phantom OPS VTOL phase strip |
| Phase | U1 *Current phase identifier* | V1 (also 50008) | IDs in [integration-guide §4.4](integration-guide.md#44-units-and-value-conventions) |

### 2.2 Flight data tapes

| Element | Variables | Vector | Ops bands (display units, ⚠ verify) |
|---|---|---|---|
| IAS tape | R3130 *IAS Filtered*, R100 desired IAS, R3174 *Knobs IAS cmd* | V1 | Crit < 32, Low 32–36.9, High 51–56, Crit ≥ 56 |
| GS | R2 | V0 | |
| Altitude ASL | R503 MSL, R209 desired MSL, R3206 *MSL rounded cmd*, R3173 *Knobs MSL cmd* (**write**, 0–15000 step 500) | V1 | |
| Altitude AGL | R504 AGL, R3188 *AGL (ft)*, R3189 *Desired AGL (ft)*, R3205, R3187 *AFL ALT CMD* (**write**, 0–15000 step 100) | V1 | ASL vs AGL view chosen by B1250 (0 = ASL, 1 = AGL) |
| ROC | R3181 | V1 | arrows at ±0.1 and ±0.45 |
| Pitot calibration | B1275 *IAS offset calibration done*; button event 164 (INITIAL only) | V1 | |

### 2.3 Engine, fuel and electrical (ENG / FUEL / ELEC)

| Element | Variables | Vector | Ops bands (⚠ verify units) |
|---|---|---|---|
| Engine state | U1005: 0 OFF, 1 Warm Up, 2 Running | V1 | |
| RPM | R3499 *ECU RPM* | V1 | amber < 3000, OK 3000–8500, amber 8500–9000, red > 9000 |
| CHT | R3502 | V1 | HUD: amber < 80, OK 80–169, amber 170–189, red ≥ 190. **Engine panel: amber 170–200, red 200–250. The two disagree.** |
| MAT, TPS, baro | R3503, R3501, R3505 | V1 | |
| Throttle | R3193 *THR*, R3500 *ECU Throttle Cmd*, R3514 *ECU Throttle Output*; panel input R3200 (**write**) with B1300 (event 144) | V1 (B1300 only V7) | |
| Fuel level | R3400 *Fuel Level Sensor* (L), R3185 mass, R3215 *Fuel Remaining Calculated*, R3183 *Fuel Quantity Input* (**write**, 0–7.5 L) | V2 | HUD: red < 0.5, amber 0.5–1, OK > 1. Panel: red < 1, amber 1–2. |
| Fuel flow / pressure / temp | R3208 *Fuel Flow l/h*, R3512 / R3531 fuel pressure, R3401 fuel temp, R3513 pump duty | V1 / V2 | |
| ECU supply | R3516 input V, R3518 input A, R3517 / R3519 12 V rail | V1 | |
| ECU comm | B1060 *ECU Fast Telemetry Message Received* (script: TLM OK / NO TLM), B1501 *ECU User Enable* | V1 | |
| Generator / PMU | R3600 RPM, R3601 PWM, R3602 gen V, R3605 gen A, R3603 main V, R3611 system A, R3612 regulator A, R3607 HV current, temps R3620 / R3621 / R3625 | V1 / V2 | |
| PMU mode | R3610: 0 DISABLED, 1 STOP, 2 NOT GEN, 3 BEEP, 4 CRANKING, 5 GENERATING, 6 AUGMENTING | V1 | script shows SUPPLYING when 5 |
| Battery | R3604 *BATT V*, R3201 *BATT A* | V1 | V: red 32–41.9, amber 42–44, OK 44.1–51.5, red ≥ 51.5. A: amber 160–215, red ≥ 216 |
| Battery flow arrows | B1317 / B1318 over-current, R3607 > 0.1 (charging direction) | V1 | |
| Engine crank | event 117 (ARMED only) → B1790, B1610 := 1 | – | |
| Generator enable | event 113 (toggle on B1705 / B1787) | – | |
| Sticky errors | ~80 `ECU Sticky …` / `PMU Sticky …` bits B1549–B1785; cleared with event 150 | V1 | |

### 2.4 Lift system (LIFT)

The Phantom Hawk has **three** lift ESCs, Left, Right and Tail (ESC1–3), plus a tilt servo. CLAUDE.md says "quad motors", so that needs correcting or confirming.

| Element | Variables | Vector | Ops bands |
|---|---|---|---|
| Motor temperature | R3300 L, R3301 R, R3302 T | V1 | OK 0–89, red ≥ 90 |
| ESC current | R3252 / R3255 / R3258 | V1 | red ≥ 60 A |
| ESC voltage / temperature | R3251 / R3254 / R3257, R3253 / R3256 / R3259 | V1 | |
| ESC speed / command | U1006–U1008, U1025 / U1026 | V1 | not shown in Ops |
| ESC faults | B2050–B2085 (encoder, bridge, stall, hot, throttle loss, over/under voltage), B1284 / B1293–B1297 high temp / current | V1 | |
| Motors sync | B1263 *Motors sync OK* | V1 | also a TAKE-OFF condition |
| Motors arm | B1247 software enable (event 30, toggle); motors-test button event 143 shown when U1 = 13 | V1 | |
| Servo feedback | temps R4024–R4029 (V2); currents R4018–R4023 (**V7 only**) | | Known PDI issue: aileron L temperature is mapped onto aileron R |

### 2.5 Navigation (NAV)

| Element | Variables | Vector |
|---|---|---|
| Position | R501 lat, R500 lon (rad), R502 height | V0 |
| GNSS 1 / 2 | U117 / U167 fix type (0 NO FIX, 1 DR, 2 2D, 3 3D, 4 GNSS&DR, 5 TIME ONLY), U100 / U150 sats (V2), R3209 / R3210 accuracy, R1509 / R1609 PDOP, B1305 RTK no fix, B1262 enable RTK (**write**) | V1 / V2 |
| Lidar / SRTM | R1100 lidar distance (V0), R3268 SRTM height, B1260 / B1261 AGL source, U1003 / U1004 lidar state / auto (events 99, 106) | V0 / V1 |
| QNH | R1404 | V2 |
| Sensor errors | B50, B57, B58, B83, B90, B100, B101, B106, B130, B134, B1188 | V1 |

### 2.6 Links and control station (LINK)

| Element | Variables | Vector |
|---|---|---|
| Primary / secondary link | B1310 / B1311 status, B1312 / B1313 ON, B1314 secondary override (**write**) | V1 |
| Distance to PCS | R3262 | V1 |
| Sticks / FBX | R3104 mode (0 AUTO, 1 FBX), R3105 transition (MULTI / FIXED), R3106 manual (0 AP, 1 DISCO), B1301 secondary FBX (event 22), B1266 sticks detected | V1 |
| Knob box (physical switches on the PCS) | B1232 ARM, B1233 ENGINE CUT, B1234 HOLD, B1235 RETURN | V1 |
| PCS (device 9999) | battery R3103–R3105, GNSS U117 / U100 / R1509–R1531, temperature R305, knob outputs B801 / B803 / B805 / B807, B808 knob box disconnected, B66 / B72 serial receiving, B104 / B105 stick PPM | PCS telemetry. **PCS PDI not available.** |
| Radio | DoodleMonitor iframes `http://localhost:5000/basic`, `/adv` | not VCP |

### 2.7 Autopilot (AP)

R400 power input, R405 CPU temperature (V2), R2050 / R2051 / R2094 / R2095 task CPU ratios, R2057 CIO frequency, B9 PDI error, B401 GNC fail, B403 CIO overload, B117 main power error, B133 operation error, U1040–U1046 software version (**V3 only**, requested with event 109), U95 hardware address (**V3 only**).

### 2.8 SIM area

Seven sliders write simulator bits: B1236 motors arm, B1237 engine cut, B1238 hold, B1239 return, B1900 sim link status, B1241 wing enable, B1244 position not fixed. The area is shown when B1226 = 1. In Phantom OPS these belong to a SITL / test workspace, never the Fly view.

### 2.9 Non-VCP sources in the layout

| Widget | Source |
|---|---|
| Payload video (Iframe) | `http://localhost:8889/pilotwindow_h264`, mediamtx on the ground PC (WebRTC port 8889; RTSP 8554, HLS 8888) |
| Radio status | DoodleMonitor `http://localhost:5000` |
| Stopwatch | PhantomClock `http://127.0.0.1:5005` |
| Veronte Panel (native) | built-in Ops panel at (2247, 605) with `phaseMode: true`: GPS, position, atmosphere, sensor, system error and gamepad status, plus phase buttons. What it sends is not in the layout file. **⚠ verify by capture** (probably User Events 2, 4, 12, 14, 16, 80, 85). |

## 3. Commands in the layout

### 3.1 Buttons (User Event 50002)

| Event | Ops label | Effect (PDI automations) |
|---|---|---|
| 30 | MOTOR DISARM | toggles B1247 *Motors arm Software Enable* |
| 78 / 89 | NAV / STR | nav (GPIO 1, B2199) / strobe (GPIO 2, B2198) lights toggle |
| 93 / 94 / 95 | MIN / CRS / MAX | U1002 IAS mode := 1 / 0 / 2 |
| 97 / 98 | IAS + / − | B1217 / B1218 := 1, U1002 := 3 (manual) |
| 101 / 119, 128 / 132 | ALT + / − (ASL, AGL) | B1251 / B1252 := 1 |
| 126 | AGL | toggles B1250 (AGL / ASL mode) |
| 99 / 106 | PWR / MODE | lidar power U1003, lidar auto U1004 |
| 109 | UAV (versions) | B1249 := 1 (enables V3 for one timer period) |
| 113 | generator | toggles B1787 |
| 117 | Start | crank, only in ARMED: B1790, B1610 := 1 |
| 143 | TEST | R3199 := 8 (align motors), only if B1232 = 1 |
| 144 | SET | toggles B1300 (engine panel throttle control) |
| 150 | clear sticky | CAN messages 4 and 5 to ECU / PMU |
| 164 | CALIBRATE | B1274 := 1, only in INITIAL |
| 22 | SEC EN | toggles B1301 (secondary FBX) |
| PCS event 1 | PCS | event of the PCS, not the AP |

Phase events **not** placed as buttons in the layout: 2 TAKE-OFF READY, 4 TAKE-OFF, 12 LANDING, 14 HOLD, 16 HOVER, 80 RETURN HOME, 85 HDG, 33 servo test, 68 trim. Their guards (phase, mode 0, B1232, B1246, B1263, B1220, limits) are in [`pdi-button-events.csv`](generated/pdi-button-events.csv). HOLD and RETURN HOME can also be triggered by the knob box bits B1234 / B1235.

### 3.2 Variable writes (50041)

R3177 HDG cmd, R3173 MSL cmd, R3187 AGL cmd, R3200 throttle input, R3183 fuel quantity, R3180 UAV weight, R3234 RH delay timer, B1256 hold CW, B1248 test flight, B1255 energy control, B1254 passenger telemetry, B1262 RTK, B1314 secondary link override, and the SIM bits (§2.8). Only Bit writes are verified so far; see [integration-guide §5.2](integration-guide.md#52-set-a-variable--configuration-manager-50041-configurable-235).

## 4. Phantom OPS Fly view → Veronte sources (draft)

| Fly-view element (mockup) | Veronte source | Remarks |
|---|---|---|
| Top bar: mode | U1 phase (V1 / 50008) | |
| Top bar: VTOL phase strip | B1213 multi, B1214 transition, B1212 FW; R3105 stick transition | no transition *stage* variable seen; ⚠ check the PDI for one |
| Top bar: flight data | R3130 IAS, R2 GS, R503 MSL / R504 AGL, R3181 ROC, R3 heading | |
| Top bar: control owner | R3104 (AUTO / FBX), R3106 (AP / DISCO), B1301; plus Veronte Ops activity | |
| Top bar: link | B1310 / B1311, B1312 / B1313, packet age, 50034 (⚠) | |
| Top bar: bingo | computed: R3215 remaining (or R3400) ÷ R3208 flow, against distance home | fuel reserve values are a Phantom OPS setting |
| MASTER WARNING / CAUTION | Phantom OPS alert model over the alert bits below | |
| Health strip ENG | U1005, R3499, R3502, R3503, R3500 / R3514, B1060, ECU sticky bits, ENG alerts | **no EGT, CHT 2, MAP value, ignition, mixture or engine hours in telemetry** (the mockup's engine window shows them) |
| Health strip FUEL | R3400, R3185, R3215, R3208, R3512 / R3531, R3401, B1307 / B1308 / B1309 | |
| Health strip ELEC | R3604, R3201, R3610, R3600–R3625, B1317–B1325, PMU sticky bits | |
| Health strip LIFT | R3300–R3302, R3251–R3259, U1006–U1008, B2050–B2085, B1263, B1247 | |
| Health strip NAV | U117 / U167, U100 / U150, R3209 / R3210, B1305, sensor error bits | |
| Health strip LINK | link bits, R3262, PCS liveness, Doodle radio | |
| Health strip AP | R400, R405, CPU ratios, B9 / B401 / B403 / B117 / B133, packet age | |
| Map: own aircraft | R501 / R500 / R502, R3 / R6, R2 | |
| Map: home / RTH | R3249 *Distance from Selected RH* (V1), P28674–P28679 (6 positions in V0, meaning ⚠ verify). U1000 *Selected RTH ID* is **not** in telemetry. | |
| Map: wind | R2813, R3303 | |
| Alerts panel | [`ops-layout-alerts.csv`](generated/ops-layout-alerts.csv): bit, text, `trigger_on` (1 = alert when bit = 1, 0 = when bit = 0), and a proposed segment | levels L0–L4 still to be assigned |
| Command window HOLD / RTB | events 14 / 80, two-tap confirm | guarded by phase and mode in the PDI |
| Command window speed −/+ | events 97 / 98, or modes 93–95 | |
| Command window altitude −/+ | events 101 / 119 (ASL) or 128 / 132 (AGL), or set R3173 / R3187 | |

### 4.1 Alert grouping

`proposed_segment` in the alert table comes from keyword rules in the extractor. It is a starting point for review: LIFT 47, ELEC 46, ENG 33, NAV 26, AP 8, LINK 7, FUEL 6. The 14 PCS alerts are about the ground station and should go to a GCS indicator, not to the aircraft health strip. Ops uses two types: *alert* (146 UAV) and *warning* (13 UAV: ESC high temperature and current, fuel low, battery current and voltage, IAS minor exceedances, no DGPS, lidar). Ops levels do not map one-to-one to the 6-level Phantom OPS model.

## 5. Gaps and risks

| # | Gap | Effect | Action |
|---|---|---|---|
| 1 | U1040–U1046 software version and U95 hardware address are only in V3 (enabled by B1249, event 109) | versions blank until requested | request once on connect **only after an operator action**, or move them to V2 in the PDI |
| 2 | Servo currents R4018–R4023 and B1300 (throttle-panel state) are only in V7 (B1265 FDR) | values missing in normal operation | add them to V1 / V2 in the PDI if Phantom OPS needs them |
| 3 | No EGT, CHT 2, MAP, ignition or engine-hours values in telemetry | mockup's engine window cannot be filled | decide with Ilan: add to the PDI (ECU may provide them) or drop them from the design |
| 4 | PCS PDI not available | PCS variables can be shown by ID but not decoded by name; vector hashes unknown | obtain the PCS PDI and record its hashes |
| 5 | Real / Uint variable writes are not verified | altitude, heading and throttle set-points | capture an Ops slider write and test in SIL |
| 6 | What the native *Veronte Panel* sends for phase commands | HOLD / RTB / LAND implementation | capture with Wireshark while pressing them in Ops (SIL) |
| 7 | Ops colour bands may be in display units; CHT bands disagree between two widgets | wrong limits | take the limits from the engine documentation (open question 2 in CLAUDE.md) |
| 8 | 50034 / 50021 / 50022 payloads unknown | no link-quality numbers | decode from captures |
| 9 | The flight PDI and the Maintenance PDI have diverged (V0, events, automations, blocks) | hashes and event IDs differ by PDI | always load the PDI that is on the aircraft; check hashes on connect |
| 10 | Several automations depend on block-program state (e.g. nav lights in STANDBY) | accepted commands with no visible effect | show "Not executed" with the reason |
