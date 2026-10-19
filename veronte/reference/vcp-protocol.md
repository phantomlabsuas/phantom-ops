# VCP / Embention STANAG Protocol – Reference

| | |
|---|---|
| **Scope** | Wire protocol between ground software and the Veronte 1x autopilot (AP): transport, addressing, packet format, integrity, message catalogue. |
| **Applies to** | Veronte 1x firmware 7.8.43 (SIL) and 7.8.80 (Phantom Hawk hardware AP), PDI 7.8, Veronte Link 7 |
| **Primary source** | *Veronte Autopilot 1x VCP 7.6.39/1.0* (Embention, PDF) |
| **Status** | Chapters 3–7 verified against live traffic (SIL). With the hardware AP: transport, addressing (chapter 3), Discovery, System status and telemetry verified. |
| **Related** | `link-architecture.md` · `telemetry-feedback.md` · `trigger-buttonevent.md` · `pdi-structure.md` |

Where the PDF and observed behaviour differ, this document follows observed behaviour; the differences are listed in chapter 9.

---

## 1. Terms

| Term | Meaning |
|---|---|
| AP | Autopilot – the Veronte 1x unit or the SIL that simulates it |
| SIL | Software-in-the-loop autopilot (`VeronteConsole__sil`) |
| VCP | Veronte Communication Protocol – Embention's implementation of STANAG 4586 (AEP-84 Vol. II) with private extensions |
| CUCS | Core UAV Control System – the ground control station role (Veronte Ops) |
| Veronte Link | Ground-side router between the AP and all PC applications |
| Address | 32-bit VCP node address carried in the Src / Dst header fields |
| Private message | Embention message type > 50000 |
| IDD version | Interface definition version carried in the Properties field |

## 2. Transport

- VCP packets are carried over **UDP**, one packet per datagram.
- The AP exchanges packets with **one configured partner** – normally Veronte Link. Everything the AP sends (telemetry, replies, acknowledgements) goes to that partner regardless of who sent the request.
- PC applications other than Link reach the AP **through Link's application interface** (multicast group, see `link-architecture.md`). Link forwards app traffic to the AP and republishes every AP packet to all apps.

| Setup | AP endpoint | AP partner endpoint |
|---|---|---|
| SIM (SIL) | SIL, UDP `127.0.0.1:56777` | Veronte Link, UDP `12345` |
| Hardware | `10.223.1.102`, UDP `52000` (from PDI `network_config.xml`) | Veronte Link, UDP `52000` on the PC's Ethernet address on the radio network (`10.223.10.150`) |

The AP-side endpoints are used by Veronte Link only. Applications use Link's application interface (`225.200.1.0:51017` / `:51018`), which is the same with the SIL and with the hardware AP.

## 3. Addressing

### 3.1 Node addresses

| Node | Address | Notes |
|---|---|---|
| Autopilot | **dynamic, per unit** (section 3.2). Observed: SIL `6041` (`0x00001799`), Phantom Hawk hardware AP `6248` (`0x00001868`) | Dst of all commands; Src of all AP packets |
| Veronte Ops (CUCS) | **2** | |
| Other applications | own address, e.g. **1000** | Replies are addressed to the requester's Src |
| Broadcast | `0xFFFFFFFF` | |

- Veronte Link has no address of its own on the data path; it routes by address.
- An application shall use its own address and shall not reuse Ops' address 2.
- The AP address is a property of the unit, not of the PDI or the ground setup. Applications shall not hard-code it.

### 3.2 Determining the autopilot address

The AP publishes its address in three places. All three are available on Link's application interface (multicast group); no access to the AP-side endpoint is needed.

| Source | Where the address is | Requires sending |
|---|---|---|
| Any AP packet | header **Src** | no |
| System status (50008, section 7.5) | header **Src**; payload also carries application ID and flight phase | no – broadcast periodically by the AP (section 7.5) |
| Discovery reply (50001, section 7.1) | header **Src** and the **physical address** field of the Product UID | yes – one Discovery request |

Procedure for a client application:

1. Join the Link multicast group and wait for a System status (50008) packet. Take the AP address from its Src and confirm the AP application ID (payload field *Application ID* = 3).
2. Alternatively, or to obtain firmware version and product data, send a Discovery request with **Dst `0xFFFFFFFF`** and the application's own Src. Each AP replies to the requester's Src; take the address from the reply's Src (equal to the Product UID physical address).
3. Use the address as Dst for all later commands. Re-acquire it when the connection is re-established, because a different unit may be connected.

Notes:

- On the hardware radio network the same Discovery reply may arrive twice (direct path and radio relay, see `link-architecture.md`). Replies shall be de-duplicated by Src.

## 4. Packet format

A packet consists of **Header (22 bytes) + Payload (1–528 bytes) + Optional checksum (0, 2 or 4 bytes) + CRC32 (4 bytes)**.

### 4.1 Header

| Offset | Size | Field | Byte order | Value / meaning |
|---|---|---|---|---|
| 0 | 1 | Sync | – | `0x45` |
| 1 | 1 | Flags | – | bits 0–5 TTL (shall be > 0); bit 6 reserved; bit 7 encrypted (0) |
| 2 | 2 | Ident | **little endian** | packet timestamp / counter (free value) |
| 4 | 1 | Session | – | sender session ID |
| 5 | 1 | CRC8 | – | header checksum (chapter 5) |
| 6 | 2 | Reserved | big | 0 |
| 8 | 2 | Len | big | payload length in bytes |
| 10 | 4 | Src | big | sender address |
| 14 | 4 | Dst | big | receiver address |
| 18 | 2 | Type | big | message type (chapter 6) |
| 20 | 2 | Properties | big | section 4.2 |

### 4.2 Properties

| Bits | Field | Values |
|---|---|---|
| 0–5 | reserved | 0 |
| 6–7 | checksum type | 0 = none · 1 = 2-byte sum · 2 = 4-byte sum · 3 = 4-byte CRC-32 |
| 8–14 | IDD version | **32** |
| 15 | ACK request | 1 = receiver shall acknowledge |

Recommended values for commands: `0xA0C0` (ACK request, IDD 32, checksum type 3) or `0x20C0` (same without ACK request). The AP sends `0x2000`.

### 4.3 Payload byte order

- Header fields are big endian (except Ident).
- **Payloads of private messages are little endian.**
- Standard STANAG messages may contain big-endian fields; check each message definition.

### 4.4 Recommended header values for client applications

| Field | Value |
|---|---|
| TTL | 4 |
| Ident | incrementing counter or millisecond timestamp |
| Session | `0xA0` |
| Src | the application's own address |
| Properties | `0xA0C0` |

## 5. Integrity

All checksums use **CRC-32/ISO-HDLC** (as in zlib and Ethernet): polynomial `0x04C11DB7` (reflected `0xEDB88320`), initial value `0xFFFFFFFF`, input and output reflected, final XOR `0xFFFFFFFF`.

| Checksum | Computed over | Stored as |
|---|---|---|
| CRC8 | header bytes 0–4 and 6–21 (the whole header except the CRC8 byte) | lowest byte of the CRC-32 |
| Optional checksum (type 3) | header bytes 6–21 + payload | 4 bytes, big endian |
| CRC32 | payload + optional checksum (payload only when there is no optional checksum) | 4 bytes, big endian |

Order of computation: header with CRC8 = 0 → CRC8 → optional checksum → CRC32.
A receiver shall verify CRC8 and CRC32 and discard packets that fail.

## 6. Message catalogue

| Type | Name | Direction | Use |
|---|---|---|---|
| 1 | CUCS Authorization Request | CUCS → broadcast | periodic (5 s) |
| 2 | VSM Authorization Response | AP → CUCS | reply to type 1 |
| 3 | Vehicle ID | AP → CUCS | |
| 17000 | Message Acknowledgement | AP → requester | sent for requests with the ACK bit |
| 50001 | Discovery | app ↔ AP | identification, firmware version, licence (section 7.1) |
| 50002 | User Event | app → AP, reply AP → requester | triggers a PDI event (section 7.2) |
| 50008 | System status | AP → broadcast | SIL ~0.25 Hz; hardware AP ~46 /s (section 7.5) |
| 50020 | Telemetry | AP → partner | one message per enabled telemetry vector (section 7.3) |
| 50021 | Complementary telemetry | AP → partner | observed with the hardware AP |
| 50022 | Telemetry on demand | AP → partner | ~50 Hz in SIM |
| 50034 | Communication statistics | AP → broadcast | SIL ~1 Hz; hardware AP ~180 /s |
| 50041 | Configuration manager | app → AP, echo AP → requester | SET (section 7.4) |
| 50044 | Simulated navigation | HIL → AP | SIM only |

## 7. Message definitions

### 7.1 Discovery (50001)

Request payload (14 bytes, little endian):

| Type | Field | Value |
|---|---|---|
| Uint16 | Argument | 0 |
| Uint8 | Version minor | 0 |
| Uint8 | Version major | 0 |
| Uint16 | GPS week | 0 or current |
| Uint64 | Time of week | 0 or current (2⁻³² ms units) |

Response payload (little endian), leading fields:

| Type | Field | Value / meaning |
|---|---|---|
| Uint16 | Argument | 1 |
| Uint8, Uint8 | Version minor, major | 1, 0 |
| Uint16 | Application ID | 3 = autopilot application (PDF Table 4.5) |
| Uint16 ×3 | Firmware major, minor, revision | |

Response payload, trailing 8 bytes (Product UID):

| Type | Field | Value / meaning |
|---|---|---|
| Uint8 | Application ID | 3 = autopilot |
| Uint8 | Hardware version | Phantom Hawk AP: 6 |
| Uint8 | Variant | Phantom Hawk AP: 3 |
| Uint8 | Reserved | 0 |
| Uint32 | Physical address | AP address (equals the reply's Src) |

A Discovery with Dst `0xFFFFFFFF` is answered by the AP to the requester's Src; it serves to find the AP address (section 3.2).

### 7.2 User Event (50002)

Triggers a PDI event of type 9 ("button"). Full definition, procedure and safety rules: `trigger-buttonevent.md`.

### 7.3 Telemetry (50020)

Periodic vectors defined in the PDI. Payload format and decoding: `telemetry-feedback.md`.

### 7.4 Configuration manager (50041)

Observed (SIL): a SET sent every 10 s from Src 2 with payload (little endian) `Uint16 argument` = 2 (SET), `Uint16 configurable ID` = 187, PDI version `Uint16 major, minor, revision` = 7, 8, 1, followed by the configurable data.

Variable set (configurable #235) is verified in SIL for bit variables; message layout, echo and procedure: `variable-write.md`.

### 7.5 System status (50008)

Broadcast by the AP. Observed rates: SIL ~0.25 Hz; hardware AP ~46 /s with argument 0 (59-byte payload) and ~0.5 /s with argument 3 (14-byte payload). Payload (little endian), leading fields for argument 0:

| Type | Field | Value / meaning |
|---|---|---|
| Uint16 | Argument | 0 |
| Uint8 | Bit data | status flags |
| Uint16 | Counter | increments per message |
| Uint8 | Status version | |
| Uint8 | Application ID | 3 = autopilot |
| Uint32 | Time | AP uptime in ms |
| Uint8 | Phase | current flight phase ID (`pdi-structure.md`, Phases) |
| Uint8 | Mode | |

Use: AP address (header Src), presence / liveness of the AP, and current phase without requiring a telemetry vector.

## 8. Rules for client implementations

1. Use IDD version 32, checksum type 3 and the application's own Src address.
2. Set the ACK bit when a reply is required; match replies by content (e.g. the RX ID echo of 50002), not by arrival order.
3. Treat a command as *requested* until telemetry confirms its effect.
4. Determine the AP address at run time (section 3.2); keep own address configurable.
5. Send to the AP only through Veronte Link's application interface while Link is running.

## 9. Deviations from the PDF

| PDF | Observed |
|---|---|
| Example packet in section 4.6.1 | Final CRC32 is wrong; chapter 5 rules reproduce real packets byte-for-byte. |
| CRC32 "across just the payload bytes" | Only without optional checksum; with checksum type 3 it covers payload + optional checksum. |
| IDD version "shall be 32" | Correct for the AP. Packets with version 30 are discarded without reply. |
| Payload byte order not stated | Private-message payloads are little endian. |

## 10. Examples

### 10.1 User Event request on the wire (event 78, Src 2)

```
Header   45 04 00 CF A0 5B 00 00 00 08 00 00 00 02 00 00 17 99 C3 52 A0 C0
Payload  00 00 4E 00 96 81 57 29        argument 0, event 78, RX ID 0x29578196
OptChk   2E 39 DC A8                    CRC-32(header[6..21] + payload)
CRC32    7F A5 7F AD                    CRC-32(payload + OptChk)
```

### 10.2 User Event response on the wire (AP → Src 2)

```
Header   45 03 80 CE 01 5E 00 00 00 0E 00 00 17 99 00 00 00 02 C3 52 20 00
Payload  01 00 4E 00 96 81 57 29 01 00 01 00 01 00
CRC32    47 40 13 EC                    no optional checksum (Properties 0x2000)
```

### 10.3 Discovery response, leading and trailing payload bytes

SIL:

```
01 00 | 01 00 | 03 00 | 07 00 08 00 2B 00 | …
arg 1 | version 0.1 | application 3 | firmware 7.8.43
```

Phantom Hawk hardware AP:

```
01 00 | 01 00 | 03 00 | 07 00 08 00 50 00 | … | 03 | 06 | 03 | 00 | 68 18 00 00
arg 1 | version 0.1 | application 3 | firmware 7.8.80 | … | app 3 | hw 6 | variant 3 | res. | physical address 6248
```

### 10.4 Address discovery through the Link multicast group

Application frame (Link framing, `link-architecture.md` chapter 4) sent to `225.200.1.0:51018`, own address 1000:

```
00 00 00 0E 00 00 03 E8 FF FF FF FF C3 51 A0 C0      Reserved, Len 14, Src 1000, Dst 0xFFFFFFFF, Type 50001, Props
00 00 00 00 00 00 00 00 00 00 00 00 00 00            Discovery request, all fields 0
81 7A 57 27                                          checksum
```

Observed with the hardware AP: two replies, Type 50001, Src 6248, Dst 1000, firmware 7.8.80, Product UID physical address 6248. System status (50008) on the group: Src 6248, application ID 3, phase 20 (INITIAL).
