"""Telemetry 50020 decoder and the store of latest values (docs/Veronte/telemetry-feedback.md).

Payload (little endian): ``Float32 timestamp, Uint32 hash`` then one LSB-first bit stream of the vector's fields.
The hash identifies the vector. Its algorithm is not documented, so the hashes of the built-in PDI are listed in
``procedure/telemetry_hashes.yaml`` (observed, recorded with ``tools/record_hashes.py``). A packet is decoded only
when its hash is listed and its size fits that vector; vectors are never chosen by size alone, because another
configuration can have the same size. Anything else means the autopilot runs a different PDI configuration: the
packet is not decoded and the layout is reported as outdated.
"""

from __future__ import annotations

import struct
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from phmaint.link.pdi import Field, TmLayout, Vector

Value = float | int | tuple[int, int, int]

MISMATCH_WINDOW_S = 5.0


def decode_fields(fields: tuple[Field, ...], body: bytes) -> dict[str, Value]:
    """Walk ``fields`` with a bit cursor over ``body`` (LSB first = little-endian integer bit order)."""
    stream = int.from_bytes(body, "little")
    nbits = len(body) * 8
    out: dict[str, Value] = {}
    pos = 0
    for f in fields:
        if pos + f.bits > nbits:
            break
        if f.kind == "bit":
            out[f.key] = (stream >> pos) & 1
        elif f.kind == "uinteger16":
            out[f.key] = (stream >> pos) & 0xFFFF
        elif f.kind == "real-float32":
            raw = (stream >> pos) & 0xFFFFFFFF
            out[f.key] = struct.unpack("<f", struct.pack("<I", raw))[0] * f.scale
        else:  # pos_abs: three signed int32 (latitude 1e-8 deg, longitude 1e-8 deg, height mm)
            parts = [(stream >> (pos + 32 * j)) & 0xFFFFFFFF for j in range(3)]
            out[f.key] = tuple(p - (1 << 32) if p & 0x80000000 else p for p in parts)  # type: ignore[assignment]
        pos += f.bits
    return out


@dataclass
class HashTable:
    """``hash -> vector name`` ("V1") of the built-in PDI; ``error`` when the file cannot be used."""

    vectors: dict[int, str] = field(default_factory=dict)
    error: str = ""

    @property
    def ok(self) -> bool:
        return not self.error and bool(self.vectors)


def load_hashes(path: Path) -> HashTable:
    """Read ``telemetry_hashes.yaml`` (``0x930456CA: V0`` per line). Never raises."""
    if not path.is_file():
        return HashTable(error=f"{path.name} not found")
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8-sig"))
    except (OSError, yaml.YAMLError) as exc:
        return HashTable(error=f"{path.name}: {exc}")
    if not isinstance(data, dict) or not data:
        return HashTable(error=f"{path.name}: must map hashes to vector names (0x930456CA: V0)")
    table = HashTable()
    for h, name in data.items():
        if not isinstance(h, int) or not 0 <= h <= 0xFFFFFFFF or not isinstance(name, str):
            return HashTable(error=f"{path.name}: bad entry {h!r}: {name!r}")
        table.vectors[h] = name
    return table


def check_hashes(table: HashTable, layout: TmLayout) -> list[str]:
    """Problems of the hash table against the PDI: unreadable table, unknown vector names, a vector listed twice."""
    if not table.ok:
        return [table.error or "no telemetry hashes"]
    names = {v.name for v in layout.vectors}
    problems = [
        f"telemetry hash {h:#010x}: vector {n} is not in the PDI"
        for h, n in table.vectors.items()
        if n not in names
    ]
    seen: set[str] = set()
    for n in table.vectors.values():
        if n in seen:
            problems.append(f"telemetry hashes: vector {n} is listed twice")
        seen.add(n)
    return problems


@dataclass
class Decoded:
    vector: Vector
    hash: int
    timestamp: float
    values: dict[str, Value]


class TelemetryDecoder:
    """Decodes 50020 payloads against a loaded layout and tracks whether the layout fits the autopilot."""

    def __init__(self, layout: TmLayout, hashes: HashTable, clock: Callable[[], float] = time.monotonic):
        self.layout = layout
        self.hashes = hashes
        self._clock = clock
        self._by_name = {v.name: v for v in layout.vectors}
        self.decoded_ok = 0
        self.mismatches = 0
        self._last_mismatch: float | None = None

    @property
    def layout_state(self) -> str:
        """``matches`` | ``outdated`` | ``missing`` (PDI or hash table not usable) | ``unknown`` (no telemetry yet)."""
        if not self.layout.ok or not self.hashes.ok:
            return "missing"
        if self._last_mismatch is not None and self._clock() - self._last_mismatch <= MISMATCH_WINDOW_S:
            return "outdated"
        return "matches" if self.decoded_ok else "unknown"

    def _fits(self, v: Vector, nbytes: int) -> bool:
        return nbytes in (v.nbytes, v.nbytes + 1)  # up to one padding byte (telemetry-feedback.md chapter 3)

    def _resolve(self, h: int, nbytes: int) -> Vector | None:
        vector = self._by_name.get(self.hashes.vectors.get(h, ""))
        return vector if vector is not None and self._fits(vector, nbytes) else None

    def decode(self, payload: bytes) -> Decoded | None:
        if len(payload) < 8 or not self.layout.ok or not self.hashes.ok:
            return None
        timestamp, h = struct.unpack("<fI", payload[:8])
        body = payload[8:]
        vector = self._resolve(h, len(body))
        if vector is None:
            self.mismatches += 1
            self._last_mismatch = self._clock()
            return None
        self.decoded_ok += 1
        return Decoded(vector, h, timestamp, decode_fields(vector.fields, body))


@dataclass
class TelemetryStore:
    """Latest decoded value per variable key with its arrival time; values older than ``stale_s`` are stale."""

    stale_s: float = 1.0
    clock: Callable[[], float] = time.monotonic
    _values: dict[str, tuple[Value, float, float]] = field(default_factory=dict)
    last_update: float | None = None

    def update(self, values: dict[str, Value], period: float = 0.0) -> None:
        """``period`` = the vector's period: a slow vector (V2, 2 s) stays fresh for 3 periods."""
        now = self.clock()
        limit = max(self.stale_s, 3 * period)
        for k, v in values.items():
            self._values[k] = (v, now, limit)
        self.last_update = now

    def get(self, key: str) -> tuple[Value, float] | None:
        """``(value, age_s)`` or ``None`` when never received."""
        item = self._values.get(key)
        if item is None:
            return None
        return item[0], self.clock() - item[1]

    def fresh(self, key: str) -> Value | None:
        item = self._values.get(key)
        if item is None or self.clock() - item[1] > item[2]:
            return None
        return item[0]

    def snapshot(self) -> dict[str, Any]:
        return {k: v for k, (v, _t, _l) in self._values.items()}

    def clear(self) -> None:
        self._values.clear()
        self.last_update = None
