# Phantom OPS — GCS UI/UX benchmark research (2026-10-02, updated 2026-10-16)

Full doc: https://claude.ai/code/artifact/92323f7c-eb78-4110-b4c7-2007bff567d9
Fly view mockup (Design canvas): https://claude.ai/artifact/VaWQGv4yfVVaLV8R26vCtU
Local copy of everything: C:\Projects\RnD\phantom-ops (start with CLAUDE.md)

The mockup is a 1920×1080 night-ops Fly view at hour 9 of a cruise ISR sortie, with an ENG CHT caution active.

What the mockup shows:

- The map fills the screen.
- IR payload video sits in a picture-in-picture window. It docks to any corner and can swap with the map.
- The map shows:
  - an engine-out glide ring;
  - alternate landing zones;
  - the line-of-sight (LOS) link edge;
  - an off-screen indicator pointing to home;
  - the orbit around named area of interest NAI-3.
- The right panel has a decluttered alert queue and a mini command window. The command window covers:
  - HOLD and return-to-base (RTB), each confirmed with a second tap;
  - −/+ adjustments for speed and altitude, then Send;
  - a lost-link line.
- A 7-segment health strip runs along the bottom. Its ENG and FUEL segments open live windows above the strip.
- The left menu works. Checklists (pre-landing / back-transition) is designed.
- Terrain and IR imagery are synthetic placeholders.

## Benchmarks chosen

- **UAV Navigation Visionair.** Best alarm depth: a 4-tier alarm system, engine gauges, alternate landing sites, multi-GCS handover.
- **Auterion Mission Control.** Best modern interaction design:
  - shows the RTL point and time to home;
  - uses hold-to-confirm;
  - has Normal and Advanced modes.
- **Lockheed VCSi.** Best crew-role model:
  - layouts per crew role;
  - alerts that can be acted on directly;
  - Look Ahead prediction;
  - link coverage shown on the map.
- **Insitu INEXA.** Best model for long-endurance combustion-engine operations:
  - one operator to many aircraft;
  - video overlay;
  - a Platform Kit vs Mission Kit split.
- **Quantum QBase / MOSAIC.** Best minimal-training field workflow.
- **Mission peers with no public UI to study:** Shield AI V-BAT, Textron Aerosonde HQ, AV JUMP 20.

## Core design direction (draft)

- The mission view owns the centre of the screen.
- Payload video sits in a picture-in-picture window docked to a corner, swappable with the map.
- A thin greyscale health strip (ENG / FUEL / ELEC / LIFT / NAV / LINK / AP) changes only when a value leaves its normal band.
- The alert queue sits at the side. The banner appears only for L3 and L4.
- The alert model has 6 levels:

| Level | Name |
|---|---|
| L4 | Time-critical |
| L3 | Warning |
| L2 | Caution |
| L1 | Advisory |
| L0 | Trend |
| M | Maintenance |

- Alerts are inhibited by flight phase, never silently.
- Acknowledging an alert does not clear it.
- Every command shows its status as Sent › Acknowledged › Executed.

## Gaps Phantom can own

- Aviation-grade warning/caution/advisory alerting.
- A dedicated engine/hybrid page with bingo-fuel prediction.
- Visibility of VTOL transition and lift assist.
- Structured shift handover.
- Remote escalation of alerts to phone or watch.

## Open questions

- Autopilot stack.
- Engine, ECU and generator.
- Crew model.
- Target hardware.
- SAIL / certification path.
- Whether remote alert escalation is acceptable.
- Which workspace to design next (shift handover was suggested).
