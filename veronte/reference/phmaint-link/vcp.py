"""VCP codec for the application interface of Veronte Link (docs/Veronte/vcp-protocol.md, link-architecture.md).

Pure Python, no I/O. Two framings:

* **Application framing** (what travels on the multicast group; the only one the app uses at run time)::

      Reserved(2) Len(2) Src(4) Dst(4) Type(2) Props(2) | payload(Len) | [optional CRC-32(4)]

  Header big endian, private payloads little endian. The optional checksum (props bits 6-7 = 3) is a CRC-32 over bytes
  ``0 .. 15 + Len``. Link adds sync / TTL / ident / session / CRC8 / CRC32 when it forwards to the autopilot.

* **Wire format** (``build_wire`` / ``parse_wire``): the full packet with CRC8 and CRC32. Kept to prove the CRC rules
  against the documented wire examples; ported from ``vcp_test/vcp.py``.
"""

from __future__ import annotations

import struct
import zlib
from dataclasses import dataclass

TYPE_USER_EVENT = 50002
TYPE_DISCOVERY = 50001
TYPE_SYSTEM_STATUS = 50008
TYPE_TELEMETRY = 50020
TYPE_TELEMETRY_ON_DEMAND = 50022

HEADER_LEN = 16
_CHK_LEN = {0: 0, 1: 2, 2: 4, 3: 4}


def crc32(data: bytes) -> int:
    """CRC-32/ISO-HDLC (zlib, Ethernet): the only checksum algorithm VCP uses."""
    return zlib.crc32(data) & 0xFFFFFFFF


def make_props(ack: bool = True, idd_version: int = 32, checksum_type: int = 3) -> int:
    return ((idd_version & 0x7F) << 8) | ((checksum_type & 3) << 6) | (0x8000 if ack else 0)


# --- application framing ----------------------------------------------------------------------------------


def build_frame(
    src: int,
    dst: int,
    msg_type: int,
    payload: bytes,
    *,
    ack: bool = True,
    idd_version: int = 32,
    checksum_type: int = 3,
) -> bytes:
    """One datagram for ``<group>:51018``."""
    props = make_props(ack, idd_version, checksum_type)
    head = struct.pack(">HHIIHH", 0, len(payload), src, dst, msg_type, props)
    frame = head + payload
    if checksum_type == 3:
        frame += struct.pack(">I", crc32(frame))
    elif checksum_type in (1, 2):
        raise ValueError("checksum types 1 and 2 (plain sums) are not supported")
    return frame


@dataclass(frozen=True)
class Frame:
    src: int
    dst: int
    type: int
    props: int
    payload: bytes
    checksum_ok: bool | None  # None: no optional checksum (or a sum type that is not verified)

    @property
    def ack_requested(self) -> bool:
        return bool(self.props & 0x8000)

    @property
    def idd_version(self) -> int:
        return (self.props >> 8) & 0x7F


def parse_frame(datagram: bytes) -> Frame | None:
    """Parse one datagram received on ``<group>:51017``. ``None`` when it is not a well-formed frame."""
    if len(datagram) < HEADER_LEN:
        return None
    _res, length, src, dst, typ, props = struct.unpack(">HHIIHH", datagram[:HEADER_LEN])
    chk_len = _CHK_LEN[(props >> 6) & 3]
    end = HEADER_LEN + length
    if len(datagram) < end + chk_len:
        return None
    payload = datagram[HEADER_LEN:end]
    checksum_ok: bool | None = None
    if (props >> 6) & 3 == 3:
        checksum_ok = struct.unpack(">I", datagram[end : end + 4])[0] == crc32(datagram[:end])
    return Frame(src, dst, typ, props, payload, checksum_ok)


# --- user event (50002) -----------------------------------------------------------------------------------


def build_user_event(src: int, dst: int, event_id: int, rx_id: int, **kw) -> bytes:
    """Request: ``Uint16 0, Uint16 event_id, Uint32 rx_id`` (little endian)."""
    return build_frame(src, dst, TYPE_USER_EVENT, struct.pack("<HHI", 0, event_id, rx_id), **kw)


@dataclass(frozen=True)
class UserEventReply:
    ack: int
    event_id: int
    rx_id: int
    enabled: int
    user: int
    licence: int

    @property
    def accepted(self) -> bool:
        """ACK 1, Enabled 1, User 1, Licence 1 (the response only says the event was triggered)."""
        return (self.ack, self.enabled, self.user, self.licence) == (1, 1, 1, 1)


def parse_user_event_reply(frame: Frame) -> UserEventReply | None:
    if frame.type != TYPE_USER_EVENT or len(frame.payload) < 14:
        return None
    return UserEventReply(*struct.unpack("<HHIHHH", frame.payload[:14]))


# --- variable set (configuration manager 50041, configurable #235) -----------------------------------------
# Learned from Veronte Ops' variable slider and verified in SIL (docs/Veronte/variable-write.md): the autopilot answers
# with a Message Acknowledgement (17000) and an echo of the command (argument 3, its firmware version, same data).

TYPE_CONFIG = 50041
TYPE_ACK = 17000
CFG_SET = 2
CFG_ECHO = 3
CFG_VAR_SET = 235
CFG_PDI_VERSION = (7, 8, 1)  # as Veronte Ops sends it
VREF_KIND = {"Rvar": 0, "Uvar": 1, "Bvar": 2}  # vref-var type in the PDI (actions.xml)
VREF_CONSTANT = 0xFFFE  # vref-kval: constant source


def var_set_data(kind: str, var_id: int, value: float) -> bytes:
    """``Uint16 mode 0, Uint16 count 1, dst vref (Uint16 type, Uint16 id), src constant (Uint16 0xFFFE, Float32)``."""
    return struct.pack("<HHHH", 0, 1, VREF_KIND[kind], var_id) + struct.pack("<Hf", VREF_CONSTANT, value)


def build_var_set(src: int, dst: int, kind: str, var_id: int, value: float, **kw) -> bytes:
    """SET of configurable #235: destination variable := constant ``value``."""
    payload = struct.pack("<HH", CFG_SET, CFG_VAR_SET) + struct.pack("<HHH", *CFG_PDI_VERSION)
    return build_frame(src, dst, TYPE_CONFIG, payload + var_set_data(kind, var_id, value), **kw)


def parse_var_set_echo(frame: Frame) -> bytes | None:
    """The data of the autopilot's echo of a #235 SET (argument 3), to match it with the request; ``None`` otherwise."""
    if frame.type != TYPE_CONFIG or len(frame.payload) < 10:
        return None
    arg, cfg_id = struct.unpack("<HH", frame.payload[:4])
    if (arg, cfg_id) != (CFG_ECHO, CFG_VAR_SET):
        return None
    return frame.payload[10:]


APP_ID_AUTOPILOT = 3


def status_application_id(frame: Frame) -> int | None:
    """Application ID of a System status (50008) broadcast (3 = autopilot); ``None`` for other frames."""
    if frame.type != TYPE_SYSTEM_STATUS or len(frame.payload) < 7:
        return None
    return frame.payload[
        6
    ]  # Uint16 argument, Uint8 bit data, Uint16 counter, Uint8 status version, Uint8 app id


def status_phase(frame: Frame) -> int | None:
    """Flight phase ID of a System status (50008) with argument 0; ``None`` for other frames / arguments."""
    if frame.type != TYPE_SYSTEM_STATUS or len(frame.payload) < 12:
        return None
    if struct.unpack_from("<H", frame.payload, 0)[0] != 0:
        return None  # other arguments carry another layout (hardware AP: argument 3, 14 bytes)
    return frame.payload[11]  # ... Uint8 app id, Uint32 time (ms), Uint8 phase


def build_discovery(src: int, dst: int) -> bytes:
    """Discovery request (not sent by the app; used by tests and diagnostics)."""
    return build_frame(src, dst, TYPE_DISCOVERY, struct.pack("<HBBHQ", 0, 0, 0, 0, 0))


# --- wire format (proof of the CRC rules) -----------------------------------------------------------------


def build_wire(
    src: int,
    dst: int,
    msg_type: int,
    payload: bytes,
    *,
    ident: int = 0,
    session: int = 0,
    ttl: int = 4,
    ack: bool = True,
    idd_version: int = 32,
    checksum_type: int = 3,
) -> bytes:
    props = make_props(ack, idd_version, checksum_type)
    head = bytearray(
        struct.pack(">BB", 0x45, ttl)
        + struct.pack("<H", ident & 0xFFFF)
        + struct.pack(">BB", session & 0xFF, 0)
        + struct.pack(">HHIIHH", 0, len(payload), src, dst, msg_type, props)
    )
    head[5] = (
        crc32(bytes(head[:5] + head[6:])) & 0xFF
    )  # CRC8 = low byte of CRC-32 over the header without byte 5
    opt = struct.pack(">I", crc32(bytes(head[6:22]) + payload)) if checksum_type == 3 else b""
    return bytes(head) + payload + opt + struct.pack(">I", crc32(payload + opt))


@dataclass(frozen=True)
class Wire:
    session: int
    src: int
    dst: int
    type: int
    props: int
    payload: bytes
    crc8_ok: bool
    optional_ok: bool | None
    crc32_ok: bool


def parse_wire(packet: bytes) -> Wire | None:
    if len(packet) < 26 or packet[0] != 0x45:
        return None
    _res, length, src, dst, typ, props = struct.unpack(">HHIIHH", packet[6:22])
    chk_len = _CHK_LEN[(props >> 6) & 3]
    payload = packet[22 : 22 + length]
    opt = packet[22 + length : 22 + length + chk_len]
    crc = packet[22 + length + chk_len : 26 + length + chk_len]
    optional_ok = None
    if (props >> 6) & 3 == 3:
        optional_ok = opt == struct.pack(">I", crc32(packet[6:22] + payload))
    return Wire(
        session=packet[4],
        src=src,
        dst=dst,
        type=typ,
        props=props,
        payload=payload,
        crc8_ok=(crc32(packet[:5] + packet[6:22]) & 0xFF) == packet[5],
        optional_ok=optional_ok,
        crc32_ok=crc == struct.pack(">I", crc32(payload + opt)),
    )
