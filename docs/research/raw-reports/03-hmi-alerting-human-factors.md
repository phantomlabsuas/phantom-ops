# Raw research report 3: Alerting and peripheral health awareness (human factors)

This is the research subagent's output from the 2026-10-02 session, kept close to verbatim. The synthesized version is in `../gcs-ux-benchmark-research.md`.

**How it was gathered:** about 55 searches and fetches.

**Sources that could not be read** (blocked: 403, 429 or robots.txt, or rate-limited):

- AFRL VSCS TR (ADA594380)
- DTIC Cummings reports
- ResearchGate and PubMed
- Yeh & Wickens 2001
- RAeS QF32 article
- MIT Predator B paper

Items marked **[UNVERIFIED]** come from memory or from weak secondary sources.

---

## 1. Crewed aviation alerting philosophy

### FAA 14 CFR 25.1322 and AC 25.1322-1

Sources: https://www.ecfr.gov/current/title-14/chapter-I/subchapter-C/part-25/subpart-F/subject-group-ECFR3043e8882f16d6e/section-25.1322 · https://www.faa.gov/documentLibrary/media/Advisory_Circular/AC_25.1322-1.pdf

**Alert levels**

- **Warning:** the crew must know immediately and respond immediately.
- **Caution:** the crew must know immediately; the response can come later.
- **Advisory:** the crew must be aware; a response may be needed later.
- **Time-critical warnings** (for example windshear, GPWS) rank above all others. Each needs its own voice or tone, plus a visual in each pilot's primary field of view.

**Colors**

- Red is for warnings only. Amber or yellow is for cautions.
- Advisories may be any color except red or green.
- The master visual alert matches the color of the alert that triggered it.
- Colors are used consistently on every display (§11.d).
- On a monochrome display, shape, size and position tell the levels apart (§11.e).

**Master alerts**

- In the primary field of view, and on until the crew cancels them or the condition clears.
- One unique tone for master warning and one for master caution.
- Only one aural alert at a time.
- The crew can always tell which alert is the most recent and which is the most urgent.

**Inhibits (§8.d)**

- Suppress alerts that are wrong or unnecessary for the phase, or that distract from more critical ones.
- Combine knock-on alerts.
- If the crew inhibits an alert manually, the display must show that clearly.

**Acknowledge and clear (§9, §12)**

- The attention-getting part (sound, flashing) can be acknowledged and suppressed unless it must stay continuous.
- An alert is removed when its condition clears.
- An alert cleared while its condition persists must be recallable, with an indication that stored messages exist.

**FAA HF design guidance** (https://hfcc.dot.gov/publications/docs/GeneralGuidance/zz_FAA_GeneralGuidanceDoc_Chapter_04_Section_03.html)

- Aural alerts 20–30 dB above ambient, in the 200–4500 Hz band.
- 20–30 ms onset and offset ramps, so they don't startle.
- Fewer than 10 unique tones.
- Time-critical visuals at least 2 square degrees of visual angle.
- Inhibit non-critical alerts during high workload.

### MIL-STD-411F

Source: https://www.cevians.com/app/uploads/2021/01/MIL-STD-411.pdf

- Flash at 3–5 Hz, with at most two flash rates (the second at 1–2 Hz), synchronized.
- The master warning or caution comes on together with the alert and latches until reset.
- If not silenced, the aural signal auto-cancels within 10 s.
- The master sits within the pilot's 30° forward cone.
- Each warning or caution message shows for at least 3 s.
- Priority: warning > caution > advisory > routine display.
- Voice message order: system → subsystem/location → nature of the problem.
- Night vision imaging system (NVIS) mode dims to 0.1 fL.

### Boeing vs Airbus

- **Boeing EICAS ("quiet, dark"):** white lights may confirm a normal switch state. There is an emphasis on tactile awareness of switch positions.
- **Airbus ("dark cockpit, lights-out"):** a light means abnormal or manually selected; a normal panel is dark. Source: https://aviaproconsulting.com/article/post/engineering-spotlight-the-ergonomics-of-annunciation-%E2%80%93-airbus-lights-out-vs-boeing-quiet-and-dark
- **A320 ECAM levels** (https://www.aviationhunt.com/airbus-a320-ata-31/):
  - Level 3: red, continuous repetitive chime, flashing MASTER WARNING.
  - Level 2: amber, single chime, MASTER CAUTION.
  - Level 1: amber, no aural or attention-getter (loss of redundancy).
  - STATUS: maintenance items.
- **Advisory mode** is a key precedent. A parameter that drifts outside its *normal* range but has not reached its caution limit pulses, and the relevant system page opens on its own.
- **Pilot controls:** CLR, RCL (recall), EMER CANC.
- **Phase inhibits:** the flight warning computer (FWC) uses 10 flight phases.
  - TO INHIBIT covers phases 3–5: takeoff power → 80 kt → liftoff → 1,500 ft.
  - LDG INHIBIT covers phases 7–8: 800 ft → touchdown → 80 kt.
  - Source: https://www.aviationhunt.com/airbus-a320-flight-phases/
- **QF32 (A380):** the uncontained engine failure produced about 35 ECAM messages, and they took about 55 min to work through. This shows the value of grouping knock-on alerts under the root cause. Source: https://admiralcloudberg.medium.com/a-matter-of-millimeters-the-story-of-qantas-flight-32-bdaa62dc98e7

### Garmin G1000 crew alerting system (CAS)

Sources: https://www.manualslib.com/manual/1570228/Garmin-G1000.html?page=72 · https://www.manualslib.com/manual/1279861/Garmin-G1000.html?page=22

- Warning: red, triggers MASTER WARNING. Caution: yellow, triggers MASTER CAUTION. **Advisory: white.**
- New alerts appear at the top of the window, above a white line that separates them from acknowledged alerts. After acknowledgment they re-sort by priority.
- The ALERTS softkey flashes and is used to acknowledge.
- The pattern to reuse: new and unacknowledged alerts on top, then sorted by priority.

### Helicopter HUMS

Source: https://www.airmedandrescue.com/latest/long-read/hums-keeping-watch

- Most health and usage monitoring system (HUMS) data goes to maintainers, not pilots. A pilot can fly without touching it, and it uploads after landing.
- The crew sees only exceedances that matter for safety or go/no-go decisions. Trends and predictions (vibration, rotor track and balance, engine trends) go to maintenance and the OEM.
- **Lesson:** split health data into operator-actionable alerts and maintainer-actionable logs.

---

## 2. UAV/RPA GCS human factors

### Williams (FAA, 2004)

Source: https://faa.gov/sites/faa.gov/files/data_research/research/med_humanfacs/oamtechreports/0424.pdf

- Human factors were involved in accidents on these airframes:

  | Airframe | Share of accidents |
  |---|---|
  | Predator | 67% |
  | Hunter | 47% |
  | Pioneer | 28% |
  | Shadow | 21% |

- Problems found on the Predator GCS:
  - "alerts do not command attention"
  - menus nested many levels deep on the head-down display
  - no autopilot-status indication
  - about 7 s and 4 menus to turn off the autopilot
- **Key point:** RPA operators *command* the aircraft rather than *fly* it. Design around issuing commands and confirming each one was accepted and executed.

### Hobbs (NASA)

Source: https://ntrs.nasa.gov/api/citations/20160014467/downloads/20160014467.pdf

- MQ-9 destruction rate in 2015 was about 4.0 per 100,000 flight hours, against about 0.41 for manned aircraft. **[As cited by Hobbs, not checked against primary USAF data.]**
- **Missing senses:** "we don't hear or feel anything, like RPM changes." A stuck throttle was noticed only when the aircraft failed to level off.
- **Alerting problems:**
  - one tone used for several meanings
  - alarms losing impact through repetition
  - poor prioritization
  - **visual alerts hidden behind non-critical pop-ups**
  - a 7-step trackball "ident" action
- **Link latency:** about 100 ms terrestrial, more than 1,000 ms over SATCOM.
- **Lost-link plans** may need updating about every 10 min.
- Hobbs & Lyall guidelines (fetch failed): https://human-factors.arc.nasa.gov/publications/Hobbs_Lyall_Ergonomics_Design_prepub.pdf

### Predator B Nogales (NTSB, 2006)

Source: https://flightsafety.org/asw/dec07/asw_dec07_p42-46.pdf

- 9 console lockups in the 3 months before the crash.
- After a console switch, the same lever that worked the fuel cutoff on PPO-1 worked the camera iris on PPO-2. The engine was shut off with no fault message.
- The NTSB recommended adequate visual **and aural** indications of safety-critical faults (engine-out, console lockup), in order of priority.
- **Directly relevant to ICE UAVs:** an engine-out must never be silent.

### Vigilant Spirit Control Station (AFRL)

Sources: https://scispace.com/pdf/vigilant-spirit-control-station-a-research-testbed-for-multi-2nes2dybjh.pdf · https://www.wpafb.af.mil/News/Article-Display/Article/1295072/afrl-shares-uav-software-to-further-research/

- A central Tactical Situation Display (map, routes, sensor footprints).
- Plus a compact **Vehicle Alert & Summary** pane for each vehicle: unique color, glyph, ID and callsign, nav mode, airspeed and altitude.
- Alerts for lost comms, lost GPS and low fuel or battery.
- **The closest proven model for "mission center, health at the periphery".**

### GA Block 50 GCS

Source: https://www.ga.com/new-block-50-ground-control-station-flies-mq-9-reaper

- Marketing describes a "glass cockpit", integrated electronic checklists, single-seat operation, and flight-critical functions kept separate from mission functions.
- Alert presentation is not public.

### Ecological interface design

Source: https://ntrs.nasa.gov/search.jsp?R=20030069036

- NASA Ames (Dowell, Morphew & Shively, 2003) compared alphanumeric, ecological and hybrid GCS status displays.
- The ecological display improved performance and situation awareness and reduced workload. Effect sizes were not available.

### Multimodal alerts

- Calhoun et al. (AFRL, 2002): tactile fault cues gave **significantly faster** responses than visual cues, with less interference with tracking. Source: https://journals.sagepub.com/doi/10.1177/154193120204602609
- Follow-up work compared tactile and aural cues under high audio load (radio chatter). Source: https://www.researchgate.net/publication/274977886_Tactile_and_Aural_Alerts_in_High_Auditory_Load_UAV_Control_Environments
- **[UNVERIFIED]** Tactile cues helped most when audio load was high.

### Supervisory control (Cummings & Guerlain, 2007)

Sources: https://journals.sagepub.com/doi/10.1518/001872007779598109 · https://dspace.mit.edu/handle/1721.1/65349

- 42 Navy operators controlled 8, 12 or 16 missiles. Performance and situation awareness degraded significantly at 16.
- **70% utilization** was a valid threshold, consistent with air traffic control findings.
- Higher utilization also lengthens how long vehicles wait for the operator.

### Vigilance (Wohleber et al., 2019, AFRL multi-UAS)

Source: https://journals.sagepub.com/doi/full/10.1177/0018720818799468

- Vigilance declined after about **45 min**, later than the 20–30 min typical in lab studies. Performance picked up near the end.
- Operators relied **less** on automation over time, even when it was reliable.

### Situation awareness (Endsley, 1995)

Source: https://www.researchgate.net/publication/210198492_Endsley_MR_Toward_a_Theory_of_Situation_Awareness_in_Dynamic_Systems_Human_Factors_Journal_371_32-64

- Three levels: L1 perception, L2 comprehension, L3 projection.
- Health displays should support L2 ("what it means for the mission") and L3 ("time to limit"), not just raw L1 values.

### Alarm fatigue

- Wickens et al. 2009: 45% of 495 ATC conflict alerts were false, yet there was no clear cry-wolf effect. Controllers often acted *before* the alert. Source: https://journals.sagepub.com/doi/10.1177/0018720809344720
- Bliss: the response rate tends to match the perceived reliability of the alarm. Source: https://stars.library.ucf.edu/rtd/3614/
- **Lesson:** keep false alerts low, and measure them.

### Clutter

- Ververs & Wickens on head-up display (HUD) clutter: https://www.semanticscholar.org/paper/Head-Up-Displays:-Effect-of-Clutter,-Display-and-on-Ververs-Wickens/6642092b298770da6b82c0e1cd65844225d71e60
- Yeh & Wickens 2001: https://doi.org/10.1518/001872001775870359
- **[UNVERIFIED]** Color coding supports filtering. Decluttering speeds search but costs performance when the hidden information turns out to be needed.

---

## 3. Peripheral health UI patterns

### ASM Consortium human-centered HMI study

Sources: https://journals.sagepub.com/doi/10.1177/154193120504902308 (verified 2026-10-02) · https://www.controleng.com/creating-an-asm-compliant-hmi-goes-deeper-than-screen-color-selection/

- 21 petrochemical operators.
- Scenarios finished 41% faster (7.5 min).
- 96% of failures handled successfully, a 26% improvement.
- **Failures detected before the first alarm in 48% of cases**, a 38% improvement.
- The strongest evidence that grey-until-abnormal displays with trends work.

### ISA-101 / high-performance HMI

- Muted greys in normal operation. Saturated color only for abnormal states.
- Analog range bars with the normal band marked.
- Inline sparklines, about 60–120 × 15–30 px, showing the last 5–30 min.
- Display hierarchy from L1 (overview) to L4 (diagnostics).
- Redundant coding (color + shape + text), because about 8% of men are color-deficient.
- Source: https://industrialmonitordirect.com/blogs/knowledgebase/isa-101-high-performance-hmi-design-principles-color-strategy
- **[This is a blog. Its specific numbers, such as 200 ms detection and 6 alarms per hour, are UNVERIFIED.]**

### EEMUA 191 alarm rates

Source: https://humanfactors101.com/topics/alarms/

- Steady state: no more than about 1 alarm per 10 min.
- Major upset: fewer than 10 alarms in the first 10 min.
- Milford Haven: 275 alarms in 11 min, most of them marked "high".
- **[UNVERIFIED]** Priority split: about 80% low, 15% medium, 5% high.

### Night and NVIS

Source: https://ftp.appliedavionics.com/techguides/Content/TG-LPBS-21/1.3.2_NVIS%20Colors.htm

- MIL-STD-3009 NVIS Class A filtering excludes red. Class B allows proper NVIS red.
- A night GCS needs a dimmable dark theme that keeps red, amber and white distinguishable by shape as well as color.

### Sunlight readability

Source: https://accuview.com/sunlight-readable-monitors-touch-screens/

- Rugged displays are typically 1,000–2,500+ nits.
- Use high-contrast, heavy-weight, large type. Legends should be at least 20 arc-minutes (MIL-STD-411F).

---

## 4. Defense C2 and mission-first examples

- **Anduril Lattice:** a map-centered "single pane of glass" with an object list. It "present[s] operators with recommended decision points, not noise." Details are marketing-level; health display is not disclosed. Sources: https://sldinfo.com/wp-content/uploads/2022/10/2022-slick-Lattice-OS-AUS.pdf · https://laurenjpark.com/work/anduril
- **Shield AI Hivemind Commander:** human in or on the loop; "multiple UAS commanded by a minimal cadre." Source: https://shield.ai/hivemind-for-operational-read-and-react-swarming/
- **ATAK UAS Tool:** the drone is a map entity, with full-motion video, sensor point of interest and C2 inside the team map. The aircraft is one object in the mission picture, not the center. Sources: https://freetakteam.github.io/FreeTAKServer-User-Docs/Usage/tools/UASTool/ · https://play.google.com/store/apps/details?id=com.atakmap.android.uastool.plugin&hl=en
- **MIL-STD-2525D:** frame colors are cyan for friendly, red for hostile, yellow for unknown and green for neutral. **Never reuse these colors for status or severity.** This clashes with aviation alert colors (red = warning, cyan = advisory). Source: https://corvusintell.com/blog/c2-systems/symbology-engineering-mil-std-2525/

---

## 5. Proposed Phantom OPS alert taxonomy

The timings and card duration below are proposals, not standards.

| Level | Name | Color and shape | Sound | What the screen does | Latch and acknowledge rules | Examples (ICE VTOL) |
|---|---|---|---|---|---|---|
| L4 | Time-critical warning | Red, octagon, inverse banner | A unique voice message for each condition plus a tone. Repeats until resolved or until a higher alert takes over. | Banner across the top of the map that nothing ever covers. The related panel opens. A red halo appears on the aircraft icon. | Acknowledging silences the repeat only. The banner stays while the condition exists. Cannot be shelved. | Engine out in cruise or transition; terrain or obstacle; transition failure; lost link with a conflicting lost-link route; fuel runs out before any safe landing site |
| L3 | Warning | Red, triangle | Unique master-warning tone, repeating until acknowledged. Auto-cancels after 10 s unless set to continuous. | MASTER WARN flashes at 3–5 Hz. The health-strip segment turns red. A compact card opens at the map edge. | Latched until both acknowledged and cleared. A brief exceedance stays as "LATCHED – cleared". | CHT or EGT above red; low oil pressure; generator failure with battery below reserve; GPS lost; C2 lost |
| L2 | Caution | Amber, diamond | Single chime | MASTER CAUT. The segment turns amber. A card appears for about 8 s, then collapses to a pill. | Acknowledging stops the flash; the alert stays queued until it clears. Recallable. Shelving shows a visible "SHELVED" timer. | CHT in amber; fuel below planned reserve; lift motor or ESC hot; vibration trend; low link margin; low lift battery state of charge for landing |
| L1 | Advisory | **White** (not cyan, because of MIL-STD-2525), circle | None | A counter on the strip pill and a queue entry. No pop-up. | No acknowledgment needed. Clears itself. | Redundancy lost (one GNSS, one radio); a sensor degraded |
| L0 | Trend / pre-alert | Grey to white pulsing value on the sparkline, plus a time-to-limit chip | None | The parameter brightens, e.g. "CHT → amber in ~6 min". | Not queued. Disappears when the trend reverses. | CHT climbing in a hot climb; fuel burn above plan; oil temperature drifting |
| M | Maintenance / HUMS | Not shown in flight | None | Post-flight report and trend database | Logged only | Minor exceedances, vibration spectra, engine hours and cycles |

### Inhibits by flight phase (A320 model)

| Phase | Inhibits |
|---|---|
| Preflight / engine run | Everything active. L2 and above block arming. |
| VTOL takeoff / hover climb | L1 and L0 inhibited. L2 visual only; its sound is held until stable climb or about 60 s. L3 and L4 active. |
| Transition | Only alerts that change the abort-or-continue decision (lift power, airspeed, engine). Everything else is queued. "TRANS INHIBIT" is shown. |
| Cruise / mission | Everything active. L2 and below stay at the periphery. |
| Back-transition, descent and land | Same as takeoff. Lift battery and motor alerts are promoted. "LDG INHIBIT" is shown. |
| Post-flight | Review of everything queued, latched and inhibited. |

Inhibited alerts are **queued, not discarded**. Every inhibit is shown on screen (AC 25.1322-1 §8.d(4)).

### Timing and sound rules

- Debounce and hysteresis on every threshold.
- L2 and above show for at least 3 s.
- One aural alert at a time.
- Fewer than 10 unique sounds, 20–30 dB above GCS ambient.
- Optional tactile alerts for L3 and L4.

---

## 6. Design principles for "mission-first, health-peripheral"

1. **Dark and quiet when normal.** A greyscale health strip. Color always means something.
2. **A permanent, thin health strip.**
   - Segments: ENG, FUEL, ELEC, LIFT, NAV, LINK, AP. Each shows a glyph, a value and a sparkline.
   - About 5% of the screen or less, at a fixed edge, never covered.
3. **Health shown as a mission consequence.** A bingo ring, a remaining-range polygon, and the link-coverage boundary on the map.
4. **Management by exception, with auto-escalation.**
   - L2 cards collapse on their own.
   - L3 and L4 open the relevant system detail, but never cover the aircraft or the route.
5. **Show the trend before the alarm (L0).** Use sparklines and time-to-limit forecasts. In the ASM study, operators detected 48% of failures before the first alarm.
6. **Make up for the missing senses.** A continuous peripheral cue for RPM, power and fuel flow, with optional synthetic engine audio. Engine-out is always L4 (the Nogales lesson).
7. **Group knock-on alerts under their root cause.** Example: "ELEC: on battery, 38 min remaining", with the related alerts as children.
8. **Strict color discipline, with shape.** Red and amber appear only in alert chrome. MIL-STD-2525 keeps its colors on the map. White for advisories. Every state is redundantly coded.
9. **Acknowledge is not clear.**
   - Acknowledging stops the sound and flash; the alert stays until its condition clears.
   - Cleared alerts can be recalled.
   - Brief exceedances latch for review.
   - Shelving is visible and timed.
10. **Inhibit by phase, never silently.** Queue inhibited alerts and show that the inhibit is active. Transition and landing get the strictest filtering.
11. **An alert budget, measured.** At most about 1 alert per 10 min in cruise, and fewer than 10 in the first 10 min of an upset. Track the nuisance rate on every sortie.
12. **Design for long-mission vigilance.** Expect a dip after about 45 min. Provide health-digest prompts and shift-handover "what changed" summaries. Consider tactile cues for L3 and L4.
13. **One operator, many aircraft, from day one.** A VSCS-style tile per aircraft. Keep operator utilization below about 70%.
14. **Command and verify.** Every command shows sent → acknowledged → executed. The automation mode is always visible (Williams).
15. **Fit the environment.**
    - A sunlight day theme with legends of at least 20 arc-minutes.
    - A dimmable, NVIS-aware night theme.
    - Hardware or HOTAS keys for ACK and RECALL, with no menu paths for time-critical actions.

## Flagged uncertainties

- The ISA-101 numbers come from a blog.
- The EEMUA 80/15/5 priority split is from memory.
- The MQ-9 rate is as cited by Hobbs.
- The follow-on tactile findings and the Yeh & Wickens findings were paywalled.
- The Lattice, Hivemind and Block 50 UI details are marketing-level.
- The phase-inhibit timings and the 8 s card duration are proposals.
