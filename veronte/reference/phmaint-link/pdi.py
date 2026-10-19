"""Telemetry vector layouts from the PDI file ``ver_spdif_tm.xml`` (docs/Veronte/telemetry-feedback.md, chapter 2).

Layouts are loaded at run time, never hard-coded: adding a variable to a vector in the PDI changes its layout.
Pure Python, no I/O besides reading the XML file.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path

TM_FILE = "ver_spdif_tm.xml"

# telemetry field kind -> (variable prefix, bits)
KINDS: dict[str, tuple[str, int]] = {
    "bit": ("B", 1),
    "uinteger16": ("U", 16),
    "real-float32": ("R", 32),
    "pos_abs": ("P", 96),
}


@dataclass(frozen=True)
class Field:
    kind: str  # bit | uinteger16 | real-float32 | pos_abs
    id: int
    bits: int
    scale: float = 1.0

    @property
    def key(self) -> str:
        """Variable key as used everywhere in the app: ``B2199``, ``U1``, ``R501``, ``P28674``."""
        return f"{KINDS[self.kind][0]}{self.id}"


@dataclass(frozen=True)
class Vector:
    index: int
    period: float
    enable: int  # Bit variable id that enables the vector; 1 = always
    address: int  # destination address (2 = Veronte Link / Ops, 7000 = ...)
    fields: tuple[Field, ...]

    @property
    def bits(self) -> int:
        return sum(f.bits for f in self.fields)

    @property
    def nbytes(self) -> int:
        return (self.bits + 7) // 8

    @property
    def always_on(self) -> bool:
        return self.enable == 1

    @property
    def name(self) -> str:
        return f"V{self.index}"

    def keys(self) -> set[str]:
        return {f.key for f in self.fields}


@dataclass
class TmLayout:
    path: Path
    vectors: list[Vector] = field(default_factory=list)
    error: str = ""  # empty when the file was read

    @property
    def ok(self) -> bool:
        return not self.error and bool(self.vectors)

    def vector_of(self, key: str) -> Vector | None:
        """First vector that carries ``key`` (always-on vectors first)."""
        for v in sorted(self.vectors, key=lambda v: (not v.always_on, v.index)):
            if key in v.keys():
                return v
        return None


def _int(text: str | None, default: int = 0) -> int:
    try:
        return int(float(text)) if text is not None else default
    except ValueError:
        return default


def load_tm(pdi_dir: Path) -> TmLayout:
    """Read ``<pdi_dir>/ver_spdif_tm.xml``. Never raises: problems end up in ``TmLayout.error``."""
    path = Path(pdi_dir) / TM_FILE
    layout = TmLayout(path=path)
    if not path.is_file():
        layout.error = f"{TM_FILE} not found in {pdi_dir}"
        return layout
    try:
        data = ET.parse(path).getroot().find("data")
    except (ET.ParseError, OSError) as exc:
        layout.error = f"{TM_FILE} cannot be read: {exc}"
        return layout
    if data is None:
        layout.error = f"{TM_FILE} has no <data> element"
        return layout
    for index, vec in enumerate(data):
        fields: list[Field] = []
        fields_node = vec.find("fields")
        for f in fields_node if fields_node is not None else []:
            holder = f.find("data-fieldset")
            if holder is None or len(holder) == 0:
                continue
            node = holder[0]
            if node.tag not in KINDS:
                layout.error = f"unknown telemetry field kind '{node.tag}' in vector V{index}"
                return layout
            fields.append(
                Field(
                    kind=node.tag,
                    id=_int(node.findtext("id")),
                    bits=KINDS[node.tag][1],
                    scale=float(node.findtext("scale") or 1.0),
                )
            )
        layout.vectors.append(
            Vector(
                index=index,
                period=float(vec.findtext("periode") or 0.0),
                enable=_int(vec.findtext("enable"), 1),
                address=_int(vec.findtext("address/uav")),
                fields=tuple(fields),
            )
        )
    if not layout.vectors:
        layout.error = f"{TM_FILE} defines no vectors"
    return layout
