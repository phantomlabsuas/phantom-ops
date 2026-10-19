"""Flight phase names (firmware phase IDs, ``docs/Veronte/pdi-structure.md`` section 7). Pure data, no I/O."""

from __future__ import annotations

# U1 "Current phase identifier" (telemetry V1) and the phase byte of the System status (50008) use these IDs
PHASES: dict[int, str] = {
    0: "STANDBY",
    1: "TAKE-OFF",
    2: "ROUTE",
    3: "LANDING",
    4: "HOLD",
    5: "HOVER",
    6: "FBX",
    7: "NTC",
    9: "TAKE-OFF READY",
    10: "RETURN HOME",
    12: "HDG",
    13: "ARMED",
    20: "INITIAL",
}

PHASE_VAR = "Current phase identifier"  # name in procedure/variables.yaml (Uvar 1, V1)


def phase_name(phase_id: int | None) -> str | None:
    """``"ARMED"`` for 13; an unknown ID as its number; ``None`` when there is no phase."""
    if phase_id is None:
        return None
    return PHASES.get(phase_id, f"Phase {phase_id}")
