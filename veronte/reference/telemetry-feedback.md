# Telemetry – Reading Autopilot Variables

| | |
|---|---|
| **Scope** | How autopilot variables are reported in VCP telemetry and how a client decodes them. |
| **Applies to** | Veronte 1x firmware 7.8.43 (SIL) and 7.8.80 (hardware AP), Phantom Hawk Maintenance PDI (`veronte/Maint PDI/setup/ver_spdif_tm.xml`) |
| **Status** | Format and decoding verified on vectors V0 and V1 (SIL). Vector hashes recorded from the SIL and the hardware AP in `procedure/telemetry_hashes.yaml`. |
| **Related** | `vcp-protocol.md` · `link-architecture.md` · `pdi-structure.md` · `trigger-buttonevent.md` |

---

## 1. Principle

- The AP does not answer requests for individual variables. It **streams telemetry vectors** defined in the PDI (`tm.xml`).
- Each enabled vector is sent periodically as a **Telemetry (50020)** message to the AP's partner (Veronte Link), which republishes it to all applications (`link-architecture.md`).
- A client obtains a variable by decoding the vector that contains it.
- **A variable that is not part of an enabled vector cannot be read.** It has to be added to a vector in PDI Builder.

## 2. Vector definition (`tm.xml`)

Each vector entry defines:

| Element | Meaning |
|---|---|
| `fields` | ordered list of fields (variable references) |
| `enable` | Bit variable ID; the vector is sent while this bit is 1 (`1` = always) |
| `periode` | transmission period in seconds |
| `address/uav` | destination address |

Field kinds:

| Kind | Size | Content |
|---|---|---|
| `bit` | 1 bit | Bit variable, 0 / 1 |
| `uinteger16` | 16 bits | Uint variable (`min` / `max` given; 0 … 65535 in this PDI) |
| `real-float32` | 32 bits | Real variable, IEEE-754 single precision; `scale` given (1.0 in this PDI) |
| `pos_abs` | 96 bits | position: 3 × signed Int32 – latitude (1e-8 deg), longitude (1e-8 deg), height (mm) |

## 3. Message format (50020)

Payload, little endian:

| Offset | Type | Field |
|---|---|---|
| 0 | Float32 | timestamp – AP time since start, seconds |
| 4 | Uint32 | hash – CRC of the vector configuration; identifies the vector |
| 8 | bit stream | the vector's fields (chapter 4) |

The payload may be up to one byte longer than the packed field size (padding).

## 4. Field encoding

- Fields are packed **in vector order as one continuous bit stream**, without alignment or padding between fields.
- Stream bit *i* is bit (*i* mod 8) of payload byte 8 + ⌊*i* / 8⌋ (least-significant bit first within each byte).
- A multi-bit field occupies consecutive stream bits; the **first bit is the least-significant bit** of the value.
- `real-float32`: the 32-bit value is reinterpreted as an IEEE-754 float; physical value = float × `scale`.
- `pos_abs`: three consecutive 32-bit values, each interpreted as two's-complement Int32.
- Fields after an odd number of `bit` fields are not byte-aligned and must be extracted from the bit stream.
- NaN is a valid value and indicates an invalid / unset variable.

## 5. Receiving through Veronte Link

An application does not talk to the AP directly. It joins Link's multicast group and receives the telemetry Link republishes (`link-architecture.md`):

| Item | Value |
|---|---|
| Group / port | `225.200.1.0`, receive on `51017` (`SO_REUSEADDR`, membership on interface `127.0.0.1`) |
| Framing | application framing: `Reserved(2) Len(2) Src(4) Dst(4) Type(2) Props(2)`, then the 50020 payload of chapter 3; no sync byte, no CRC |
| Src / Dst | Src = AP address (dynamic, `vcp-protocol.md` section 3.2); Dst = **2** (the AP addresses its partner, Link / Ops). Link publishes it to every application, so filter telemetry on **Src**, not on Dst |
| Nothing to send | Telemetry arrives without any request; an application that only reads never sends |

Observed in SIL (6 s with Ops open): 50020 V0 ≈ 10/s (body 122 bytes), V1 ≈ 6/s (body 418 bytes = 417 + 1 padding), V2 every 2 s (88 bytes); 50022 ≈ 50/s; 50034, 50008 and STANAG 2 / 3 also pass through.

## 6. Decoding procedure

1. Accept messages of Type 50020; in the application framing there is no checksum to check.
2. Read timestamp and hash.
3. Select the vector definition by hash. A hash that matches no loaded vector means the AP runs a different PDI configuration; such messages shall be ignored and the mismatch reported. Vectors shall not be selected by payload size: different configurations can produce the same size. The hash cannot be computed from the PDI; hashes are recorded from the running AP (`procedure/telemetry_hashes.yaml`).
4. Walk the field list with a bit cursor starting at 0; for each field read its bits and advance the cursor by the field size.
5. Store each value by variable reference (kind + ID), never by position.

Vector definitions shall be loaded from the PDI at run time; they shall not be hard-coded.

## 7. Vectors in the Maintenance PDI

| Vector | Period | Enable bit | Destination | Fields | Packed size | Hash |
|---|---|---|---|---|---|---|
| V0 | 0.1 s | always | 2 | 28 | 985 bits → 124 bytes | `0x347392F9` (before the 2026-10-05 PDI: 19 fields, 122 bytes, `0x930456CA`) |
| V1 | 0.167 s | always | 2 | 329 | 3330 bits → 417 bytes | `0xD7463605` |
| V2 | 2.0 s | always | 2 | 23 | 704 bits → 88 bytes | `0x1E9BC63C` |
| V3 | 1.0 s | B1249 *One time message request* | 2 | 8 | 128 bits → 16 bytes | – |
| V4 | 0.1 s | B1248 *Test Flight* | 2 | 67 | 1834 bits → 230 bytes | – |
| V5 | 0.1 s | B1254 | 2 | 19 | 362 bits → 46 bytes | – |
| V6 | 0.303 s | B1265 | 7000 | 127 | 3872 bits → 484 bytes | – |
| V7 | 0.05 s | B1265 | 7000 | 334 | 3334 bits → 417 bytes | – |

Vector numbering follows the order in `tm.xml`. Hashes are those observed from the SIL running this configuration; they change whenever a vector's configuration changes.

Content summary:

| Vector | Content |
|---|---|
| V0 – navigation + GPIO | GPIO/PWM read values B800–B808 (I/O_0 … I/O_8 pin read-backs; added at the end of V0 in the 2026-10-05 Maintenance PDI), R3 Heading, R6 Yaw, R500 Longitude, R501 Latitude, R502 Height WGS84, R7 Pitch, R8 Roll, R1100 Lidar 1 distance, R103 / R107 / R108 desired heading / pitch / roll, R2 Ground speed, U80 Detour calculation id, 6 × position (FIDs 28674–28679). Angles and latitude / longitude in radians. All fields byte-aligned. |
| V1 – status | U0, U1 *Current phase identifier*, U201, U203, B2199 (nav lights state, user bit 999), B2198 strobe state, B1243 wing disarm switch, U1003 LIDAR STATE, U1004 LIDAR AUTO MODE, B60 External I2C device 0, link status, ESC / ECU / PMU status (226 bits, 86 reals, 16 uints, 1 position). |
| V2 – temperatures and fuel | pitot / ECU / PMU / servo temperatures, fuel level, quantity, remaining. |
| V3–V5 | software version, test-flight and passenger-AP data; sent only while their enable bit is 1. |
| V6–V7 | addressed to 7000; contain among others the GPIO read-backs B801 / B805 / B807, B1300, B1604, R3222. Not sent while B1265 = 0. |

## 8. Client guidelines

- Feedback latency = vector period + transport delay. For V1, evaluate a state change only after several periods (≥ 0.5 s).
- Distinguish software state flags from physical read-backs: e.g. B2199 is set by the nav-light automations; the pin read-back of I/O_1 is B801 (*GPIO/PWM 2 read value*).
- Variables required for maintenance feedback that are not in V0–V2 should be added to an always-enabled vector (or a dedicated maintenance vector with its own enable bit).

## 9. Examples

### 9.1 Latitude / longitude (V0)

R500 and R501 are fields 3 and 4 of V0 and are byte-aligned: payload bytes 16–19 and 20–23, little-endian Float32.
SIM values: R500 = 0.95362 rad (54.64° E), R501 = 0.42699 rad (24.46° N).

### 9.2 Start of a V1 payload

```
5C C3 01 45 | 05 36 46 D7 | 00 00 | 0D 00 | 00 00 | 00 00 | 02 …
timestamp 2076.21 s | hash 0xD7463605 | U0 = 0 | U1 = 13 (ARMED) | U201 = 0 | U203 = 0 | bit fields …
```

### 9.3 State change after a user event (SIM, phase ARMED)

```
t = 0.13 s   V1: B2199 = 0, U1 = 13
t = 3.38 s   User Event response: ACK 1, event 78, enabled 1, user 1, licence 1
t = 3.53 s   V1: B2199 = 1
```
