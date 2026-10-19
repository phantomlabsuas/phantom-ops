# Operational workspace — screen layout reference

Region map of the **Operational** workspace as it renders in the live `VeronteOps-7.8`
operator GUI. Captured and verified against a running screenshot on 2026-07-01.

- Authoring canvas: **2560 × 1369** px (`windowSize`).
- Source data: `Configuration/VeronteOpsDataBase.json` → `idb.data.data[]` →
  `Workspaces` row `name = "Operational"` → `widgets[]` (23 widgets).
- Positions below are approximate on the authoring canvas. Positions in the JSON are the
  ground truth; see §3.2 of `CLAUDE.md` for the widget schema.

---

## The seven regions

### 1. Map area — left
Fills the left half of the screen at full height. It is the visual backdrop; the HUD,
warning panels and panel buttons overlay on top of it.

- Widget: `Map` (widgetTypeId **1**), position ≈ (49, 51), size 1215 × 1312.
- Shows satellite tiles (coastline + desert in the reference capture), the UAV/vehicle
  marker cluster, and route/measurement overlays.

### 2. Video area — top-right
Wide band across the top-right, directly to the right of the map.

- Widget: `Iframe` (widgetTypeId **13**), position ≈ (1287, 54), size 1269 × 543.
- Displays the camera feed. With no feed connected it shows SMPTE color bars and a red
  **NO REPORT** flag. A secondary strip below holds link/command controls (HOLD / ARM /
  RH / CUT, PRIM / SEC EN / SEC).

### 3. HUD area — right, below the video
The primary flight display and vehicle status cluster.

- Rendered by several `Group conditional` (widgetTypeId **27**) blocks plus `Label`s —
  named groups include: HUD Window, UAV Mode, Altitude, Speed, ROC Area, motors, comms
  display, KNOB BOX, Motors Disable Button, Stopwatch.
- Elements seen on screen: attitude indicator ("MOTORS DISARMED"), altitude tape
  (15…-15) and vertical-speed tape (100…-100) with `0` markers, GS / HDG / ASL readouts,
  PITCH / ROLL / WIND / AZ, the status button row (UAV NO REPORT, GCS NO REPORT, SEC UPL,
  SEC DNL, PRM DNL), L MTR / T MTR / R MTR, THR / RPM / CHT bars, FUEL, Mode, TRANSITION,
  PHASE: INITIAL, and a checklist.

### 4. Panel buttons — center-left vertical column (6 buttons)
Six round icon buttons stacked vertically at the boundary between map and HUD. Each
toggles one of the hidden panels.

- Widget: `Group button` (widgetTypeId **38**, named "Panel Group"), position ≈ (46, 20).
- The panels it reveals are the 14 hidden `Group conditional` (id 27) blocks in this
  workspace (HUD Window, UAV Mode, Engine and Batt, Altitude, Speed, STICKS PANEL, No
  report group, KNOB BOX, motors, SIM, ROC AREA, comms display, Motors Disable Button,
  Stopwatch).

### 5. PCS warning panel — top-center-left overlay
Alerts for the **PCS** (portable control station / ground side). Header shows the active
alert count (e.g. 14).

- Widget: `Veronte Alerts` (widgetTypeId **16**), position ≈ (524, 56).
- Items observed: EPB Primary Not Detected, EPB Secondary Not Detected, Battery Level Low,
  Battery Voltage Low, Battery Voltage High, Battery Not Charging.

### 6. UAV warning panel — top-center overlay (right of PCS)
Alerts for the **UAV** (autopilot / airframe side). Header shows the active count
(e.g. 162).

- Widget: `Veronte Alerts` (widgetTypeId **16**), position ≈ (867, 56).
- Items observed: Motors / Pitot / Ext Mag Comm, ECU / PMU Comm Error, AP CPU Overload,
  IMU A Fault, IMU B Fault, Ext Mag Not Ready, AP Voltage Fault, OPS Operation Fault,
  AP Software Fault, Position Not Fixed, IAS Sensor Fault, Altitude Sensor Fault.

### 7. SIM area — bottom-left
Seven simulator command sliders, each with a `+ / −` stepper and a report value. Used to
drive the vehicle in simulation.

- Rendered by a `Group conditional` (widgetTypeId **27**, "SIM") currently expanded.
- Sliders: SIM KNOBS MOTORS ARM CMD, SIM KNOBS ENGINE CUT CMD, SIM KNOBS HOLD CMD,
  SIM KNOBS RETURN CMD, Simulator Link status CMD, Wing enable sim CMD, Sim Position not fix.

---

## App chrome (not workspace widgets)

- **Left icon toolbar** — the app's own navigation rail down the left edge.
- **Status bar** (bottom) — Distance to PCS, Latitude / Longitude / MSL, and the
  workspace tab selector showing `Operational (1)`.

These come from the app / `localStorage`, not from `Workspaces[].widgets[]`.

---

## Editing pointers

- Move/resize a region → edit the widget's `position` / `resize` in the Operational
  workspace row.
- Restyle a region's look → edit the matching `Styles[id=<widgetTypeId>]` variant CSS, or
  switch the widget's `styleIdSelected`.
- Change which alerts show → the `Veronte Alerts` (id 16) widgets.
- Change the panel-button set → the `Group button` (id 38) and its linked
  `Group conditional` (id 27) panels.

See `CLAUDE.md` §8 for the full edit-and-upload iteration loop.
