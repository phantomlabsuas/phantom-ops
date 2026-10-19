# Raw research report 2: VTOL + combustion engine + long endurance, operator needs

This is the research subagent's output from the session on 2026-10-02, kept close to verbatim. The synthesized version is in `../gcs-ux-benchmark-research.md`.

The subagent ran about 60 searches and fetches, and checked several claims against the MAVLink and ArduPilot source. Snapshots of that source are in `../../../reference/upstream-snapshots/`. Items marked **[UNCERTAIN]** could not be fully verified.

---

## 1. VTOL transition UX

### ArduPilot QuadPlane

**How transitions work**

- **Forward transition.** The pusher spools up until airspeed reaches `AIRSPEED_MIN`. The lift motors then ramp down over `Q_TRANSITION_MS` (default 5 s).
- **Transition failure.** `Q_TRANS_FAIL` is a timeout and defaults to 0 (disabled). `Q_TRANS_FAIL_ACT` sets the action: -1 warn only, 0 QLAND, 1 QRTL. `Q_OPTIONS` bit 19 makes the aircraft continue the transition instead.
- **Back transition.** The aircraft holds 0° pitch, which is then relaxed over `Q_BACKTRANS_MS`.
- Sources: https://ardupilot.org/plane/docs/quadplane-transitions.html · `ArduPlane/quadplane.cpp`

**Reliability guide recommendations** (https://ardupilot.org/plane/docs/quadplane-reliability.html)

- Set `Q_ASSIST_SPEED` about 3 m/s below `AIRSPEED_MIN` but above stall.
- Set `Q_TRANS_FAIL_ACT` to QRTL, or to "warning-only for BVLOS".
- Use `DO_LAND_START` / `RTL_AUTOLAND` to control the approach direction.
- Plan long base and final legs: at 30 m/s and 30° bank, the turn radius is over 200 m.

**What the GCS actually receives**

- Transition state comes to the GCS mainly as STATUSTEXT strings (verified in source): "Transition started airspeed %.1f", "Transition airspeed wait", "Transition airspeed reached", "Transition FW done", "Transition done", and "Transition failed, exceeded time limit" (CRITICAL).
- Landing sends "VTOL airbrake v=… d=…", "VTOL approach d=…", "Land descend started", "Land final started" and "Land complete".
- The structured state is `EXTENDED_SYS_STATE.vtol_state` (MAV_VTOL_STATE: TRANSITION_TO_FW / TRANSITION_TO_MC / MC / FW).
- The finer landing stages exist only internally, in `quadplane.h`: QPOS_APPROACH, AIRBRAKE, POSITION1/2, PAUSE, LAND_DESCEND, LAND_ABORT, LAND_FINAL. A GCS has to parse the text messages to show them.

**Finding: VTOL assist is largely invisible to the GCS**

- Q_ASSIST (`Q_ASSIST_SPEED`, `_ALT`, `_ANGLE`, `_DELAY`) brings the lift motors on during fixed-wing flight.
- In `VTOL_Assist.cpp`, altitude assist and angle assist send a WARNING STATUSTEXT, but **speed assist sends no message at all**. The assist flags only go to the onboard log (QTUN).
- So a long-endurance aircraft could silently drain its lift battery for a long time, for example with pitot icing or low airspeed at a heavy fuel weight.
- **[UNCERTAIN]** This is from reading current master. A GCS can infer assist from SERVO_OUTPUT_RAW.
- The docs also warn that synthetic airspeed "can be very inaccurate", which can trigger false assist: https://ardupilot.org/plane/docs/assisted_fixed_wing_flight.html

**Engine-related:** `Q_LAND_ICE_CUT` stops the ICE during the final VTOL landing (https://ardupilot.org/plane/docs/common-ice.html). That expected stop must not raise an engine-failure alarm.

### PX4 / QGroundControl

**Transition behaviour**

- If airspeed does not reach `VT_ARSP_TRANS` within `VT_TRANS_TIMEOUT`, the transition aborts and a **quad-chute** fires. Quad-chute means reverting to multicopter mode, not a parachute.
- `VT_F_TR_OL_TM` covers aircraft without an airspeed sensor.
- Back transition is immediate and the pusher stops.
- Source: https://raw.githubusercontent.com/PX4/PX4-Autopilot/main/docs/en/config_vtol/vtol_quad_configuration.md
- The uncommanded-descent quad-chute was reworked to use an altitude-loss threshold (`VT_QC_ALT_LOSS`) after a stall-recovery limit-cycle problem: https://github.com/PX4/PX4-Autopilot/pull/21598

**Operator complaints about quad-chute** (https://discuss.px4.io/t/quadchute-issues-improvements/17776)

- It triggers too late.
- After it triggers, RTL is the only option.
- The pusher is disabled even when it would help in wind.
- The return path is odd.

**Common failure:** transition timeout, because the aircraft tries to climb about 150 m while accelerating: https://discuss.px4.io/t/quad-chute-auto-trigger-due-to-transition-timeout/39245

### Auterion (APX4 / AMC)

- RTL loiters down to a safe altitude before back-transitioning.
- Operators can command transitions from the GUI.
- Planning shows the trajectory dynamically and includes VTOL checklist items.
- Operators mark safe and unsafe landing sectors. RTL picks the green sector best aligned into the estimated wind.
- The top bar shows remaining flight time with the RTL point.
- Sources:
  - https://auterion.com/higher-safety-and-more-efficiency-for-vtol-operations-with-the-new-auterion-software-releases/
  - https://docs.auterion.com/vehicle-operation/auterion-mission-control/ui-breakdown/fly/quick-actions-sidebar
  - https://docs.auterion.com/vehicle-operation/auterion-mission-control/ui-breakdown/fly

### DeltaQuad (PX4-based)

- The transition uses the heading the aircraft had on the ground, which allows upwind transitions.
- A transition can take about 300 m laterally and drifts in wind.
- Recommended takeoff altitude is at least 60 m.
- Landing: loiter down to 20–30 m, landing at least 250 m away.
- Source: https://docs.deltaquad.com/deltaquad-pro-operations-manual-v2/flight/planning-a-mission

### UAV Navigation (VECTOR / Visionair)

- Automatic transitions.
- Stall protection with engine-failure detection and glide.
- Stored alternate and emergency landing plans.
- Sources: https://www.uavnavigation.com/solutions/VTOL-Fixed-Wing-Autopilot · https://www.uavnavigation.com/company/partners/sky-power

### Incident lessons

- **Low-battery failsafe during a mission VTOL_LAND.** At 4 m it triggered RTL, the aircraft transitioned to fixed-wing and nearly hit power lines. The failsafe logic did not treat AUTO/VTOL_LAND as "landing". https://discuss.ardupilot.org/t/rtl-during-landing-on-quadplane-triggered-by-low-battery/43964
- **Failed transition on an under-powered pusher.** The lift motors never stopped, and a lift motor failed in a bank. https://discuss.ardupilot.org/t/failed-vtol-transition-analysis/143882
- **Battery sag early in the transition** is a recurring theme: https://discuss.ardupilot.org/t/quadplane-tips-and-hints/52208

---

## 2. ICE engine and hybrid monitoring

### MAVLink messages (checked against the XML)

- **EFI_STATUS (225)**
  - Fields: health, ecu_index, rpm, fuel_consumed (cm³), fuel_flow (cm³/min), engine_load, throttle_position, spark_dwell, baro, intake manifold pressure and temperature, **cylinder_head_temperature**, ignition timing, injection time, **exhaust_gas_temperature**, throttle_out, pt_compensation.
  - Extensions: ignition_voltage, fuel_pressure.
  - It carries only one CHT and one EGT, so multi-cylinder engines need the ArduPilot ECYL log or vendor data.
- **FUEL_STATUS (371, common)**
  - Fields: maximum, consumed and remaining fuel, percent remaining, flow rate, temperature, fuel type. Nominal rate 0.1 Hz.
  - Consumed and remaining must be *measured, not inferred*. If they are inferred from "full at boot", the UI should tell the user.
- **GENERATOR_STATUS (373)**
  - Fields: status flags, generator speed, battery current, load current, power generated, bus voltage, rectifier and generator temperature, runtime, **time_until_maintenance**.
  - Flags include OFF/READY/GENERATING/CHARGING/REDUCED_POWER/MAXPOWER, OVERTEMP_WARNING/FAULT, COOLING_WARNING, START_INHIBITED, WARMING_UP, IDLE and MAINTENANCE_REQUIRED.
- **EFI_PERFORMANCE (442, development.xml)** is new: WIP since 2026-06 and not for production use.
  - Fields: fuel-pump duty, voltage and current; ECU voltage and temperature; injector duty; commanded RPM; engine hobbs; error-memory count; torque.
  - Status flags: low fuel pressure, water in fuel, low oil pressure, rev limit, CHT above nominal, EGT above nominal, sensor faults, and more. Worth tracking.
- Sources: https://github.com/mavlink/mavlink/tree/master/message_definitions/v1.0 · https://mavlink.io/en/messages/common.html
- Snapshots: `common.xml`, `dev.xml`.

### ArduPilot engine support

- **Start, stop and restart**
  - Start and stop by RC switch or `DO_ENGINE_CONTROL`.
  - Automatic in-flight restart when RPM drops below `ICE_RPM_THRESH`, controlled by `ICE_STARTER_TIME`, `ICE_START_DELAY` and `ICE_STRT_MX_RTRY`.
  - Idle (`ICE_IDLE_RPM`) and redline (`ICE_REDLINE_RPM`) governors.
  - Source: https://ardupilot.org/plane/docs/common-ice.html
- **EFI drivers:** MegaSquirt, NWPMU, Lutan, DroneCAN, **Currawong/IntelliJect (PiccoloCAN)**, **Hirth**, MAVLink. Via Lua: DLA, HFE, **SkyPower SGC-352**, INF, Halo-6000. Source: https://ardupilot.org/plane/docs/common-efi.html
- **Hybrid behaviour in the Löweheiser generator driver** (`AP_Generator_Loweheiser.cpp`, snapshot included)
  - Coolant-temperature warm-up threshold before running, and a cool-down before idle or stop.
  - 1.5 s comms timeout.
  - EFI supply-voltage limits of 11–13.5 V.
  - Fuel level and fuel consumption.
  - Maintenance countdown, default 300 h.

### Engine OEM tools

- **Currawong ECU (CE367):** reads crank RPM, throttle position, manifold temperature, **CHT**, fuel pressure, MAP and baro. CAN plus RS232 telemetry and calibration, with native Piccolo integration. https://www.currawongeng.com/ecu/ · https://www.currawongeng.com/wp-content/uploads/2018/09/CE367.d01-Datasheet-ECU-Type-B.pdf
- **Sky Power:** ECU030 (2-stroke) and ECU080 (Wankel) talk CAN to VECTOR. Visionair "monitors the state of the propulsion system in real-time" and adjusts the mixture for pressure and temperature. https://www.uavnavigation.com/company/partners/sky-power
- **[UNCERTAIN]** No public screenshots or specs were found for OEM PC monitoring tools (Hirth, UAV Engines Ltd, Northwest UAV). They appear to be calibration and diagnostic utilities, not operator displays.
- **[UNCERTAIN]** No evidence that QGC has a dedicated EFI or engine panel. Mission Planner exposes EFI fields in its Status tab.

### Carburettor icing

Source: UK CAA SafetySense 14, https://www.caa.co.uk/media/j5omfigm/ssl-14_piston-engine-icing.pdf

- Highest risk at 0–10 °C and high humidity, but icing has been seen above 25 °C at 30% RH.
- The first sign is a slight RPM drop at fixed pitch, followed by rough running and vibration. An abnormal EGT change can come before the power loss.
- This can be detected automatically from EFI and OAT data.

---

## 3. Long-endurance operations and human factors

### Fatigue (FAA CAMI review)

Source: https://www.faa.gov/sites/faa.gov/files/data_research/research/med_humanfacs/oamtechreports/202121.pdf

- More than 60% of USAF RPA pilots and 37% of sensor operators reported very high or extreme fatigue after missions.
- Cognitive decline appeared about 6 h into a 12 h shift.
- Sleep quality mattered more than quantity, and rapid shift rotation was worse.
- About 70% reported benefit from blue light at the workstation.
- Original MQ-1 shift-work surveys: https://apps.dtic.mil/sti/tr/pdf/ADA477976.pdf

### Vigilance

Source: https://sciences.ucf.edu/psychology/perl/wp-content/uploads/sites/29/2019/08/Wohleber-et-al.-Vigilance-and-Automation.pdf

- In a multi-UAS simulation, performance declined after about 45 min, and task engagement dropped sharply over 2 h.
- Operators over-relied on automation early and under-relied on it late, consistent with dropping tasks under fatigue.

### NASA control-station guidelines (Hobbs)

Source: https://ntrs.nasa.gov/api/citations/20160014467/downloads/20160014467.pdf

- **Handover**
  - "Make before break" vs "break before make". The FAA prohibits break-before-make in civil airspace.
  - Example: power was at idle on one station and 80% on the other, and the engine over-revved at handover.
- **Lost link:** keep the lost-link procedure current (updated about every 10 min) and show a countdown timer.
- **Alarms:** one tone with many meanings is a problem. Prioritize alarms.
- **Controls:** an engine-shutdown switch next to the gear button was pressed by mistake. Guard critical controls.
- **Boredom and monotony** were attributed partly to control-station design. Suggestions: standing work positions and locomotive-style vigilance devices.
- **Unclear command authority:** "many people run to the GCS" when something goes wrong.

### CBP Predator B, Nogales 2006 (the key engine, alerting and handover lesson)

**What happened**

- The PPO-1 console locked up, and the pilot switched to PPO-2 without the checklist.
- On PPO-2 the condition lever was in the fuel-cutoff position, so **the engine shut down**. On one console that lever controlled the camera iris; on the other it controlled the fuel valve.
- On battery power the aircraft then lost its transponder and SATCOM, and it crashed.
- There were **no aural alarms**, and the lockups showed no fault message. There had been 9 lockups in the previous 3 months. Fatigue from 14 h operations was a possible factor.

**NTSB recommendations**

- A-07-70: prevent inadvertent engine shutdown.
- **A-07-71: "adequate visual and aural indications of safety-critical faults, such as engine-out conditions and console lockups… in order of priority".**
- A-07-72/73: lost-link profiles with safe crash zones, and training on the expected lost-link path.
- A-07-74/75: keep the transponder and essential electrical power available after engine loss.
- A-07-76: allow engine restart without line of sight.

**Sources:** https://www.ntsb.gov/safety/safety-recs/recletters/A07_70_86.pdf · https://flightsafety.org/asw/dec07/asw_dec07_p42-46.pdf · https://www.theregister.com/2007/10/18/human_pilots_cause_flying_robot_predator_crash/

### LRE/MCE split (MQ-9)

- A forward Launch and Recovery Element (LRE) flies takeoff and landing over line of sight.
- It hands control to a remote Mission Control Element (MCE) over SATCOM, which hands it back before landing.
- Satellite Launch and Recovery, with automatic takeoff and landing, removes the forward element.
- For Phantom, this is the same pattern as a field crew doing VTOL takeoff and landing while a remote center flies the cruise.
- Source: https://www.dvidshub.net/news/443786/slr-creating-new-legacy

### Structured shift handover (process-control analogue)

- A checklist-integrated logbook improved log quality by 18.6% and the incoming shift's situation accuracy by 9%.
- It reduced supervisor consultation by 8%, and took 16% more time.
- Source: https://process.honeywell.com/content/dam/process/en/documents/document-lists/doc_asm-consortium/white-papers/June%2011%202011%20-%20Structure%20Approach%20to%20Shift%20Handover%20Improves%20Situation%20Awareness%20White%20Paper.pdf

### Existing audio callouts

- Mission Planner has event speech (waypoint, mode, battery) and an interval callout with templates such as {alt}, {batv} and {timeinair}. The interval is hard-wired at 30 s per a forum post **[UNCERTAIN whether still true]**: https://discuss.ardupilot.org/t/speech-entries/6805
- Spoken battery false alarms came from single dropped telemetry readings that defaulted to 0 V. Users asked for debouncing: https://github.com/ArduPilot/MissionPlanner/issues/47
- An ArduPilot proposal for an "announce" flag on STATUSTEXT drew the worry: "Do we really need more sound… Will this clash with actual important warnings?" https://github.com/ArduPilot/ardupilot/issues/22724

---

## 4. Alerting when the pilot is not at the console

### UAV ecosystem

- One-to-many remote operations exist:
  - Percepto has an FAA approval for 1 operator to 30 drone-in-a-box systems: https://interestingengineering.com/transportation/faa-green-lights-percepto-to-manage-30-drone-remote-fleet-control
  - Skydio has docked remote ops: https://www.skydio.com/blog/BVLOS-for-remote-drone-operations
  - FlytBase has fleet dashboards and alert-triggered flows: https://docs.flytbase.com/flinks-and-flows/flows
- **No mainstream open-source or commercial GCS was found with documented push-to-phone or smartwatch escalation of flight alarms [UNCERTAIN].** This looks like a real gap.

### Maritime: IMO Bridge Alert Management (MSC.302(87))

- **Four priorities**
  - Emergency alarm: red, standard emergency signals.
  - Alarm: red, 3 short signals every 7–10 s.
  - Warning: orange, 2 short signals repeating every 15 s to 5 min.
  - Caution: yellow, no sound.
- **States:** active-unacknowledged, active-silenced, active-acknowledged, rectified-unacknowledged, responsibility-transferred.
- **Behaviour**
  - Temporary silence lasts 30 s, but new alerts still sound.
  - A warning escalates to an alarm when the danger becomes immediate.
  - A central alert-management list supports aggregation and grouping.
  - Some alerts can only be acknowledged at their source display, where the context is.
- **Sources:** https://assets.iec.ch/public/tc80/Supporting%20Document%20Bridge%20Alert%20Management%20for%20mariners%20V4.pdf · https://wwwcdn.imo.org/localresources/en/KnowledgeCentre/IndexofIMOResolutions/MSCResolutions/MSC.302(87).pdf

### Process control (ISA-18.2 / EEMUA 191)

- A flood is more than 10 alarms per 10 min per operator. The target is less than 1% of time in flood.
- Tools: rationalization, shelving, state-based suppression, first-out display.
- Source: https://tipsweb.com/taming-alarm-floods/

### Hospital ICU alarm fatigue

- Joint Commission Sentinel Event Alert in 2013. Clinical alarm safety became a National Patient Safety Goal in 2014.
- The FDA recorded 566 alarm-related deaths in 2005–2008.
- **[UNCERTAIN]** The figure that 72–99% of alarms are non-actionable comes from the literature but was not verified here.
- Source: https://en.wikipedia.org/wiki/Alarm_fatigue

---

## 5. Regulation and certification of the GCS HMI

### EASA / JARUS SORA 2.5, Annex E

Source: http://jarus-rpas.org/wp-content/uploads/2024/06/SORA-v2.5-Annex-E-Release.JAR_doc_28pdf.pdf

- **OSO #20:** "information and control interfaces are clearly and succinctly presented and do not confuse, cause unreasonable fatigue, or contribute to remote crew error."
  - At Medium robustness (SAIL IV–V) the evaluation must cover workload in normal and emergency situations, the efficiency of emergency procedures, and **alarm prioritization**.
  - Evidence: inspection or analysis at Low; **demonstrations or simulations** at Medium; third-party witnessed at High.
- OSO #18: automatic envelope protection against single pilot inputs.
- OSO #19: recovery from human error.
- OSO #17: crew fitness. Duty and rest are defined at Medium; a Fatigue Risk Management System (FRMS) is required at High.
- OSO #16: multi-crew coordination and CRM.

### EASA SC Light-UAS

Source: https://www.easa.europa.eu/sites/default/files/dfu/special_condition_light_uas.pdf

The Command Unit is explicitly in scope:

- .2602(b): adequate work environment and HMI, without excessive fatigue.
- .2605(c): warnings, cautions and normal indications.
- .2605(d): unsafe-condition information reaches "in a timely manner to the crew member responsible for taking corrective action".
- .2615: powerplant parameters **and trends**, with limitations shown.

### ASTM F3002-22

- Covers C2 system design, C2 links, spectrum and fly-away for **sUAS ≤ 25 kg**, so it may not apply if Phantom's aircraft is heavier.
- Full text not seen; HMI content **[UNCERTAIN]**: https://store.astm.org/f3002-14a.html

### FAA

- The D&R type-certification path exists: https://www.faa.gov/uas/advanced_operations/certification/criteria_special_classes
- **No dedicated FAA advisory circular on UAS control-station HMI was found [UNCERTAIN].** NASA/Hobbs is the de facto reference.

### RTCA SC-228

Source: https://www.rtca.org/wp-content/uploads/2024/07/SC-228-TOR-Rev-18-Approved-2024-06-27.pdf

- DO-362: C2 terrestrial data link MOPS, 2016. DO-362B in work.
- DO-377 / 377A / **377B**: C2 link system MASPS, 2023.
- **DO-400:** lost C2 link procedures guidance, 2023.

### NATO STANAG 4586 / AEP-84

- Five Levels of Interoperability (LOI): LOI 3 is payload control, LOI 4 is aircraft control without launch and recovery, LOI 5 includes launch and recovery.
- It "does not impose any design requirements on human factors."
- Source: https://publications.sto.nato.int/publications/STO%20Educational%20Notes/STO-EN-SCI-271/EN-SCI-271-03.pdf
- **[UNCERTAIN]** Ed. 4 is published as AEP-84.

### MIL-STD-1472H

- Has section 5.12.4, "Unmanned vehicles (UxV)". Only the table of contents was seen; the text was not verified.
- Also has audio-warning sections.
- Source: https://dn790000.ca.archive.org/0/items/mil-std-1472-g-chg-1/MIL-STD-1472H.pdf

### DO-178C vs DO-278A

- DO-178C is commonly applied for SAIL IV–VI software: https://www.rapitasystems.com/certifying-uas
- EASA treats the Command Unit as part of the UAS, so safety-relevant GCS functions are likely assessed like airborne software (DO-178C/ED-12C style), not under DO-278A, which is for CNS/ATM ground systems. **[UNCERTAIN; interpretation, confirm with the authority.]**
- Practical consequence: keep command issuing, alerting and engine control in a small, separately assured core, apart from the convenience UI.

---

## 6. UX requirements and ideas for VTOL + ICE + long endurance

1. **VTOL phase strip.** Always shown: MC → transition-to-FW → FW → airbrake/approach → back-transition → descend/final. Built from MAV_VTOL_STATE plus parsed QPOS stages. Include a live transition timer counting down against `Q_TRANS_FAIL` / `VT_TRANS_TIMEOUT`, and say what happens when it expires.
2. **Annotated airspeed tape.** Mark stall, `Q_ASSIST_SPEED`, transition speed, best-endurance speed and max. Flag disagreement between the airspeed sensor and GPS-plus-wind.
3. **Lift-assist annunciator.** Latch a caution whenever the lift motors run in FW flight. Infer it from motor outputs, because ArduPilot's speed assist is silent. Show the lift-battery energy cost.
4. **Lift-battery landing reserve.** Show the energy left after back-transition, hover and one go-around, corrected for cold soak.
5. **Bingo and joker fuel.** Wind-corrected fuel to home and to each alternate plus reserve, from smoothed burn. Show "Bingo in hh:mm" and time to dry tanks.
6. **Measured vs inferred fuel.** Tag fuel values as measured or inferred. Add a pre-flight "tank filled to __ L" confirmation.
7. **Trend-centric engine page.** RPM, CHT, EGT, MAT, MAP, fuel pressure, ignition voltage, and commanded vs actual throttle. Show OEM limit bands and 30 min / 2 h / flight trends, compared against the aircraft's own baseline.
8. **Trend-based engine advisories.** CHT rate of rise, EGT spread, RPM droop at constant throttle, fuel-pressure decay.
9. **Induction-icing advisory.** Combine OAT and dewpoint with the RPM/MAP/EGT signature, and prompt for carb heat.
10. **Engine-out workflow.**
    - Latched red master alarm with the voice call "ENGINE FAILURE" (NTSB A-07-71).
    - Restart attempts shown against `ICE_STRT_MX_RTRY`.
    - Landing sites reachable on glide and on battery only.
    - A guarded restart control.
11. **No false alarms for planned engine stops.** Suppress the engine alarm for a commanded stop or `Q_LAND_ICE_CUT`, and the low-airspeed alarm in hover (ISA-18.2 state-based alarming).
12. **Guarded engine controls.** Two-step guard on kill and fuel cutoff. A control must never change function between contexts.
13. **Hybrid/generator panel.** GENERATOR_STATUS flags, bus voltage, charge current, warm-up interlocks, maintenance countdown.
14. **Make-before-break station handover.**
    - Control-authority token.
    - Automatic diff of throttle and engine state, mode, failsafe parameters, mission index and lost-link plan, acknowledged by both stations.
    - Also covers the field VTOL crew ↔ remote cruise crew handover.
15. **Shift-handover wizard.**
    - Checklist logbook: fuel and bingo, engine trends, active and shelved alerts, ATC, weather, next events, lost-link plan.
    - The incoming pilot acknowledges each item.
    - The summary is auto-drafted from the timeline.
16. **Mission timeline with countdowns:** next waypoint, fuel check, ATC call, bingo, airspace window, sunset, crew change, predicted landing, and landing-site wind forecast against hover limits.
17. **Always-visible lost-link panel.** Current action, timer and predicted path, with a review prompt about every 10 min (Hobbs; DO-400).
18. **Failsafe preview.** "What each failsafe would do right now."
19. **BAM-style alert model.**
    - Four priorities and five states.
    - Escalation of unacknowledged warnings.
    - Sound only for alarms and warnings.
    - Aggregation, first-out display, debouncing of telemetry dropouts.
    - Routing to the responsible role (Light-UAS .2605(d)).
20. **Alarm-flood metrics.** Alarms per 10 min per operator, measured against ISA-18.2, for alarm rationalization and SORA evidence.
21. **Remote escalation.** If an alarm goes unacknowledged at the console for N seconds, push it to the on-shift pilot's phone or watch, then to the backup, then to the mission commander. Track delivery and acknowledgement.
22. **Vigilance support.** Configurable periodic spoken status, optional "operator present" check-ins, and a "since you last looked" digest.
23. **Role-based workspaces.** AVO, payload operator, mission commander and observer, with an unambiguous "who has control" indicator.
24. **Fatigue and duty features.** Self-declared fitness, duty-time tracker (OSO #17), a night-shift dark theme, and support for standing work positions.
25. **HMI-evaluation evidence from day one.** A SITL scenario harness covering transition failure, engine-out, icing, lost link and handover, to produce the OSO #20 evidence and the alarm-prioritization analysis.
