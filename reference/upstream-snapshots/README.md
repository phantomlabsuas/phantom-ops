# Upstream source snapshots

The research session in early October 2026 fetched these files from GitHub master to check what really reaches the GCS. They are snapshots for reference only and are not maintained.

- `quadplane.cpp` and `quadplane.h` are from ArduPilot `ArduPlane/`. They hold the transition and landing state machine, the `Q_TRANS_FAIL*` and `Q_LAND_ICE_CUT` parameters, and the STATUSTEXT strings.
- `VTOL_Assist.cpp` is from ArduPilot `ArduPlane/`. It is the Q_ASSIST logic. Note that speed assist sends no STATUSTEXT; only altitude and angle assist warn.
- `AP_Generator_Loweheiser.cpp` is from ArduPilot `libraries/AP_Generator/`. It covers hybrid generator warm-up and cool-down, comms timeout, voltage limits and the maintenance countdown.
- `common.xml` is from MAVLink `message_definitions/v1.0/`. It defines EFI_STATUS (225), FUEL_STATUS (371), GENERATOR_STATUS (373) and EXTENDED_SYS_STATE.
- `dev.xml` is the MAVLink development dialect, with EFI_PERFORMANCE (442, WIP).
