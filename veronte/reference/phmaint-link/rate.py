"""Telemetry data rate over a time window (receive only): "is link data flowing, and how much".

Fed with the autopilot's telemetry frames (50020 vectors and 50021 complementary telemetry) for a fixed window; reports
the data rate from the frames' Len field (payload bytes x 8 / window) and the messages per second of each stream.
Pure Python: the caller (``LinkService.measure_telemetry``) decides which frames are fed and for how long.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass, field

from phmaint.link import vcp
from phmaint.link.telemetry import HashTable

TYPE_COMPLEMENTARY = 50021
TELEMETRY_TYPES = (vcp.TYPE_TELEMETRY, TYPE_COMPLEMENTARY)
OTHER = "other"  # 50020 with a hash that is not in the built-in table


@dataclass(frozen=True)
class RateResult:
    duration_s: float
    messages: int
    payload_bytes: int
    per_stream: dict[str, int]  # stream name (V0, V1, V2, 50021, other) -> messages in the window

    @property
    def kbit_s(self) -> float:
        return self.payload_bytes * 8 / self.duration_s / 1000 if self.duration_s > 0 else 0.0

    def rate_of(self, stream: str) -> float:
        """Messages per second of one stream."""
        return self.per_stream.get(stream, 0) / self.duration_s if self.duration_s > 0 else 0.0

    def as_dict(self) -> dict:
        """Plain values for drafts and logs."""
        return {
            "kbit_s": round(self.kbit_s, 3),
            "messages": self.messages,
            "payload_bytes": self.payload_bytes,
            "duration_s": self.duration_s,
            "per_second": {k: round(self.rate_of(k), 2) for k in self.per_stream},
        }


@dataclass
class RateMeter:
    """Counts telemetry frames; ``result(duration)`` turns the counts into a rate."""

    hashes: HashTable
    messages: int = 0
    payload_bytes: int = 0
    per_stream: dict[str, int] = field(default_factory=dict)

    def stream_of(self, frame: vcp.Frame) -> str:
        if frame.type == TYPE_COMPLEMENTARY:
            return str(TYPE_COMPLEMENTARY)
        if len(frame.payload) >= 8:
            h = struct.unpack("<I", frame.payload[4:8])[0]
            return self.hashes.vectors.get(h, OTHER)
        return OTHER

    def feed(self, frame: vcp.Frame) -> None:
        """Count one frame; anything that is not telemetry (50020 / 50021) is ignored."""
        if frame.type not in TELEMETRY_TYPES:
            return
        self.messages += 1
        self.payload_bytes += len(frame.payload)  # = the frame's Len field
        name = self.stream_of(frame)
        self.per_stream[name] = self.per_stream.get(name, 0) + 1

    def result(self, duration_s: float) -> RateResult:
        return RateResult(duration_s, self.messages, self.payload_bytes, dict(self.per_stream))
