"""Variable map: ``procedure/variables.yaml`` (names used in tests -> PDI type / id / vector).

A test names variables ("User bit 999", "NAV LIGHTS SWITCH"); this module resolves a name to the key the telemetry
decoder uses (``B2199``) or to an event id, and tells which names cannot be read from the loaded PDI.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import yaml

from phmaint.link.pdi import TmLayout

PREFIX = {"Bvar": "B", "Uvar": "U", "Rvar": "R"}


@dataclass(frozen=True)
class VarRef:
    name: str
    type: str  # Bvar | Uvar | Rvar | Event
    id: int | None  # None for a range / pattern entry (several variables)
    id_text: str
    direction: str = ""
    vector: str = ""  # what the matrix claims; the loaded PDI is the authority
    note: str = ""

    @property
    def is_event(self) -> bool:
        return self.type == "Event"

    @property
    def key(self) -> str | None:
        """Decoder key (``B2199``); ``None`` for events and for range entries."""
        if self.is_event or self.id is None or self.type not in PREFIX:
            return None
        return f"{PREFIX[self.type]}{self.id}"


class VarMap:
    def __init__(self, refs: dict[str, VarRef] | None = None, error: str = ""):
        self.refs = refs or {}
        self.error = error

    def __contains__(self, name: str) -> bool:
        return name in self.refs

    def get(self, name: str) -> VarRef | None:
        return self.refs.get(name)

    def event_id(self, name: str) -> int | None:
        ref = self.refs.get(name)
        return ref.id if ref and ref.is_event else None

    def problem(self, name: str, layout: TmLayout | None) -> str | None:
        """Why ``name`` cannot be read as telemetry (``None`` = it can)."""
        ref = self.refs.get(name)
        if ref is None:
            return f"variable '{name}' is not in procedure/variables.yaml"
        if ref.is_event:
            return f"'{name}' is an event, not a telemetry variable"
        if ref.key is None:
            return f"variable '{name}' ({ref.id_text}) is a range / pattern entry, not a single variable"
        if layout is not None and layout.ok and layout.vector_of(ref.key) is None:
            return f"variable '{name}' ({ref.type} {ref.id}) is not in any telemetry vector of the loaded PDI"
        return None


def _parse_id(value: object) -> tuple[int | None, str]:
    if isinstance(value, int):
        return value, str(value)
    text = str(value)
    return (int(text) if text.strip().isdigit() else None), text


def load_varmap(path: Path) -> VarMap:
    """Read the variable map. Never raises: a broken file yields an empty map with ``error`` set."""
    if not path.is_file():
        return VarMap(error=f"{path.name} not found")
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8-sig"))
    except (OSError, yaml.YAMLError) as exc:
        return VarMap(error=f"{path.name}: {exc}")
    if data is None:
        return VarMap()
    if not isinstance(data, dict):
        return VarMap(error=f"{path.name}: must be a mapping of names")
    refs: dict[str, VarRef] = {}
    for name, entry in data.items():
        if not isinstance(entry, dict):
            continue
        vid, text = _parse_id(entry.get("id"))
        refs[str(name)] = VarRef(
            name=str(name),
            type=str(entry.get("type", "")),
            id=vid,
            id_text=text,
            direction=str(entry.get("direction", "")),
            vector=str(entry.get("vector", "")),
            note=str(entry.get("note", "")),
        )
    return VarMap(refs)
