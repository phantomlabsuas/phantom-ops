# Phantom OPS ↔ Veronte – Integration Guide

| | |
|---|---|
| **Scope** | How Phantom OPS receives autopilot data from Veronte Link and sends commands to the Veronte 1x autopilot, so the Fly view can run on live data instead of the mockup's simulated tick. |
| **Applies to** | Veronte 1x firmware 7.8.43 (SIL) / 7.8.80 (Phantom Hawk AP), Veronte Link 7, Veronte Ops 7.8.76, Phantom Hawk flight PDI 7.8.70 (`phantomhawk-pdi/UAV-1xVeronte`) |
| **Built from** | The verified protocol notes in [`reference/`](reference/) (from `phantomhawk-maint/docs/Veronte`), the Veronte Ops `Operational.vws` layout and the flight PDI. Written 2026-10-16. |
| **Status** | Protocol facts are verified (see each reference doc's status line). Items marked **⚠ verify** are inferences that have not been tested yet. |

---

## 1. The data path

```
 Phantom Hawk AP (10.223.1.102:52000)  ─┐   one at a time
 or SIL (127.0.0.1:56777)              ─┤
                                        ▼
                               Veronte Link 7  (router, no VCP address)
                     ┌──────────────────┴──────────────────┐
     multicast 225.200.1.0 on 127.0.0.1           WebSocket hub TCP 53779
     Link → apps  :51017   apps → Link :51018     (HIL, PDI Builder)
          │                       ▲
          ▼                       │
  ┌───────────────────────────────┴──────┐        Veronte Ops 7.8 (address 2)
  │ Phantom OPS bridge (own address)      │        stays usable side by side
  │  frame codec · AP discovery           │
  │  telemetry decoder · variable store   │
  │  command service (50002 / 50041)      │
  │  alert evaluation                     │
  └──────────────┬────────────────────────┘
                 │  WebSocket / JSON (local)
                 ▼
        Phantom OPS UI (React + MapLibre)
```

Key facts:

- **Phantom OPS never talks to the AP directly.** It joins Link's multicast group and receives a copy of every AP packet; it sends commands to the group, and Link forwards them. Never bind or send to `12345`, `56777` or `52000` ([link-architecture §6.3](reference/link-architecture.md)).
- The application interface is **the same for SIL and hardware**: one code path, the AP address is the only difference.
- **Veronte Ops can run at the same time.** Both apps receive everything, and both can command. Show who commanded what (see §6.5).
- **A browser cannot open UDP multicast sockets.** The UI therefore needs a small local process (the "bridge") that owns the sockets. This bridge is also the natural home for the safety-critical core (commands, alert logic) that CLAUDE.md asks to keep separate from the UI. Connecting the browser straight to Link's WebSocket hub (`ws://127.0.0.1:53779`, same application framing) may work but is not verified for third-party clients and would put command logic in the UI. **⚠ verify** before relying on it.

## 2. Addresses and devices

| Node | VCP address | How to know it |
|---|---|---|
| Phantom Hawk AP | dynamic, per unit. Observed: SIL `6041`, hardware `6248` | Src of System status (50008) with application ID 3, or a Discovery reply ([vcp-protocol §3.2](reference/vcp-protocol.md)). Re-acquire on every reconnect. |
| PCS (ground Veronte unit) | `9999` in the Operational layout (was `4283` before 2026-07-06) | configured, from the Ops layout (`vRefIO.uavAddress = 9999`) |
| Mission computer | `1708` | configured |
| Veronte Ops | `2` | fixed. The AP sends its telemetry with Dst 2. |
| Maintenance app | `1000` | fixed in that app |
| **Phantom OPS** | **choose a dedicated one, e.g. `1100`**; keep it configurable | must not be 2 or 1000, so that replies are not confused with Ops or the maintenance app |

Rules:

- Filter telemetry on **Src**, not Dst. The AP addresses telemetry to 2, and Link republishes it to everyone.
- Replies to Phantom OPS commands come back with **Dst = Phantom OPS's address**.
- **⚠ verify:** the PCS is also a Veronte unit. If it also broadcasts System status with application ID 3, "first 50008 with app ID 3" could pick the PCS. Exclude the configured PCS address (9999) when choosing the AP, or confirm the AP with Discovery (hardware version 6 / variant 3 for the Phantom Hawk AP).

## 3. Application framing

Every datagram on the group is one VCP packet without its first 6 bytes and final CRC32 ([link-architecture §4](reference/link-architecture.md)):

| Offset | Size | Field | Byte order |
|---|---|---|---|
| 0 | 2 | Reserved (0) | big |
| 2 | 2 | Len (payload bytes) | big |
| 4 | 4 | Src | big |
| 8 | 4 | Dst | big |
| 12 | 2 | Type | big |
| 14 | 2 | Properties | big |
| 16 | Len | Payload | **little endian** for private messages (> 50000) |
| 16 + Len | 0 / 4 | Optional checksum: CRC-32 (zlib) over bytes 0 … 15 + Len, when Properties bits 6–7 = 3 | big |

- Properties for Phantom OPS commands: **`0xA0C0`** = ACK request, IDD version **32**, checksum type 3. IDD 30 is silently dropped by the hardware AP.
- AP packets arrive with Properties `0x2000` (no optional checksum).
- A working Python codec exists: [`reference/phmaint-link/vcp.py`](reference/phmaint-link/vcp.py) (`build_frame`, `parse_frame`, `build_user_event`, `build_var_set`, …), with its socket code in [`transport.py`](reference/phmaint-link/transport.py).

### 3.1 Socket setup (bridge)

Receive: UDP socket, `SO_REUSEADDR`, bind `0.0.0.0:51017`, `IP_ADD_MEMBERSHIP` 225.200.1.0 on interface 127.0.0.1.
Send: UDP socket, `IP_MULTICAST_IF` = 127.0.0.1, `IP_MULTICAST_TTL` = 1, `IP_MULTICAST_LOOP` = 1, send to `225.200.1.0:51018`.
Opening the sockets sends nothing; an app that only reads never transmits.

## 4. Receiving

### 4.1 Message types Phantom OPS needs

| Type | Name | Use in Phantom OPS | Rate (hardware AP) |
|---|---|---|---|
| 50008 | System status | AP address, **AP liveness**, flight phase (payload byte 11 for argument 0) without any telemetry | ~46 /s |
| 50020 | Telemetry | **all live values**: one message per enabled vector (§4.2) | V0 10 Hz, V1 6 Hz, V2 0.5 Hz |
| 50002 | User Event reply | command acknowledgement (§5.1) | on demand |
| 50041 | Configuration manager echo | variable-set acknowledgement (§5.2) | on demand |
| 17000 | Message Acknowledgement | sent before the 50041 echo | on demand |
| 50001 | Discovery reply | firmware version, hardware version, AP address. Can arrive twice on the radio network: de-duplicate by Src. | on demand |
| 50034, 50021, 50022 | Comm. statistics, complementary telemetry, telemetry on demand | not decoded yet. 50034 probably holds link quality for the LINK segment. **⚠ verify** the payloads. | high |

### 4.2 Decoding telemetry (50020)

Payload: `Float32 timestamp (AP seconds) · Uint32 hash · bit stream` ([telemetry-feedback](reference/telemetry-feedback.md)).

1. Look up the **hash** in [`telemetry-hashes.yaml`](telemetry-hashes.yaml). Flight PDI: V0 `0x930456CA`, V1 `0xD7463605`, V2 `0x1E9BC63C`. An unknown hash means the AP runs another PDI: ignore the packet and raise a "telemetry layout outdated" advisory. Never pick a vector by payload size.
2. Walk the vector's fields with a bit cursor. The stream is LSB-first: stream bit *i* = bit (*i* mod 8) of byte 8 + ⌊*i*/8⌋. Fields are packed without padding. Bits are 1 bit, Uint 16, Real 32 (IEEE float × scale, scale 1.0 here), Position 96 (3 × Int32: lat 1e-8°, lon 1e-8°, height mm).
3. Store every value under its **device + variable key** (`6248:R3502`), with the AP timestamp and the local receive time. Never store by position.
4. **NaN is a real value**: it means the variable is invalid or unset. Show it as invalid, not as 0.

The field list of every vector, with bit offsets, is in [`generated/telemetry-vectors.csv`](generated/telemetry-vectors.csv). Load it from the PDI at run time (`tm.xml`) rather than hard-coding it. [`reference/phmaint-link/pdi.py`](reference/phmaint-link/pdi.py) and [`telemetry.py`](reference/phmaint-link/telemetry.py) do exactly this.

### 4.3 Vectors of the flight PDI

| Vector | Period | Sent when | Content (summary) | Fields / size |
|---|---|---|---|---|
| **V0** | 0.1 s | always | navigation: heading R3, yaw R6, pitch R7, roll R8, lat R501, lon R500, height R502, lidar R1100, desired heading / pitch / roll R103 / R107 / R108, ground speed R2, detour id U80, 6 positions (P28674–P28679) | 19 / 122 B |
| **V1** | 0.167 s | always | status: phase U1, flying FW / multi / transition B1212–B1214, links B1310–B1314, engine / ECU / PMU / ESC values and status bits, IAS, altitude, knobs, sticks, lights, alerts bits | 329 / 417 B |
| **V2** | 2 s | always | temperatures, fuel level / mass / remaining, GNSS satellite counts, QNH | 23 / 88 B |
| V3 | 1 s | B1249 *One time message request* | software version U1040–U1046, UAV hardware address U95 | 8 |
| V4 | 0.1 s | B1248 *Test Flight* | test-flight data | 67 |
| V5 | 0.1 s | B1254 *Enable passenger telemetry* | passenger-AP data | 19 |
| V6, V7 | 0.3 / 0.05 s | B1265 *Enable FDR Telemetry*, Dst 7000 | FDR data, servo current feedback R4018–R4023, B1300 | 127 / 334 |

**Every variable the Operational layout reads, except 15, is in V0–V2.** Those 15 are only in conditional vectors (V3–V7). See [ops-layout-data-map §5](ops-layout-data-map.md#5-gaps-and-risks).

### 4.4 Units and value conventions

- Angles and latitude / longitude are in **radians** (R3, R6–R8, R500, R501, R3177, R3303).
- Positions in `pos_abs` fields are 1e-8 degrees and millimetres.
- The `unit` numbers in the Ops layout (`vRefIO.unit`, e.g. 17, 10, 334) are Veronte Ops display-unit codes. Their table is not available here.
- **⚠ verify:** Ops colour bands (`dataRange`) may be in Ops display units (for example ft or °C after conversion), not raw telemetry units. Check each band against raw values before reusing it as a limit in Phantom OPS.
- Phase IDs (U1 and System status): 0 STANDBY, 1 TAKE-OFF, 2 ROUTE, 3 LANDING, 4 HOLD, 5 HOVER, 6 FBX, 7 NTC, 9 TAKE-OFF READY, 10 RETURN HOME, 12 HDG, 13 ARMED, 20 INITIAL.

### 4.5 Staleness and liveness

Each value carries its age. Suggested rules (draft):

| Signal | Stale after | UI effect |
|---|---|---|
| any AP packet / 50008 | 1 s | top bar link to "AP NO REPORT", all AP values greyed |
| V0 | 3 × 0.1 s | attitude and map symbol marked stale |
| V1 | 3 × 0.167 s | health strip segments marked stale (never "green" while stale) |
| V2 | 3 × 2 s | fuel and temperatures marked stale |
| PCS (Src 9999) packets | 1 s | "GCS NO REPORT" |

The Ops layout implements "NO REPORT" with its *No report group* on U95. Phantom OPS should use packet age instead.

## 5. Sending commands

Phantom OPS has **two command primitives**. Both go to `225.200.1.0:51018`, Dst = AP address, Src = own address, Properties `0xA0C0`.

### 5.1 Trigger a PDI button event – User Event (50002)

Request payload (8 bytes, LE): `Uint16 0 · Uint16 event ID · Uint32 RX ID` (fresh, unique per request).
Reply (14 bytes, LE): `Uint16 ACK · Uint16 event ID · Uint32 RX ID echo · Bool16 enabled · Bool16 user · Bool16 licence`.

- Accepted only when ACK = Enabled = User = Licence = 1. Match the reply by RX ID.
- **Accepted means "triggered", not "done".** The PDI automations that use the event check their own conditions (phase, state bits). If those are not met, nothing happens. Confirm in telemetry.
- **Never auto-resend after an accepted reply.** Many events are toggles, so a second send reverses the first. Resend only if no reply arrived (timeout ~1 s).
- Full rules: [trigger-buttonevent](reference/trigger-buttonevent.md). The events of the flight PDI and what they do: [`generated/pdi-button-events.csv`](generated/pdi-button-events.csv).

### 5.2 Set a variable – Configuration manager (50041), configurable #235

Request payload (LE): `Uint16 2 (SET) · Uint16 235 · Uint16 7, 8, 1 (PDI version) · Uint16 0 (mode) · Uint16 1 (entries) · Uint16 dest type · Uint16 dest ID · Uint16 0xFFFE (constant) · Float32 value`.
Dest type uses the **PDI vref encoding**: 0 = Real, 1 = Uint, 2 = Bit.
Reply: 17000 Message Acknowledgement, then a 50041 echo with argument 3 and the same data.

- Verified in SIL for bit variables ([variable-write](reference/variable-write.md)). **Real write verified 2026-10-17:**
  R3183 *Fuel Quantity Input* := 5.0 was echoed, held, and the PDI's R3215 *Fuel Remaining Calculated* followed.
  Earlier test (2026-10-16) (Phantom OPS v0, R3173 := 100 from address 1100: 50041 echo with identical data). The value did not stick on the ground because a PDI block rewrites R3173. Uint writes are still **⚠ to verify**.
- A variable that a PDI block program writes every cycle cannot be changed this way in the phases where that block runs ([pdi-structure §8](reference/pdi-structure.md)). Check the writers before exposing a variable as a command.

### 5.3 Two encodings of the variable kind

| Kind | Ops layout `systemVar`, `tm.xml` `<type>`, Ops `getVar(kind, id)` | PDI `vref-var` (events, limits, actions), 50041 dest type |
|---|---|---|
| Real (R) | 0 | 0 |
| Uint (U) | 2 | 1 |
| Bit (B) | 3 | 2 |
| Position (P) | 10 | – |

Use the `R3502` / `U1005` / `B1243` notation inside Phantom OPS and convert only at the edges.

### 5.4 Command lifecycle → the mockup's Sent › Acknowledged › Executed chips

| Chip | Condition | Timeout → state |
|---|---|---|
| **Sent** | datagram written to the socket | – |
| **Acknowledged** | 50002 reply accepted (RX ID match), or 50041 echo with identical data | ~1 s → "No reply". Offer a resend for non-toggles only. |
| **Executed** | the expected telemetry change, e.g. U1 = 4 after HOLD, B2199 flipped after NAV LIGHTS | per command, ≥ 0.5 s for V1 values (e.g. 2 s for phase changes) → "Not executed", with the likely reason (automation condition not met in this phase) |
| Rejected | ACK, Enabled, User or Licence = 0 | show which flag: "event disabled", "no telecommand licence", … |

### 5.5 Command safety rules

From the reference docs and CLAUDE.md:

1. Send only as the direct result of an operator action. Nothing on start-up, reconnect or timer.
2. Expose only events whose automations have been reviewed. Events that change phase or start propulsion (TAKE-OFF, LANDING, Crank, Motors arm) need explicit confirmation: hold-to-confirm or a second tap, as the mockup does for HOLD and RTB.
3. Show command ownership. Veronte Ops (address 2) and Phantom OPS can both command. Phantom OPS can see its own replies but not Ops' commands, so only the telemetry effect shows an Ops command.
4. Treat every command as *requested* until telemetry confirms it.

## 6. Proposed bridge structure

```
bridge/
  transport      multicast rx/tx (or loopback for tests, replay of captures)
  codec          application framing, 50002 / 50041 / 50008 / 50001 builders and parsers
  pdi            load tm.xml (vectors), events.xml + evact.xml + actions.xml (what a button does)
  telemetry      hash table → vector → decode → VariableStore
  store          latest value + AP timestamp + receive time per device:variable; staleness
  signals        semantic mapping, from config: eng.rpm = R3499, fuel.level_l = R3400, phase = U1, …
  alerts         Phantom OPS alert model (L0–L4, inhibits by phase) evaluated on signals
  commands       User Event / Variable set, RX-ID matching, lifecycle, confirmation gate, audit log
  api            WebSocket to the UI: snapshot + deltas of signals, alerts, command states
```

- Keep `signals` (the variable ↔ meaning map) in a **data file**, not in code. The PDI changes, and a new variable or vector should be a config edit. Start from the tables in [ops-layout-data-map](ops-layout-data-map.md).
- Record every received datagram with a timestamp, for replay in tests and for SITL scenario runs. The SIL and HIL setup already exists on the ground PC ([link-architecture §2](reference/link-architecture.md)).
- The reference Python package ([`reference/phmaint-link/`](reference/phmaint-link/)) covers transport, codec, PDI loading and telemetry decoding, and has been tested against SIL and the hardware AP. Port or reuse it. It is a copy; the maintained original is in `phantomhawk-maint/src/phmaint/link/`.

A minimal shape for the UI side of the API (TypeScript sketch):

```ts
type VarKey = `${"R" | "U" | "B" | "P"}${number}`;           // "R3502"
interface Sample { v: number | [number, number, number] | null; // null = NaN / invalid
                   apTime: number; rxTime: number; stale: boolean; }
interface Snapshot { ap: { address: number | null; alive: boolean; phase: number | null; fw?: string };
                     pcs: { alive: boolean };
                     vars: Record<string /* "6248:R3502" */, Sample>; }
type CommandState = "sent" | "acknowledged" | "executed" | "rejected" | "no-reply" | "not-executed";
type CommandRequest = { kind: "event"; eventId: number } | { kind: "set"; var: VarKey; value: number };
```

## 6.1 Launch sequence in the PDI (SIL, verified 2026-10-17 with Phantom OPS v0.1)

| Step | How | PDI guard (automation) | Result |
|---|---|---|---|
| STANDBY → ARMED | Bit set B1241 *Wing enable sim CMD* := 1 (a block copies it to the wing switch B1243 in SIM mode, B1226 = 1; on hardware B1243 comes from the physical switch, pin B807) | A40 *STANDBY to ARMED* | phase 13 in 0.9 s |
| Motors armed | Bit set B1236 *SIM KNOBS MOTORS ARM CMD* := 1 (copied to B1232 *KNOBS MOTORS ARM CMD*; on hardware the knob box) | — | B1232 = 1 |
| ARMED → TAKE-OFF READY | User Event 2 | A1: phase ARMED, limits 10/64 (−0.5 < R507 < 0.2 for 0.5 s), B1232 = 1, B1246 = 1. Falls back to ARMED after 30 s (A65, event 67 duration) | phase 9 |
| TAKE-OFF READY → TAKE-OFF | User Event 4 | A2: phase TAKE-OFF READY, mode 0, B1263 *Motors sync OK* = 1 | phase 1, vertical climb; A39 switches to HOVER at about 50 m AGL (user timer 0) |
| LANDING | User Event 12 | A6: phase in TAKE-OFF/HOVER/RETURN HOME/NTC/HOLD/HDG/ROUTE, mode 0 | touchdown, then ARMED (A91) |
| Disarm | B1236 := 0, then B1241 := 0 | A55 *Wing Disarm to STANDBY* | STANDBY |

Do not disarm in flight: A55's first clause also applies outside ARMED / TAKE-OFF READY. Phantom OPS only accepts the
disarm commands in ground phases.

Observed on the wire (2026-10-16): System status 50008 arrives every **4.0 s** from the SIL (not 2.5 s); the V1 payload
carries one padding byte (418 B for 3330 bits); `pos_abs` values cannot be 1e-8° units (54.6° E does not fit an int32),
so their meaning is unverified; 50021 / 50022 use the same `time + hash` header as 50020.

## 7. Checklist before the first live connection

Status 2026-10-16, Phantom OPS v0 against the SIL (see `app/README.md`): items 1–3 and 6 done, item 4 replaced by an
IAS-mode command (MIN then CRUISE, both executed), item 5 done for the echo. **The SIL runs the Maintenance PDI**
(V0 hash `0x347392F9`), so the bridge selects the PDI per vector hash.


- [ ] Bridge joins the group and shows 50008 from the AP with Veronte Ops closed **and** open.
- [ ] V0, V1 and V2 hashes match `telemetry-hashes.yaml`. If they don't, re-record them and update the file.
- [ ] Phase from 50008 equals U1 from V1.
- [ ] A harmless event (NAV LIGHTS SWITCH, 78) in SIL: reply accepted, B2199 flips in V1, a second press flips it back.
- [ ] A Real variable set in SIL (e.g. R3177 *Knobs HDG cmd*), confirmed by an echo and in V1. **First test of Real writes.**
- [ ] Phantom OPS's own address does not collide with Ops (2), the maintenance app (1000), the PCS or the mission computer.
