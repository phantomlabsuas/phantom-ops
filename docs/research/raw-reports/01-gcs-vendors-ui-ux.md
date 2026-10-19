# Raw research report 1: GCS / C2 vendors, UI/UX benchmark

Research subagent output from the session on 2026-10-02, kept close to verbatim.
The synthesized version is in `../gcs-ux-benchmark-research.md`.
**Coverage:** about 45 web searches and fetches. Public UI detail is uneven:
- Commercial and open-source vendors (Auterion, UAV Navigation, QGroundControl) publish manuals.
- Defense primes (Shield AI, Textron, Edge Autonomy, AeroVironment JUMP 20, Baykar, IAI, Elbit) publish almost nothing about their GCS screens.

---

## 1. Auterion: Auterion Mission Control (AMC), Skynode, Nemyx

**Platforms**
- PX4/AuterionOS aircraft on Skynode.
- Documented VTOL customer: DeltaQuad Evo, which ships AMC on a Panasonic Toughbook.
- Auterion claims "multi-manufacturer" swarms.

**UI/UX highlights**
- Two main views, **Fly** and **Plan**, plus Vehicle Setup, Photos, User Account and Settings.
- **Normal vs Advanced mode** (progressive disclosure). Normal mode shows an orange menu icon. Advanced mode (black icon) adds an Analyze tab and expert parameters such as "VTOL Transition distance".
- Touch-first. Runs on Windows, Android and macOS. AMC 1.38 dropped support for Android versions below 10.
- **Top bar:** active vehicle, flight mode, armed state, and indicators for pairing, link, GPS, battery and RC. It shows **remaining flight time** and draws the **RTL point**, where the aircraft will auto-RTL if the battery failsafe fires.
- **Telemetry panel** (bottom right): speed, altitude, direction of travel, flight time, distance, and "time to get back to the ground station".
- **Video/map switcher** swaps which one is full-screen. Camera controls appear only when video is full-screen.
- **Quick-actions sidebar:** Takeoff, Start Mission and RTL.
- **Safety interactions:**
  - **Hold-to-confirm** on risky actions.
  - Emergency motor kill.
  - VTOL manual modes limited to the "two safest" (Altitude and Position).
- **Plan view:** terrain visualization, survey/corridor/structure templates, geofence, rally points, **VTOL flight-path prediction**, and automatic preflight and terrain-collision checks.
- **AMC 1.38.x additions:**
  - Pre-flight checklists grouped by category.
  - **Dual Link UI** (primary or backup radio, with automatic switchover).
  - Multi-vehicle indicators whose **state colors** show readiness without opening the vehicle, plus a multi-line layout for small tablets.
  - **Flickering chevron** when position data stops arriving (stale-data cue).
  - Redesigned telemetry around the compass.
  - In-app popups instead of OS notifications.
  - Low-visibility (fog) tracking mode for fixed-wing.
  - Keyboard and joystick bindings.
- **Nemyx** (Sept 2025): AuterionOS app for AI-coordinated swarms across manufacturers ("one operator", "from a rucksack or a truckload").

**Alerting**
- Important vehicle messages appear in a "highly visible popup" with the cause and a recommended action.
- Less important messages go to a log under the vehicle icon.
- No published caution/warning/advisory color tiers were found.

**Strengths:** consumer-grade polish, touch-first, good small-team UX, strong safety-confirmation pattern, "what happens if" display (RTL point, time-to-home).

**Weaknesses for Phantom:**
- Battery/electric-centric; no evidence of ICE engine pages (RPM, CHT, fuel).
- Shallow alert hierarchy.
- Aimed at short-to-medium missions.

**Sources**
- https://auterion.com/product/mission-control/
- https://docs.auterion.com/vehicle-operation/auterion-mission-control/ui-breakdown/fly
- https://docs.auterion.com/vehicle-operation/auterion-mission-control/ui-breakdown/fly/monitoring-the-flight
- https://docs.auterion.com/release-notes/auterion-mission-control-release-notes/amc-1.38/amc-1.38.16
- https://docs.deltaquad.com/evo/flight/ground-control-station-overview
- https://docs.deltaquad.com/gov/setup/ground-control-station-gcs/deltaquad-toughbook
- https://thedefensepost.com/2025/09/05/auterion-nemyx-drone-swarm/

## 2. UAV Navigation (Grupo Oesía): Visionair GCS

**Platforms**
- VECTOR and POLAR autopilots on fixed-wing, helicopter, multirotor, VTOL and target drones.
- Public reference: Primoco UAV uses the On-Screen Display (OSD) and is pursuing STANAG 4703.
- Claims "Tier 1" manufacturers but names few. Widely used on ICE tactical platforms, though most customers are unnamed.

**UI/UX highlights**
- Windows 10 PC or laptop with keyboard and mouse. Not touch-first.
- Fully customizable "mission-oriented" layout with a **Layout tool** and **floating windows**.
- Customizable **PFD**.
- **Visionair Gauges:** any telemetry variable or computed expression can become a gauge (fuel, RPM and battery are the examples given).
- **Visionair Charts:** live plots of any parameter.
- **Advanced Link Quality Panel**, built from per-packet statistics.
- Map dark mode, rulers, POI editor and 3D geocaging.
- 3D synthetic view via FlightGear, plus Google Earth export.
- **Predictive paths**, wind estimator and ETA in the Flight Plan Editor (v4.36).
- **Flight plans:**
  - Up to 400 waypoints and several plans at once.
  - **Alternative landing sites**.
  - Auto-Grid generator.
  - Conditional events on waypoints.
  - **In-flight edits**.
- Flight modes: Auto, Manual, Nav-To, Hover-To, Loiter, Hover, Safe/Return-to-Base.
- ADS-B traffic display and ACAS I sense-and-avoid.
- Multi-UAV control from one GCS, and **multi-GCS control of one UAV** (supports handover).
- **Visionair Analytics** for post-flight review; replay shows the exact operator view.
- "Single Mission File" saves the full GCS configuration. SDK available for customization.
- **OSD (Oct 2024):** PFD data overlaid on IP video for NATO CAT I/II operators, for landing and distance estimation.

**Alerting (best-documented of all vendors)**
- **Four tiers: High, Medium, Low, Diagnostic.**
  - High and Medium appear in the main **Alarm Panel**.
  - Low and Diagnostic go "discretely" to the **Notification Monitor Panel**.
- A reactivated alarm **flashes again**.
- Alarms are configured in **XML**, with two defaults: standard, and full-with-diagnostics.
- 1 Hz reporting and an alarm log.
- **Autopilot behavior:**
  - Engine-failure detection, with stall protection and best glide.
  - Automatic emergency procedures and flight termination.
  - VTOL transitions handled automatically. No published detail on how the GCS shows a transition.

**Strengths:** engineering-grade depth, real alarm hierarchy, alternate landing sites, multi-GCS handover, replay. Closest match to an ICE tactical VTOL.

**Weaknesses:** dense desktop "configure everything" UI, steep learning curve, visual design dated next to Auterion or Quantum.

**Sources**
- https://www.uavnavigation.com/products/ground-control-station/visionair-ground-control-station-gcs-software
- https://www.uavnavigation.com/company/blog/state-art-gcs-display-advanced-alarm-panel-operators-quick-notification
- https://www.uavnavigation.com/company/news-and-events/visionair-v436-available-now
- https://www.uavnavigation.com/sites/default/files/docs/2024-04/UAV_Navigation_Visionair_Brochure.pdf
- https://www.uavnavigation.com/solutions/VTOL-Fixed-Wing-Autopilot
- https://www.unmannedsystemstechnology.com/2024/10/advanced-display-technology-enhances-uav-flight-control/

## 3. Shield AI: V-BAT / Hivemind (Pilot, Commander, EdgeOS)

**Platforms**
- MQ-35 V-BAT, a tail-sitter ducted-fan VTOL, flown by the US Navy, USCG, US Army and India.
- April 2025 block upgrade: **JP-5 heavy-fuel engine, 13 h+ endurance, SATCOM BLOS C2**, Hivemind Pilot autonomy.

**UI/UX:** almost nothing public about GCS screens. What is public:
- 2-person team.
- Unassisted launch and landing in 25 kt wind, including onto ships moving at 10 kt, in a 4.6 m × 4.6 m landing zone.
- **Hivemind Commander:** the "human-in/on-the-loop" layer for mission planning and C2. The aim is "flipping the paradigm" so a few operators command many aircraft.
- Demo: 3 V-BATs tasked against NAIs in a 10×10 km area, using area/intent tasking rather than waypoints.

**Lesson:** a tail-sitter's transition is fully automated, so the operator never manages it. The design philosophy is autonomy first, with the GCS as a tasking surface.

**Uncertain:** GCS hardware, layout and alerting design not found.

**Sources**
- https://shield.ai/shield-ai-unveils-v-bat-block-upgrade-powered-by-hivemind-advanced-autonomy-satcom-and-heavy-fuel-engine-among-new-features/
- https://shield.ai/v-bat/
- https://shield.ai/hivemind-for-operational-read-and-react-swarming/
- https://shield.ai/pilot/

## 4. Textron Systems: Universal Ground Control Station (UGCS) / Aerosonde Mk 4.7/4.8 HQ

**Platforms**
- UGCS is the US Army common GCS for Shadow, Hunter and Gray Eagle.
- Aerosonde is a heavy-fuel (JP-8) "Hybrid Quadrotor" VTOL.
  - FTUAS datasheet: 14 h, 205 lb MTOW, 30 lb payload, two-soldier portable, launch in under 30 min.
  - Family brochure: VTOL Mk 4.7 at 14.9 h; fixed-wing Mk 4.8 at 18.3 h.
  - Also flown as contractor ISR services, including on LCS.

**UGCS UI**
- Web-based interfaces, "easy-to-read displays", ergonomic crew stations, embedded training.
- Multi-aircraft control and STANAG 4586.
- Reprogrammable for new aircraft, payloads and data links (TCDL).
- Form factors: shelters (S-788, S-280, Conex) and shipboard.
- Classic separate AVO and payload-operator crew.

**Uncertain:** no public description of the Aerosonde field GCS software or its engine and hybrid displays. FTUAS reporting only mentions MOSA and a "third-party surrogate mission computer".

**Takeaway:** the closest peer to Phantom's mission (hybrid quad plus heavy-fuel engine, 14 h+), but its UX is opaque. Treat it as a mission/CONOPS benchmark rather than a UI one.

**Sources**
- https://www.textronsystems.com/products/universal-ground-control-station
- https://www.textronsystems.com/sites/default/files/_documents/Aerosonde%20FTUAS%20Datasheet_Digital.pdf
- https://www.textronsystems.com/sites/default/files/_documents/Aerosonde%20UAS%20Family%20Brochure.pdf
- https://www.armyrecognition.com/news/aerospace-news/2024/us-armys-ftuas-program-tests-drone-system-interoperability-with-textron-aerosonde-4-8-hq-and-griffon-aerospace-valiant-uavs

## 5. Lockheed Martin CDL Systems: VCS-4586 / VCSi

**Platforms**
- VCS-4586 is the basis of the Army OSGCS (Shadow, Hunter, Gray Eagle), with 1.2M+ flight hours.
- Other users: USMC, Canadian Forces, UK MoD, Fire Shadow, and Indago via the tablet mGCS.
- VCSi is the modular successor, claiming 1.5M flight hours. Aurora Flight Sciences became a VCSi customer in 2018 after about 10 years on VCS-4586.
- VCSi is Canadian-developed and ITAR-free.

**UI/UX highlights**
- **User Layouts** per crew role, across one or more monitors, with dockable panels.
- **"T-Scan"** aviation-style heading, roll, speed and altitude display.
- Map-centric, showing ETE, distance-to-waypoint and climb rate. Fly-by-mouse.
- **Notification Center:** one place for all alarms.
- **Customizable Notifications** with *interactive controls for emergency procedures*, so the operator can act from inside the alert.
- **Automated Look Ahead:** warns in advance of terrain or airspace violations.
- Restriction zones (keep-in and keep-out).
- **Line-of-Sight Visibility:** radio coverage drawn on the map.
- **Contingency routes for lost link.**
- Multi-vehicle control of *dissimilar* vehicles in a 3D map (Panterra engine), with network-centric handoff.
- MIL-STD-2525B symbology. mGCS on touch tablets with gaming joysticks.

**Strengths:** the most mature crew-role and interoperability model; strong predictive alerting (Look Ahead plus LOS coverage).

**Weaknesses:** dated 2010s visual style; heavy STANAG 4586 abstraction.

**Sources**
- https://lockheedmartin.com/content/dam/lockheed-martin/rms/photo/cdl/VCSi_Capabilities-Guide.pdf
- https://lockheedmartin.com/content/dam/lockheed-martin/rms/photo/cdl/VCSi_ProductCard.pdf
- https://www.lockheedmartin.com/content/dam/lockheed-martin/rms/documents/cdl/CDL-Systems-brochure.pdf
- https://www.army-technology.com/news/aurora-buys-lockheed-martins-vcsi-vehicle-control-software/
- https://www.unmannedsystemstechnology.com/2018/02/lockheed-martin-launches-new-multi-uav-control-software/

## 6. Insitu (Boeing): INEXA Control (formerly ICOMC2) and cGCS

**Platforms:** ScanEagle, ScanEagle3, Integrator and RQ-21A Blackjack. These are long-endurance ICE aircraft, mostly catapult-launched with SkyHook recovery. INEXA claims 820k+ flight hours.

**UI/UX highlights**
- **Multi-aircraft control from one workstation.**
- Runs on laptops or soldier-worn devices. The **cGCS** is a "1-person carry" kit that scales from one laptop to a multi-computer suite, with "single operator for multiple aircraft".
- **AVOS (Augmented Video Overlay System):** 3D terrain, sensor footprint, targets, borders and airspace drawn over the video.
- "Hands-off" payload automation: auto-tracking and search patterns.
- Control transfer between GCSs.
- Plug-ins: Search, **RF Link Analysis**, Airspace Management, CoT.
- **Platform Kits vs Mission Kits:** vehicle-specific modules separated from vehicle-agnostic ones. A strong architecture pattern for Phantom.
- Standards: STANAG 4586 Ed2, 4609 video, CoT, eCRD, JAUS.
- Feb 2026: AI radar and hyperspectral payloads integrated, "reducing operator workload".

**Uncertain:** no public engine-page or alert-tier details.

**Sources**
- https://www.insitu.com/products/inexa
- https://www.insitu.com/products/cgcs
- https://insitu.com/information-delivery/inexa-solutions/inexa-control
- https://www.insitu.com/news/insitu-to-showcase-enhanced-electronic-resilience-at-wds

## 7. Quantum Systems: QBase 3D, QBase Tactical, MOSAIC UXS

**Platforms**
- Trinity Pro and Trinity Tactical (mapping); Vector, Vector AI and Twister (ISR).
- All electric VTOL. Vector AI (March 2025): dual Jetson Orin, 3 h+.
- Heavy use in Ukraine and by the Dutch MoD.

**UI/UX highlights**
- **QBase Tactical** runs on a 14" Panasonic Toughbook (1920×1080) or the **Skynav Ground Controller** (7" 1280×800 tablet with integrated controls).
- **"QuickStart" missions without prior planning**, for time-critical launches.
- **Planner:**
  - Auto-generates safe paths and follows terrain.
  - Uses a **wind forecast** and **simulates** the mission, with energy and flight-time estimates.
- **Map cues:** wind direction, and the **aircraft's shadow on the ground** as a simple height and position cue.
- Physical joysticks or on-screen clicks.
- Auto target tracking and guidance with a set stand-off.
- POIs can be annotated in the mission log during flight. In-flight log replay.
- QBase 3D splits large mapping areas into battery-sized segments and prompts for "seamless continuity".
- **MOSAIC UXS** (June 2025):
  - "Single operator interface", with "no limitation" on the number of systems.
  - From 1:1 manual control to **intent-based multi-UxS**, with mandatory human override.
  - Autopilots: PX4, ArduPilot, proprietary. Protocols: MAVLink and non-MAVLink.
  - Links: Silvus, DTC, Doodle, SATCOM, 4G/5G.
  - Integrations: ATAK, SitaWare, Palantir Maven.
  - Multi-user, with core-to-core sync.

**Strengths:** best "minimal-training" field UX; fast launch.

**Weaknesses:** electric only, so no engine UX. Short missions, so long-duration fatigue and handover are not addressed.

**Sources**
- https://quantum-systems.com/us/qbase-tactical/
- https://quantum-systems.id/qbase-tactical/
- https://quantum-systems.com/us/news/trinity-pro-and-qbase-3d-updates-enhanced-integration-and-advanced-features/
- https://quantum-systems.com/wp-content/uploads/2026/04/QS_Mosaic_Techsheet_EN.pdf
- https://quantum-systems.com/blog/2025/06/03/quantum-systems-launches-mosaic-uxs/
- https://quantum-systems.com/news/quantum-systems-unveils-vector-ai/

## 8. Others

### AeroVironment Crysalis (July 2021)
- One UX across phone, tablet and laptop, on Windows and Android.
- Form factors:
  - RVT: wearable, receive-only video.
  - Ultralight GCS: phone plus joystick.
  - Tactical GCS: hot-swap batteries, 5–20 km.
  - Command GCS: rugged Panasonic 2-in-1 plus a tactile-joystick controller.
- Step-by-step **"Wizard"** for planning, preflight and diagnostics.
- Several operators can connect to one aircraft and share video without talking to each other.
- Aircraft: Puma, Raven, Wasp.
- **JUMP 20:** 190cc avgas 4-stroke VTOL, 24 h+ per the Wikipedia specs. Its GCS software is not publicly documented; whether it uses Crysalis is uncertain.
- Sources:
  - https://insideunmannedsystems.com/crysalis-offers-ground-control-simplicity-interoperability-to-frontline-combatants/
  - https://www.avinc.com/images/uploads/product_docs/Crysalis_CommandGCS_Datasheet_07072021.pdf
  - https://en.wikipedia.org/wiki/AeroVironment_T-20

### Edge Autonomy
- Penguin B VTOL: EFI engine with onboard generator, 8 h+.
- Penguin C VTOL: "up to 25 h" per Breaking Defense.
- VXE30 Stalker: solid-oxide fuel cell; 8 h base, about double in the "Havoc" configuration.
- No public GCS UI. Stalker is ex-Lockheed, so a VCS-derived GCS is likely but unconfirmed.
- Sources:
  - https://www.unmannedsystemstechnology.com/2021/06/penguin-b-long-endurance-vtol-drone-released/
  - https://breakingdefense.com/2024/11/the-right-drone-for-special-forces-isr-mobile-long-range-long-endurance-and-a-vtol/

### Anduril Lattice for Mission Autonomy (May 2023)
- One operator for potentially "hundreds" of systems.
- A "quarterback" function turns operator intent into discrete tasks.
- Preflight: patrol boundaries, prebuilt behaviors and formations, and permission required before engagement.
- In flight: **voice using brevity codes** (STT/TTS) and explicit "Authorization requested" prompts.
- Screen layouts are not public.
- Sources:
  - https://www.airandspaceforces.com/sneak-peek-anduril-lifts-veil-combat-drone-software/
  - https://breakingdefense.com/2023/05/andurils-new-tech-could-allow-single-operator-to-control-hundreds-of-autonomous-systems/

### Schiebel Camcopter S-100 (10 h)
- Split crew: **one laptop for the aircraft (one or several) and one for payloads**, or rugged multi-screen consoles.
- PFD shows position, mission and **diagnostic status**. STANAG 4586.
- "The CUBE" hub simplifies cabling.
- Source: https://schiebel.net/camcopter-s-100/

### Elbit (Torch-X), IAI, Baykar
- Nothing useful public. The Elbit page returned 403.
- Baykar only publishes photos of two-seat pilot and payload cockpit shelters.

## 9. Commercial / open source

### QGroundControl v5
- Toolbar Flight Status indicator:
  - **Green "Ready To Fly"**, **yellow "Ready To Fly" with warnings**.
  - Not Ready, Armed, Flying, Landing, Communication Lost.
- Clicking it opens the arming-check list. Each item expands into "additional information and possible solutions" and disappears when fixed (excellent explain-and-fix UX).
- Vehicle Messages indicator turns red for critical messages.
- VTOL transition indicator and multi-vehicle selection.
- **Weaknesses:** no engine page, weak alarm hierarchy, generic look.
- Source: https://docs.qgroundcontrol.com/Stable_V5.0/en/qgc-user-guide/fly_view/fly_view_toolbar.html

### Mission Planner (ArduPilot)
- Strongest ICE and QuadPlane parameter depth:
  - ICE start/stop (DO_ENGINE_CONTROL), RPM, **idle and redline governors** with GCS warnings.
  - EFI telemetry, fuel sensors, generators.
  - Q_LAND_ICE_CUT: engine stop during the final stage of a VTOL landing.
- Engine values only show through the generic "Display This" quick panel; forum users ask for better EFI display. Cluttered and engineer-oriented.
- Sources:
  - https://ardupilot.org/plane/docs/common-ice.html
  - https://discuss.ardupilot.org/t/add-electronic-fuel-injection-channel-to-display-this-window/68042

### UgCS (SPH Engineering)
- Best-in-class 3D planning: elevation profiles, "Smart AGL" terrain following with custom DEM/DSM, offline operation, automatic battery-resume segmentation, 100+ platforms.
- Survey-focused; weak in-flight health and alarm UX.
- Source: https://www.sphengineering.com/flight-planning/ugcs

### Embention Veronte Ops (common on ICE VTOLs)
- Fully customizable widget workspace.
- Cannot span several monitors; running multiple instances is the workaround.
- Source: https://manuals.embention.com/veronte-ops/en/latest/panels/workspace/index.html

## 10. NASA RPAS human-factors guidelines

- **Lost link:**
  - Total C2 link loss gets a "clear and distinct aural and visual" alert with a **unique sound** used for nothing else.
  - Payload-link loss must be distinct from control-link loss.
  - Show the **datalink footprint on the map** and link latency in ms.
- The pilot can monitor **consumables** and **GCS health**.
- **Handover:**
  - Confirm parameters are identical before and after.
  - The receiving pilot sees telemetry before taking control.
  - The receiving pilot gets explicit confirmation that control is established.
- The pilot must not be able to disengage automation if that would cause departure from controlled flight.
- Source: https://ntrs.nasa.gov/api/citations/20190000211/downloads/20190000211.pdf

**Field critique of Toughbook GCS hardware:** rubber keys, sunlight glare, touch targets so close that accidental selections happen; pilots did better with a joystick than a mouse.
- Source: https://philwickline7.blogspot.com/2018/06/universal-ground-controlstation-uav.html

---

## Cross-vendor patterns

1. **Map is primary; video is a swap or overlay.**
   - AMC uses a full-screen swap, INEXA the AVOS overlay, UAV Navigation the OSD.
   - Military systems split payload and air-vehicle operators (S-100, UGCS). Small-UAS vendors merge the roles.
2. **Glanceable top-bar health with drill-down.** QGC uses green/yellow/red readiness and AMC uses per-vehicle state colors, both with click-through to cause and fix.
3. **Tiered alerts are the exception.**
   - Only UAV Navigation (High/Medium/Low/Diagnostic, re-flash, XML) and VCSi (Notification Center with emergency-procedure controls) publish a real hierarchy.
   - Nobody publicly documents aviation-style W/C/A with distinct aural tones. **This is a gap Phantom could own.**
4. **Predictive "what happens next" displays:**
   - AMC: RTL point, time-to-home, remaining time, VTOL path prediction.
   - VCSi: Look Ahead and LOS coverage.
   - Visionair: predictive paths and wind estimator.
   - QBase: mission simulation and wind forecast.
5. **Engine and hybrid monitoring is badly served.**
   - ArduPilot has the plumbing (EFI, generator, governors). Visionair has generic gauges.
   - No vendor publishes a dedicated ICE/hybrid page with endurance prediction from fuel flow plus generator and battery state.
6. **Safety interaction patterns:**
   - Hold-to-confirm (AMC).
   - Mode restriction for VTOLs (AMC).
   - Fully automatic transitions (V-BAT, UAV Navigation).
   - Alternate landing sites and lost-link contingency routes (Visionair, VCSi).
7. **Multi-vehicle and handover:**
   - Multi-GCS control of one aircraft: Visionair, INEXA, VCSi.
   - Many aircraft per operator: INEXA, MOSAIC, Nemyx, Lattice.
   - Intent or area tasking replacing waypoints: Hivemind, Lattice, MOSAIC.
8. **Form factor:** one codebase across rugged laptop (Toughbook is almost universal), 7–10" handheld and command post (Crysalis, AMC, QBase).
9. **Interoperability is table stakes:** STANAG 4586/4609, CoT/ATAK and MISB KLV on the defense side.

## Top vendors to benchmark

1. **UAV Navigation Visionair.** Closest functional match. Copy its depth and alarm hierarchy, but modernize the visuals.
2. **Auterion AMC.** Best modern touch UX. Copy the interaction polish.
3. **Lockheed VCSi.** Best crew-role and alerting architecture. Copy its long-shift concepts.
4. **Insitu INEXA / cGCS.** The long-endurance ICE operating model: Platform Kit vs Mission Kit, AVOS, RF link analysis.
5. **Quantum QBase Tactical / MOSAIC** (honorable mention). Minimal-training field workflow.

Shield AI, Textron Aerosonde and AV JUMP 20 are the closest *mission* peers (heavy-fuel VTOL, 13–24 h), but their GCS UX is not public. Benchmark their CONOPS, not their screens.
