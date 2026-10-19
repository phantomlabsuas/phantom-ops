# User Events – Triggering PDI Button Events

| | |
|---|---|
| **Scope** | Triggering a PDI "button" event on the autopilot with the VCP User Event message (50002): concept, message definition, procedure, safety. |
| **Applies to** | Veronte 1x firmware 7.8.43 (SIL) and 7.8.80 (hardware AP), Phantom Hawk Maintenance PDI (`veronte/Maint PDI/setup/`) |
| **Status** | Verified in SIL, sent directly to the SIL and via Veronte Link's multicast interface. |
| **Related** | `vcp-protocol.md` · `link-architecture.md` · `telemetry-feedback.md` · `pdi-structure.md` |

---

## 1. Concept

- Operator buttons are PDI **events of type 9** (no condition) in `ver_spdif_events.xml`; their names are in `ver_spdif_mevent.xml`.
- The **event ID is the zero-based index** of the event in `events.xml` (`str-tunarray-key`).
- An event has no effect by itself. **Automations** (`ver_spdif_evact.xml`) that use the event as a condition execute **actions** (`ver_spdif_actions.xml`): GPIO switching, variable writes, phase changes, CAN messages.
- Automations may combine the event with other conditions (phase, state bits). The same event can therefore have different effects, or none, depending on the AP state.
- Many buttons are **toggles**: two automations test a state bit and invert it. Each accepted message produces one transition.

## 2. Message definition (50002)

### 2.1 Request

Payload, 8 bytes, little endian:

| Type | Field | Value |
|---|---|---|
| Uint16 | Argument | 0 (other values are ignored) |
| Uint16 | Event ID | PDI event index |
| Uint32 | User RX ID | unique per request; the AP discards duplicates and echoes it in the response |

Header parameters (see `vcp-protocol.md` chapter 4):

| Field | Value |
|---|---|
| Dst | the AP address, determined at run time (`vcp-protocol.md` section 3.2); observed SIL 6041, hardware AP 6248 |
| Src | the application's own address |
| Type | 50002 (`0xC352`) |
| Properties | `0xA0C0` (ACK request, IDD 32, checksum type 3) |
| Len | 8 |

### 2.2 Response

Sent by the AP to the requester's address. Payload, 14 bytes, little endian:

| Type | Field | Meaning |
|---|---|---|
| Uint16 | ACK | 1 = positive acknowledge |
| Uint16 | Event ID | echo of the request |
| Uint32 | User RX ID | echo of the request – used to match request and response |
| Bool16 | Enabled | 1 = the event exists and is enabled |
| Bool16 | User | 1 = the event is a user event |
| Bool16 | Licence | 1 = the AP is licensed for remote telecommand |

The request is **accepted** when ACK = 1, Enabled = 1, User = 1 and Licence = 1. Acceptance means the event was triggered; it does not confirm the effect of the automations.

## 3. Transport

| Path | Endpoint | Framing | Notes |
|---|---|---|---|
| Via Veronte Link (preferred) | multicast `225.200.1.0:51018`, reply on `:51017` | application framing (`link-architecture.md` chapter 4) | works next to Ops; own address |
| Direct to the AP endpoint | SIL UDP `127.0.0.1:56777` (hardware: `10.223.1.102:52000`) | full VCP packet | bypasses Link; reply goes to Link, not to the sender; diagnostics only, not for applications |

## 4. Procedure

1. Identify the event ID by name in the loaded PDI and review the automations that use it (effect, phase conditions, state bit).
2. Read the current state from telemetry where the event is a toggle.
3. Send one User Event with a fresh RX ID.
4. Wait for the response with the same RX ID (timeout ~1 s); evaluate ACK / Enabled / User / Licence.
5. Confirm the effect in telemetry within a timeout (≥ 0.5 s for vector V1).
6. Do not resend after an accepted response: a repeated toggle reverses the state. Resend only when no response was received.

## 5. Safety

- Some button events change the flight phase or start propulsion (e.g. TAKE-OFF, Crank). An application shall expose only events whose automations have been reviewed.
- Events with hazardous effects shall require explicit operator confirmation.
- Commands shall be sent only as the direct result of an operator action.

## 6. Failure modes

| Symptom | Cause |
|---|---|
| No response | Properties carry IDD version 30 instead of 32; or the reply is filtered on the wrong Dst |
| Response with Enabled 0, Licence 0 and an unexpected event ID | Payload encoded big endian |
| Response accepted, no change in telemetry | Automation conditions not met in the current phase, or a block program overrides the state (e.g. nav lights in STANDBY, see `pdi-structure.md`) |
| State inverts twice | Toggle event sent more than once |
| Licence 0 with a valid event | AP lacks the remote-telecommand licence |

## 7. Examples

### 7.1 Event 78 via Veronte Link (application framing, own address 1000, SIL address 6041)

```
Request   00 00 00 08 00 00 03 E8 00 00 17 99 C3 52 A0 C0 | 00 00 4E 00 65 A2 E0 DD | 80 76 0D FF
          Res. Len  Src 1000    Dst 6041    50002 props   | arg 0, event 78, RX ID  | optional checksum
Response  payload 01 00 4E 00 65 A2 E0 DD 01 00 01 00 01 00 (Src 6041, Dst 1000)
```

### 7.2 Event 78 as a full VCP packet (direct to SIL, Src 2)

See `vcp-protocol.md` section 10.1 (request) and 10.2 (response).

### 7.3 Event 78 "NAV LIGHTS SWITCH" in the Phantom Hawk PDI

| Automation | Condition | Actions |
|---|---|---|
| NAV Light Position ON | E78 AND B2199 = 0 | GPIO 1 ON, B2199 := 1 |
| NAV Light Position OFF | E78 AND B2199 = 1 | GPIO 1 OFF, B2199 := 0 |

B2199 is shown in Veronte Ops as *user bit 999* and is reported in telemetry vector V1.

## 8. Button events in the current PDI

| ID | Name | ID | Name |
|---|---|---|---|
| 2 | TAKE-OFF READY Button | 80 | RETURN HOME Button |
| 4 | TAKE-OFF Button | 89 | STROBE LIGHT SWITCH |
| 12 | LANDING Button | 99 | LIDAR PWR SWITCH |
| 14 | HOLD Button | 113 | Generator enable button |
| 16 | HOVER Button | 117 | Crank button |
| 33 | Servo Test button CMD | 144 | Engine Panel Throttle Command |
| 78 | NAV LIGHTS SWITCH | 150 | Clear Sticky Errors button |

Source: Maintenance PDI `veronte/Maint PDI/setup/ver_spdif_events.xml`. The list depends on the PDI; read it from the events file (type 9) rather than hard-coding it.
