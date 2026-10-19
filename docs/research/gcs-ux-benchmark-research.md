# Phantom OPS — GCS UI/UX Benchmark Research

Oct 2, 2026 · @Ilan Rosen

## Executive summary

No shipping GCS combines everything a long-endurance VTOL with a combustion engine needs. That gap is the opening for Phantom OPS. The best products each solve one part: UAV Navigation has alarm depth, Auterion has interaction polish, Lockheed VCSi has crew roles and predictive alerts, and Insitu has the long-endurance operating model. None of them publicly offers all four of these:

- An aviation-grade warning, caution and advisory (W/C/A) alert scheme.
- A first-class engine and hybrid page with fuel-based endurance prediction.
- Visibility of the VTOL transition and lift assist.
- A structured shift handover for 10–20 h sorties.

The research supports one core layout for this. The mission (map, video, tasking) owns the screen. Aircraft health lives in a thin strip that stays greyscale while everything is normal and only escalates when something leaves its normal band. An alert queue sits on the periphery and only surfaces when it must.

This "quiet, dark" approach has evidence behind it. In a 21-operator ASM Consortium study, a grey-until-abnormal display let operators spot failures **before the first alarm in 48% of cases**. They also finished scenarios 41% faster.

The main lessons from incidents point the same way:

- An engine-out must never be silent. In the Predator B crash at Nogales in 2006, the engine shut down with no aural alarm (NTSB A-07-71).
- Control handover between consoles must be checked.
- Lift assist that drains the battery must be shown. ArduPilot sends no message to the GCS when speed-based assist engages.

Fatigue data from USAF crews shows decline about 6 h into a 12 h shift, so vigilance support has to be designed in.

## Benchmark options

These five products are the ones to learn from. Each is the best in public view at one thing Phantom OPS needs. Three mission peers are listed after them for their operating concept (CONOPS), because their screens are not public.

### 1. UAV Navigation — Visionair GCS (closest functional match)

Visionair runs on Windows with keyboard and mouse, and its layout is fully configurable. It is common on tactical VTOL and combustion-engine platforms that use the VECTOR autopilot.

- **Alarms.** The alarm system has the most depth of any vendor, with four tiers:
  - High and Medium alarms appear in the main Alarm Panel.
  - Low and Diagnostic alarms go "discreetly" to a separate Notification Monitor.
  - An alarm that comes back after clearing flashes again.
  - Alarm profiles are defined in XML, with two defaults: a standard set and a full set that adds diagnostics.
- **Engine data.** Any telemetry value (RPM, fuel, CHT) can become a gauge or a live chart. There is a dedicated link-quality panel.
- **Mission planning.**
  - Predictive paths, a wind estimator and ETA.
  - Stored alternative landing sites.
  - Flight plans can be edited in flight.
  - 3D geocaging.
- **Multi-station and review.**
  - One GCS can fly several aircraft, and several GCSs can share one aircraft, which supports handover.
  - Post-flight replay shows exactly what the operator saw.
  - An overlay (OSD) puts the primary flight display on top of live video.
- **Weaknesses.** The UI is dense and engineer-oriented, takes long to learn, and looks dated.
- **Take for Phantom:** the tiered alarm model, the separate home for low-priority items, re-flash on recurrence, alternate landing sites, and replay.

### 2. Auterion — Auterion Mission Control (best modern interaction design)

Auterion Mission Control is touch-first and runs on Windows, Android and macOS. The DeltaQuad Evo VTOL ships with it on a Panasonic Toughbook.

- **Two modes.** Fly and Plan views, plus Normal and Advanced modes. Advanced mode hides expert parameters such as VTOL transition distance until they are needed.
- **Top bar.** A glanceable status bar shows flight mode, link, GPS, RC and battery. It also shows remaining flight time and draws the **RTL point** on the map: where the aircraft will turn home if the battery failsafe fires.
- **Safety interactions.**
  - Risky commands need **hold-to-confirm**.
  - VTOLs are limited to the two safest manual modes.
  - A flickering chevron shows when position data has gone stale.
- **Version 1.38 additions.**
  - Checklists grouped by category.
  - A dual-link interface with automatic switch to the backup radio.
  - Readiness colours for each vehicle in multi-vehicle operation.
- **Messages.** Important vehicle messages open a popup that states the cause and the recommended action. Minor ones go to a log.
- **Weaknesses.** It is built around batteries. There is no visible engine page, and the alert hierarchy has few levels.
- **Take for Phantom:** the visual polish, the "what happens if" display (RTL point, time to home), hold-to-confirm, the progressive-disclosure modes and the stale-data cue.

### 3. Lockheed Martin CDL Systems — VCSi / VCS-4586 (best crew-role and predictive alerting model)

VCS-4586 is the basis of the US Army's One System GCS, with more than 1.2M flight hours. VCSi, its modular successor, claims 1.5M.

- **Crew layouts.** Each crew role gets its own layout across one or more monitors.
- **Notification Center.** One place for all alarms, with **controls for the emergency procedure inside the alert itself**.
- **Predictive warnings.**
  - "Automated Look Ahead" warns of terrain or airspace violations before they happen.
  - Line-of-sight radio coverage is drawn on the map.
  - Lost-link contingency routes are built in.
- **Multi-vehicle.** Dissimilar vehicles can be flown together on a 3D map, using MIL-STD-2525 symbology. A touch-tablet variant, mGCS, works with a gaming joystick.
- **Weaknesses.** The visual style dates from the 2010s, and the STANAG 4586 abstraction is heavy.
- **Take for Phantom:** alerts the operator can act on directly, look-ahead prediction, link coverage on the map, and role-based workspaces.

### 4. Insitu (Boeing) — INEXA Control / cGCS (long-endurance combustion-engine operations model)

INEXA flies ScanEagle, Integrator and RQ-21 Blackjack, which are long-endurance aircraft with combustion engines. It claims more than 820k flight hours.

- **One operator, many aircraft.** A single workstation can run several aircraft. The setup scales from a one-person laptop kit to a multi-computer suite.
- **AVOS video overlay.** Terrain, sensor footprint, targets and airspace are drawn over the video.
- **Plug-ins.** RF link analysis, airspace management and Cursor on Target (CoT) are available as plug-ins.
- **Architecture.** Vehicle-specific modules (Platform Kits) are kept separate from vehicle-agnostic ones (Mission Kits). This is a strong pattern for Phantom's own codebase.
- **Gaps in public information.** Engine pages and alert tiers are not published.
- **Take for Phantom:** the platform-versus-mission module split, the video overlay, and the RF link-analysis tool.

### 5. Quantum Systems — QBase Tactical / MOSAIC UXS (best minimal-training field workflow)

QBase Tactical runs on a 14" Toughbook or on the 7" Skynav handheld.

- **Fast launch.** "QuickStart" missions need no prior planning.
- **Planning aids.**
  - The planner auto-generates paths and follows terrain.
  - It uses a wind forecast and simulates the mission's energy use and flight time.
  - The map shows wind and the **aircraft's shadow on the ground** as a simple height and position cue.
- **MOSAIC UXS (June 2025).** Intent-based control of many uncrewed systems, with a mandatory human override. It works with PX4, ArduPilot and MAVLink, and connects to ATAK, SitaWare and Palantir Maven.
- **Weaknesses.** Electric aircraft only, so there is no engine UX. Missions are short, so there is no fatigue or handover design.
- **Take for Phantom:** fast-launch workflow, mission simulation before flight, and a single codebase across handheld and laptop.

### Mission peers (benchmark the operating concept, not the screens)

| Platform | Why it matters | What is public about the GCS |
| --- | --- | --- |
| Shield AI MQ-35 V-BAT + Hivemind | Tail-sitter VTOL with a JP-5 heavy-fuel engine, 13 h+, SATCOM | Transitions are fully automatic. The GCS is a tasking surface where the operator assigns areas, not waypoints. |
| Textron Aerosonde Mk 4.7 / 4.8 HQ | Hybrid quad VTOL with a JP-8 engine, 14–18 h, run by two soldiers | Uses the Universal GCS family. No public screens. |
| AeroVironment JUMP 20 / Crysalis | Avgas VTOL rated 24 h+ | Crysalis offers one UX across phone, tablet and laptop, with step-by-step wizards. |
| Schiebel Camcopter S-100 | 10 h rotorcraft | Split crew: one laptop for the aircraft, one for payloads. |

Open-source tools are worth a look for single patterns:

- **QGroundControl** has a good explain-and-fix readiness list: green, yellow or red, and each item expands into its cause and a fix.
- **Mission Planner** has the deepest engine and QuadPlane parameter plumbing, but engine values only show through a generic panel.
- **UgCS** has strong 3D terrain-following planning.

## Comparison matrix

Visionair and VCSi lead on alerting depth. Auterion and QBase lead on ease of use. None of the five publishes a dedicated engine or hybrid page with endurance prediction.

| Dimension | Visionair | Auterion Mission Control | VCSi | INEXA | QBase / MOSAIC |
| --- | --- | --- | --- | --- | --- |
| Primary input | Keyboard and mouse | Touch | Mouse plus joystick; touch on mGCS | Laptop or wearable | Touch or joystick |
| Alert tiers | 4 (High, Med, Low, Diag) | 2 (popup, log) | Central Notification Center you can act from | Not public | Not public |
| Engine / fuel display | Generic gauges and charts | None found | Not public | Not public | None (electric) |
| Predicts what happens next | Paths, wind, ETA | RTL point, time to home | Look Ahead, link coverage | Not public | Mission sim, wind forecast |
| Multi-vehicle | Yes | Yes, with readiness colours | Yes, dissimilar types | Yes, 1 operator : N | Intent-based, unlimited |
| Handover between stations | Multi-GCS | Not found | Network handoff | Control transfer | Multi-user sync |
| Visual style | Dated, dense | Modern | Dated | Mid | Modern |
| Fit for VTOL + engine + long hours | High | Medium | High | High | Low–Medium |

"Not public" means the vendor publishes no detail on it, not that the feature is missing.

## What is specific to VTOL + engine + long endurance

Three problems are particular to this class of aircraft, and generic GCS tools handle all three poorly: transition and lift-assist visibility, engine and fuel awareness, and crew endurance over 10–20 h.

### VTOL transition and lift assist

**Transition state reaches the GCS mostly as free text.**

- PX4 and ArduPilot send a structured `MAV_VTOL_STATE` with four values: MC, transition to fixed-wing, FW, and transition to multicopter.
- The finer landing stages exist only as text messages: approach, airbrake, descend and final. The GCS has to parse them.

**A failed transition triggers an automatic action.**

- ArduPilot uses `Q_TRANS_FAIL` and `Q_TRANS_FAIL_ACT` (warn, QLAND or QRTL).
- PX4 triggers a "quad-chute": a reversion to multicopter mode when `VT_ARSP_TRANS` is not reached within `VT_TRANS_TIMEOUT`.
- Operators complain that quad-chute triggers late and that the return path after it is odd.

**Lift assist can run unannounced.** In ArduPilot's current code, speed-based Q\_ASSIST sends no message to the GCS; only the altitude and angle assists warn. On a long sortie, low airspeed, pitot icing or a heavy fuel load could drain the lift battery with nothing shown. Treat this as **\[to verify against the firmware version you use\]**.

**Failsafe logic can be dangerous near the ground.** In one documented case, a low-battery failsafe at 4 m during VTOL landing triggered RTL. The aircraft transitioned to fixed-wing toward power lines.

**Planned engine stops must not look like failures.** ArduPilot's `Q_LAND_ICE_CUT` stops the engine during final VTOL descent, and that must not raise an engine-failure alarm.

### Engine, fuel and hybrid

**The telemetry exists.**

- MAVLink `EFI_STATUS` carries RPM, fuel flow and consumed, CHT, EGT, manifold pressure and temperature, throttle and ignition voltage.
- `FUEL_STATUS` carries remaining fuel and flow.
- `GENERATOR_STATUS` carries warm-up, charging, reduced power, overtemperature, start-inhibited and maintenance due.
- `EFI_PERFORMANCE`, still in development, adds flags for oil pressure, fuel pressure, water in fuel and rev limit.

**ArduPilot supports the major engine ECUs** (Currawong, Hirth, SkyPower, Löweheiser and others). It also has automatic in-flight restart (`ICE_STRT_MX_RTRY`) and idle and redline governors.

**Nobody turns this into an operator display.** QGroundControl has no engine panel. Mission Planner shows values only in a generic panel. Engine OEM tools are for calibration, not monitoring.

**Fuel must be honest.** The MAVLink spec says remaining fuel must be measured, not inferred. If it is inferred ("tank full at boot"), the UI should say so.

**Carburettor icing has a signature.** It begins with a slight RPM drop at constant throttle, followed by rough running and an EGT shift. Risk is highest at 0–10 °C with high humidity, but icing is possible above 25 °C (UK CAA SafetySense 14). This can be detected from EFI and outside-air-temperature data.

**The missing senses.** A remote pilot cannot hear or feel the engine. In the Nogales Predator B crash, the engine was shut off after a console switch. The aircraft gave no aural alarm and crashed. NTSB recommendation A-07-71 calls for clear visual and aural alerts for engine-out, presented in order of priority.

### Crew endurance and handover

**Fatigue is the norm.**

- In an FAA CAMI review, more than 60% of USAF RPA pilots reported very high or extreme fatigue after missions.
- Cognitive decline appeared about 6 h into a 12 h shift.
- In a multi-UAS study, vigilance declined after about 45 min.

**Handover is a risk point.**

- NASA guidance prefers "make before break": the new station takes control before the old one releases it. The FAA prohibits break-before-make in civil airspace.
- In one example, power was at idle on one station and 80% on the other, and the engine over-revved at handover.
- A structured, checklist-based shift log improved the incoming shift's situation accuracy by 9% (ASM Consortium).

**A split crew is the established pattern.** On MQ-9, a forward Launch and Recovery Element flies takeoff and landing over line of sight, and a remote Mission Control Element flies cruise over SATCOM. For Phantom, the equivalent is a field crew for VTOL takeoff and landing and a remote crew for cruise.

**Lost-link plans go stale.** NASA recommends showing the lost-link plan with a countdown and reviewing it about every 10 min. RTCA DO-400 (2023) gives guidance on lost-C2 procedures.

## Human-factors foundations for mission-first, health-peripheral design

The research gives a clear answer on how to keep health out of the way without missing failures. Keep the screen quiet when things are normal, show trends before alarms, and escalate on a strict hierarchy.

| Source | Finding | What it means for Phantom OPS |
| --- | --- | --- |
| FAA AC 25.1322-1 (crewed aircraft) | Red means warning, amber means caution, and advisories may be any colour except red or green. Master alerts stay latched until the crew cancels them or the condition clears. Only one aural alert plays at a time. Alerts are inhibited by flight phase, and the inhibit is always shown on screen. | Adopt W/C/A levels, master alerts, phase inhibits and one-voice-at-a-time audio. |
| Airbus "dark cockpit" / ECAM | A light means abnormal. An *advisory mode* pulses a parameter and opens its system page when it drifts out of its normal band, before it reaches the caution limit. | Use a greyscale health strip, add a pre-alert stage, and open the relevant system page automatically. |
| QF32 (A380, 2010) | 35 ECAM messages took about 55 min to work through. | Group knock-on alerts under their root cause. |
| Garmin G1000 crew alerting system | New unacknowledged alerts appear on top, above a line, and are re-sorted by priority once acknowledged. | Order the alert queue the same way. |
| ASM Consortium (21 operators) | With a grey-until-abnormal display that includes trends, operators finished 41% faster, handled 96% of failures, and spotted 48% of failures before the first alarm. | Strongest evidence for a quiet health strip with sparklines. |
| EEMUA 191 / ISA-18.2 | Steady state should produce at most about 1 alarm per 10 min. More than 10 alarms in 10 min counts as a flood. | Set an alert budget and measure it each sortie. |
| Williams (FAA, 2004) | Human factors were a factor in 67% of Predator accidents. Alerts "do not command attention", and turning off the autopilot took four menus. | Never put a critical action more than one step deep. |
| Hobbs (NASA) | Common problems: one tone with many meanings, visual alerts hidden behind pop-ups, a 7-step trackball action. | Use a unique sound per class, keep the alert area unobstructable, and give critical actions hardware keys. |
| AFRL Vigilant Spirit | A central map plus a compact alert and summary tile for each vehicle. | Proven layout for one operator flying several aircraft. |
| Calhoun (AFRL, 2002) | Tactile fault cues were answered faster than visual ones and disturbed tracking less. | Offer optional wrist or seat haptics for warnings. |
| Cummings & Guerlain (2007) | Performance degrades when the operator is busy more than about 70% of the time. | Automate routine checks so utilization stays below 70%. |
| Endsley's model of situation awareness | Three levels: perception, comprehension, projection. | Show what a value means and when it will hit a limit, not only the raw number. |
| MIL-STD-2525 symbology | Cyan means friendly and red means hostile on the map. | Don't reuse map affiliation colours for alerts. Use white for advisories and always add a shape. |

One finding matters for sound design. Wickens (2009) found that 45% of air traffic conflict alerts were false, with no clear "cry wolf" effect, because controllers anticipated them. Other work, by Bliss, shows that people respond about as often as they believe an alarm is reliable. Phantom should keep nuisance alerts rare and track how often they happen.

## Proposed alert taxonomy and phase inhibition

Phantom OPS should use six levels, from a time-critical warning down to maintenance-only logging. Only the top three ever take space from the mission view. These levels, timings and examples are a draft proposal based on FAA AC 25.1322-1, MIL-STD-411F, Airbus ECAM and IMO Bridge Alert Management. They are not a standard.

| Level | Colour and shape | Sound | What the screen does | Acknowledge rules | Engine-VTOL examples |
| --- | --- | --- | --- | --- | --- |
| L4 Time-critical warning | Red, octagon | A distinct voice message, repeating | Banner across the top of the map, never covered. The relevant panel opens. The aircraft icon gets a red halo. | Acknowledging stops only the repeat. Cannot be shelved. | Engine out in cruise or transition; transition failure; terrain proximity; fuel runs out before any landing site |
| L3 Warning | Red, triangle | Master-warning tone, repeating until acknowledged | MASTER WARN flashes at 3–5 Hz. A health-strip segment turns red. A compact card opens at the edge of the map. | Latched until acknowledged *and* cleared. Brief exceedances stay as "latched – cleared". | CHT or EGT above red limit; low oil pressure; generator failure with battery below reserve; C2 link lost |
| L2 Caution | Amber, diamond | Single chime | MASTER CAUT. A strip segment turns amber. A card appears for about 8 s, then collapses to a pill. | Stays queued until cleared. Can be shelved, with a visible timer. | CHT in the amber band; fuel below planned reserve; lift motor or ESC hot; vibration trend; low link margin |
| L1 Advisory | White, circle | None | A counter on the strip pill. No popup. | Clears itself. | One GNSS or one radio lost; a sensor degraded |
| L0 Trend / pre-alert | Grey turning to white, pulsing | None | A sparkline lights up, with a time-to-limit chip such as "CHT amber in \~6 min". | Not queued. Disappears when the trend reverses. | CHT rising in a hot climb; fuel burn above plan |
| M Maintenance | Not shown in flight | None | Post-flight report only | Logged | Minor exceedances; engine hours; vibration spectra |

**Alerts held back by flight phase are queued, never discarded,** and the inhibit is always shown.

| Phase | Behaviour |
| --- | --- |
| Preflight / engine run | Everything is active. L2 and above block arming. |
| VTOL takeoff and hover climb | L0 and L1 are held. L2 is visual only. L3 and L4 are fully active. |
| Transition | Only alerts that change the continue-or-abort decision get through: lift power, airspeed and engine. "TRANS INHIBIT" is shown. |
| Cruise / mission | Everything is active. L2 and below stay on the periphery. |
| Back-transition and landing | Lift-battery and lift-motor alerts are promoted. A planned engine cut (`Q_LAND_ICE_CUT`) is not an alarm. "LDG INHIBIT" is shown. |
| Post-flight | Shows a review of everything that was queued, latched or inhibited. |

Timing and sound rules:

- Every threshold gets debounce and hysteresis. This prevents spurious alerts from single dropped readings, such as Mission Planner's 0 V battery callouts.
- L2 and above stay on screen for at least 3 s.
- Use fewer than 10 unique sounds, set 20–30 dB above the room's noise level. Lost link has its own sound that nothing else uses.
- If nobody acknowledges an alert at the console within N seconds, it escalates to a phone or watch, then to the backup pilot, then to the mission commander.

## Design principles for Phantom OPS

The mission owns the centre of the screen. Aircraft health gets a fixed, thin, quiet edge that only gets louder when it has to.

&#91;embedded content: Fly view concept · mission centre, health strip, alert queue\]

In this example only the ENG segment has turned amber, because CHT is trending up. Everything else stays grey, and the map keeps the full mission picture.

1. **Quiet and dark when normal.** The health strip is greyscale while everything is nominal. Colour always means something.
2. **One permanent thin health strip.** Its segments are ENG, FUEL, ELEC, LIFT, NAV, LINK and AP. Each shows a glyph, one value and a sparkline. It takes about 5% of the screen and nothing ever covers it.
3. **Show health as a mission consequence.** Draw a fuel bingo ring and reachable landing sites on the map, and draw the link-coverage boundary. Show the RTL point and time to home the way Auterion does.
4. **Trend before alarm.** Use sparklines and time-to-limit chips ("bingo in 3 h 12", "CHT amber in \~6 min") so the operator can project ahead (Endsley level 3).
5. **Escalate automatically, never obstruct.** L2 cards collapse after a few seconds. L3 and L4 open the system page at the map edge but never cover the aircraft, the route or the alert banner.
6. **Replace the missing senses.** Show a continuous peripheral RPM and power cue, with optional low-level synthetic engine sound. Engine-out is always L4 with a voice message.
7. **One root cause, one item.** Group knock-on alerts under their cause (for example "ELEC: on battery, 38 min"), with the details as children.
8. **Colour discipline plus shape.** Alert red and amber appear only in alert chrome. Map symbology keeps the MIL-STD-2525 colours. Every state also has a shape and text.
9. **Acknowledging is not clearing.** An acknowledged alert stays until its condition clears. Short exceedances latch for review, and shelving is visible and timed.
10. **Inhibit by phase, never silently.** Transition and landing get the strictest filtering, and everything held back is queued.
11. **Command, then verify.** Every command shows sent → acknowledged → executed. The autopilot mode and the VTOL phase are always visible.
12. **Guard critical controls.** Engine kill, flight termination and motor kill use hold-to-confirm or a two-step guard. No control changes meaning between consoles (the Nogales lesson).
13. **One step to critical actions.** ACK, RECALL, RTL and HOLD get hardware keys or HOTAS bindings, never menus.
14. **Design for 10–20 h.**
    - Periodic spoken status digests.
    - A "since you last looked" summary.
    - Remote escalation to phone or watch.
    - A shift-handover wizard.
    - Night and NVIS themes.
15. **One codebase, many surfaces.** Rugged laptop, 7–10" handheld and ops-centre multi-monitor share role-based layouts. Platform modules stay separate from mission modules, as Insitu does.
16. **Measure the alert budget.** Target at most about 1 alert per 10 min in cruise. Track the nuisance-alert rate per sortie and run scenario tests in software-in-the-loop (SITL) simulation.

## Requirements backlog

These 22 candidate requirements come out of the research. They are grouped by area. P1 means needed for first flight with the GCS, P2 means needed for long-endurance operations, and P3 means it can come later.

| # | Area | Requirement | Priority |
| --- | --- | --- | --- |
| 1 | VTOL | Phase strip that is always visible (MC → transition → FW → approach → back-transition → land), with a transition timer counting down to the timeout and showing which action fires when it expires | P1 |
| 2 | VTOL | Airspeed tape annotated with stall, assist speed, transition speed, best-endurance speed and max | P1 |
| 3 | VTOL | Lift-assist annunciator, inferred from motor outputs, with the energy cost shown | P1 |
| 4 | VTOL | Lift-battery landing reserve: energy needed for back-transition, hover and one go-around, corrected for temperature | P1 |
| 5 | VTOL | Failsafe preview: what each failsafe would do *right now*, in the current phase | P2 |
| 6 | Engine | Engine page with RPM, CHT, EGT, MAT, MAP, fuel pressure and ignition voltage, plus commanded vs actual throttle. Limit bands come from the engine OEM. | P1 |
| 7 | Engine | Trend lines over 30 min, 2 h and the whole flight, compared against this aircraft's own baseline | P2 |
| 8 | Engine | Advisories from trends: CHT rate of rise, RPM droop at constant throttle, fuel-pressure decay | P2 |
| 9 | Engine | Induction-icing advisory, combining outside air temperature and dewpoint with the RPM/EGT signature | P3 |
| 10 | Engine | Engine-out workflow: L4 voice alarm, restart attempts shown against the retry limit, glide and battery-only reachable landing sites, guarded restart control | P1 |
| 11 | Engine | No alarms for planned stops (commanded stop, `Q_LAND_ICE_CUT`) | P1 |
| 12 | Hybrid | Generator panel showing status flags, bus voltage, charge current, warm-up interlocks and maintenance countdown | P1 |
| 13 | Fuel | Bingo and joker fuel to home and to each alternate site, wind-corrected, shown as "Bingo in hh:mm" | P1 |
| 14 | Fuel | Fuel value marked as measured or inferred, with a pre-flight "tank filled to \_\_ L" confirmation | P1 |
| 15 | Alerts | Six-level alert model (L4 down to M) with latch, acknowledge, shelve and recall rules, and phase inhibits | P1 |
| 16 | Alerts | Remote escalation chain: console → phone or watch → backup pilot → mission commander, with delivery and acknowledgement tracked | P2 |
| 17 | Ops | Make-before-break station handover with an explicit control token and an automatic check of what differs between stations | P2 |
| 18 | Ops | Shift-handover wizard that drafts a summary from the event timeline; the incoming pilot acknowledges each item | P2 |
| 19 | Ops | Mission timeline with countdowns: next waypoint, fuel check, ATC call, bingo, sunset, crew change, predicted landing time | P2 |
| 20 | Ops | Lost-link panel that is always visible: the current action, its timer and the predicted path, with a review prompt about every 10 min | P1 |
| 21 | Ops | Role workspaces (pilot, payload operator, mission commander, observer) with an unambiguous indicator of who has control | P2 |
| 22 | Ops | Vigilance support: periodic spoken status, a "since you last looked" digest, a duty-time tracker | P2 |

## Standards and regulatory angle on GCS HMI

EASA treats the GCS as part of the UAS. At higher SAIL levels, the GCS HMI and its alarm prioritisation must be shown to work through simulation. That makes a scenario test harness worth building from the start.

| Reference | What it asks of the GCS |
| --- | --- |
| JARUS SORA 2.5, OSO #20 | Interfaces must not confuse the crew, cause unreasonable fatigue or contribute to crew error. At Medium robustness (SAIL IV–V) the evaluation covers workload, emergency procedures and **alarm prioritisation**, using demonstrations or simulation. |
| SORA OSO #16–19 | #16: multi-crew coordination. #17: crew fitness and fatigue management. #18: envelope protection. #19: recovery from human error. |
| EASA Special Condition Light-UAS | The command unit must provide warnings, cautions and normal indications. These must reach the crew member who acts on them. Powerplant parameters **and trends** must be shown with their limits. |
| FAA AC 25.1322-1 / MIL-STD-411F | Not mandatory for UAS. They are the de facto references for alert colours, tones and flash rates. |
| NASA RPAS guidelines (Hobbs) | Practical guidance on lost-link alerts, handover, controls and alarms. In practice it is the standard used for UAS control stations. |
| RTCA DO-362 / DO-377B / DO-400 | C2 link performance standards and requirements, and lost-C2-link procedures. |
| STANAG 4586 (AEP-84) | Five levels of interoperability. LOI 4–5 means the GCS flies the aircraft, including launch and recovery. It sets **no** human-factors requirements. |
| MIL-STD-1472H §5.12.4 | Human-engineering design criteria for unmanned vehicles. Seen in the table of contents only; the text was not checked. |
| ASTM F3002-22 | C2 design for small UAS up to 25 kg. Applicability depends on Phantom's aircraft weight. |
| DO-178C | Often applied at SAIL IV–VI. Keep command, alerting and engine control in a small, separately assured core, apart from the convenience UI. |

## Open questions and next steps

The answers to the questions below fix the screen layout and the alert defaults, so they should be settled before design starts.

- [ ] Which autopilot stack do we fly? PX4, ArduPilot or our own? This decides which MAVLink messages and transition states we can rely on.
- [ ] Which engine, ECU and generator? Their limits feed the engine page bands.
- [ ] Crew model: one pilot, or a pilot and a payload operator? A field crew for launch and recovery plus a remote crew for cruise?
- [ ] Target hardware: rugged laptop, handheld, ops-centre multi-monitor, or all three?
- [ ] Target SAIL / certification path, which sets how much HMI evidence we need.
- [ ] Is remote escalation to phone or watch acceptable in our operating environment (security, EMCON)?
- [ ] Next step: wireframe the Fly view with the health strip, phase strip and alert queue, then run it against SITL scenarios: transition failure, engine-out, icing, lost link and handover.

## Sources

All sources were opened between 30 September and 2 October 2026. Vendor UI details for Shield AI, Textron, Edge Autonomy, Elbit, IAI and Baykar are not public, so those systems are benchmarked on their operating concept only.

**Vendors**

- [UAV Navigation Visionair GCS](https://www.uavnavigation.com/products/ground-control-station/visionair-ground-control-station-gcs-software) · [Visionair Alarm Panel](https://www.uavnavigation.com/company/blog/state-art-gcs-display-advanced-alarm-panel-operators-quick-notification) · [Visionair v4.36](https://www.uavnavigation.com/company/news-and-events/visionair-v436-available-now) · [VTOL autopilot](https://www.uavnavigation.com/solutions/VTOL-Fixed-Wing-Autopilot) · [Sky Power partnership](https://www.uavnavigation.com/company/partners/sky-power)
- [Auterion Mission Control](https://auterion.com/product/mission-control/) · [AMC Fly view](https://docs.auterion.com/vehicle-operation/auterion-mission-control/ui-breakdown/fly) · [AMC 1.38.16 release notes](https://docs.auterion.com/release-notes/auterion-mission-control-release-notes/amc-1.38/amc-1.38.16) · [DeltaQuad GCS overview](https://docs.deltaquad.com/evo/flight/ground-control-station-overview) · [Auterion Nemyx](https://thedefensepost.com/2025/09/05/auterion-nemyx-drone-swarm/)
- [Lockheed VCSi Capabilities Guide](https://lockheedmartin.com/content/dam/lockheed-martin/rms/photo/cdl/VCSi_Capabilities-Guide.pdf) · [CDL Systems brochure](https://www.lockheedmartin.com/content/dam/lockheed-martin/rms/documents/cdl/CDL-Systems-brochure.pdf)
- [Insitu INEXA](https://www.insitu.com/products/inexa) · [Insitu cGCS](https://www.insitu.com/products/cgcs)
- [Quantum Systems QBase Tactical](https://quantum-systems.com/us/qbase-tactical/) · [MOSAIC UXS](https://quantum-systems.com/blog/2025/06/03/quantum-systems-launches-mosaic-uxs/)
- [Shield AI V-BAT block upgrade](https://shield.ai/shield-ai-unveils-v-bat-block-upgrade-powered-by-hivemind-advanced-autonomy-satcom-and-heavy-fuel-engine-among-new-features/) · [Textron Aerosonde FTUAS datasheet](https://www.textronsystems.com/sites/default/files/_documents/Aerosonde%20FTUAS%20Datasheet_Digital.pdf) · [Textron UGCS](https://www.textronsystems.com/products/universal-ground-control-station) · [AV Crysalis](https://insideunmannedsystems.com/crysalis-offers-ground-control-simplicity-interoperability-to-frontline-combatants/) · [Schiebel Camcopter S-100](https://schiebel.net/camcopter-s-100/) · [Anduril Lattice for Mission Autonomy](https://www.airandspaceforces.com/sneak-peek-anduril-lifts-veil-combat-drone-software/)
- [QGroundControl Fly View toolbar](https://docs.qgroundcontrol.com/Stable_V5.0/en/qgc-user-guide/fly_view/fly_view_toolbar.html) · [UgCS](https://www.sphengineering.com/flight-planning/ugcs)

**VTOL and engine technical**

- [ArduPilot QuadPlane transitions](https://ardupilot.org/plane/docs/quadplane-transitions.html) · [QuadPlane reliability](https://ardupilot.org/plane/docs/quadplane-reliability.html) · [Assisted fixed-wing flight](https://ardupilot.org/plane/docs/assisted_fixed_wing_flight.html) · [ArduPilot ICE](https://ardupilot.org/plane/docs/common-ice.html) · [ArduPilot EFI](https://ardupilot.org/plane/docs/common-efi.html)
- [PX4 VTOL configuration](https://raw.githubusercontent.com/PX4/PX4-Autopilot/main/docs/en/config_vtol/vtol_quad_configuration.md) · [PX4 quad-chute discussion](https://discuss.px4.io/t/quadchute-issues-improvements/17776) · [Low-battery RTL during QuadPlane landing](https://discuss.ardupilot.org/t/rtl-during-landing-on-quadplane-triggered-by-low-battery/43964)
- [MAVLink common messages](https://mavlink.io/en/messages/common.html) · [Currawong ECU](https://www.currawongeng.com/ecu/) · [UK CAA SafetySense 14 – piston engine icing](https://www.caa.co.uk/media/j5omfigm/ssl-14_piston-engine-icing.pdf)

**Human factors and alerting**

- [FAA AC 25.1322-1](https://www.faa.gov/documentLibrary/media/Advisory_Circular/AC_25.1322-1.pdf) · [MIL-STD-411F](https://www.cevians.com/app/uploads/2021/01/MIL-STD-411.pdf) · [Airbus vs Boeing annunciation](https://aviaproconsulting.com/article/post/engineering-spotlight-the-ergonomics-of-annunciation-%E2%80%93-airbus-lights-out-vs-boeing-quiet-and-dark) · [A320 flight phases and inhibits](https://www.aviationhunt.com/airbus-a320-flight-phases/)
- [Williams 2004 – UAV human factors (FAA)](https://faa.gov/sites/faa.gov/files/data_research/research/med_humanfacs/oamtechreports/0424.pdf) · [Hobbs – RPAS control station guidelines (NASA)](https://ntrs.nasa.gov/api/citations/20160014467/downloads/20160014467.pdf) · [NASA RPAS guidelines 2019](https://ntrs.nasa.gov/api/citations/20190000211/downloads/20190000211.pdf)
- [NTSB A-07-70 to 86 (Nogales Predator B)](https://www.ntsb.gov/safety/safety-recs/recletters/A07_70_86.pdf) · [Flight Safety Foundation on Nogales](https://flightsafety.org/asw/dec07/asw_dec07_p42-46.pdf)
- [FAA CAMI RPA fatigue review](https://www.faa.gov/sites/faa.gov/files/data_research/research/med_humanfacs/oamtechreports/202121.pdf) · [Wohleber et al. 2019 – vigilance and automation](https://journals.sagepub.com/doi/full/10.1177/0018720818799468) · [Cummings & Guerlain 2007](https://journals.sagepub.com/doi/10.1518/001872007779598109) · [Calhoun et al. 2002 – tactile alerts](https://journals.sagepub.com/doi/10.1177/154193120204602609)
- [AFRL Vigilant Spirit Control Station](https://www.wpafb.af.mil/News/Article-Display/Article/1295072/afrl-shares-uav-software-to-further-research/) · [ASM Consortium human-centred HMI study](https://journals.sagepub.com/doi/10.1177/154193120504902308) · [ASM structured shift handover](https://process.honeywell.com/content/dam/process/en/documents/document-lists/doc_asm-consortium/white-papers/June%2011%202011%20-%20Structure%20Approach%20to%20Shift%20Handover%20Improves%20Situation%20Awareness%20White%20Paper.pdf)
- [Alarms – EEMUA 191 summary](https://humanfactors101.com/topics/alarms/) · [IMO Bridge Alert Management](https://assets.iec.ch/public/tc80/Supporting%20Document%20Bridge%20Alert%20Management%20for%20mariners%20V4.pdf) · [MIL-STD-2525 symbology](https://corvusintell.com/blog/c2-systems/symbology-engineering-mil-std-2525/)

**Regulatory**

- [JARUS SORA 2.5 Annex E](http://jarus-rpas.org/wp-content/uploads/2024/06/SORA-v2.5-Annex-E-Release.JAR_doc_28pdf.pdf) · [EASA SC Light-UAS](https://www.easa.europa.eu/sites/default/files/dfu/special_condition_light_uas.pdf) · [RTCA SC-228 terms of reference](https://www.rtca.org/wp-content/uploads/2024/07/SC-228-TOR-Rev-18-Approved-2024-06-27.pdf) · [STANAG 4586 overview (NATO STO)](https://publications.sto.nato.int/publications/STO%20Educational%20Notes/STO-EN-SCI-271/EN-SCI-271-03.pdf) · [MIL-STD-1472H](https://dn790000.ca.archive.org/0/items/mil-std-1472-g-chg-1/MIL-STD-1472H.pdf)
