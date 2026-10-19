# Variable Write – Setting an Autopilot Variable

| | |
|---|---|
| **Scope** | Setting an autopilot variable to a constant through Veronte Link with the configuration manager (50041), as Veronte Ops does it. |
| **Applies to** | Veronte 1x SIL firmware 7.8.43, Phantom Hawk Maintenance PDI, Veronte Link 7 |
| **Status** | Verified in SIL for bit variables (Bvar) on 2026-10-05: captured from Veronte Ops, then sent by a script and by the app from address 1000. |
| **Related** | `vcp-protocol.md` · `link-architecture.md` · `telemetry-feedback.md` · `pdi-structure.md` |

---

## 1. Concept

A variable set is a SET of configurable **#235 (Variable set)**: destination variable := constant. It is the same command that a PDI `acset-var` action contains (`actions.xml`, `idCfg` 235). The effect is observed in telemetry when the variable is in an enabled vector.

## 2. Message definition (50041)

### 2.1 Request

Application frame to `225.200.1.0:51018`, Type 50041, Dst = autopilot address, Src = the application's own address. Payload, little endian:

| Type | Field | Value |
|---|---|---|
| Uint16 | Argument | 2 = SET |
| Uint16 | Configurable ID | 235 = Variable set |
| Uint16 ×3 | PDI version major, minor, revision | 7, 8, 1 (as Veronte Ops sends it) |
| Uint16 | Mode | 0 |
| Uint16 | Number of entries | 1 |
| Uint16 | Destination type | 2 = Bvar |
| Uint16 | Destination ID | variable ID, e.g. 1241 |
| Uint16 | Source | `0xFFFE` = constant |
| Float32 | Constant value | 1.0 or 0.0 for a bit |

The structure matches the `acset-var` entries of the PDI: `vrset` type 0, one `vars-array` element, `destination` `vref-var` (type, id), `source` `vref-kval` (type 65534, `kval`).

### 2.2 Response

The autopilot answers to the requester's Src within about 30 ms with two messages:

| Message | Content |
|---|---|
| Message Acknowledgement (17000) | sent because the request has the ACK bit set |
| Configuration manager (50041) echo | argument **3**, configurable ID 235, the autopilot's firmware version (7.8.43 in SIL), then the same data as the request |

The echo identifies the command: a client matches it by Dst = own address, Src = autopilot address and identical data.

## 3. Procedure

1. Determine the autopilot address (`vcp-protocol.md` section 3.2).
2. Build the request (section 2.1) with the own address and Properties `0xA0C0`.
3. Send it once to `225.200.1.0:51018`.
4. Wait for the echo (section 2.2). Do not resend automatically.
5. Confirm the effect in telemetry.

Veronte Ops sends the same request with IDD version 30 (Properties `0x9EC0`); the SIL accepts both 30 and 32.

## 4. Verified example: wing arm in SIL

`Wing enable sim CMD` (B1241, user bit 41, vector V1). In the SIL, block program P7 copies it to `Wing disarm switch` (B1243), which drives the arm automations:

| Command | Telemetry (V1) |
|---|---|
| B1241 := 1 in phase STANDBY | B1241 = 1 after ~0.1–0.3 s; phase 13 ARMED ~0.5 s later |
| B1241 := 0 in phase ARMED | B1241 = 0; phase 0 STANDBY ~0.4 s later |
| B1241 := 1 in phase INITIAL | B1241 = 1; phase stays 20 INITIAL |

## 5. Implementation in the app

| Item | Location |
|---|---|
| Codec | `src/phmaint/link/vcp.py`: `build_var_set`, `var_set_data`, `parse_var_set_echo` |
| Sending and matching the echo | `src/phmaint/app/link_service.py`: `LinkService.set_variable` |
| Step type | `var_write` (`src/phmaint/steps/types.py`): button, one bit variable from `procedure/variables.yaml`, value 0 or 1 |
| Bench scripts | `veronte/vcp_test/link_survey/var_set.py` (check / send), `var_watch.py` (telemetry, receive only) |

## 6. Examples

### 6.1 Request captured from Veronte Ops (B1241 := 1, Src 2)

```
00 00 00 18 00 00 00 02 00 00 17 99 C3 79 9E C0      Reserved, Len 24, Src 2, Dst 6041, Type 50041, Props (IDD 30)
02 00 EB 00 07 00 08 00 01 00                        SET, #235, PDI version 7.8.1
00 00 01 00 02 00 D9 04 FE FF 00 00 80 3F            mode 0, 1 entry, Bvar 1241 := constant 1.0
92 31 F9 12                                          checksum
```

### 6.2 Request sent by the app (B1241 := 1, Src 1000)

```
00 00 00 18 00 00 03 E8 00 00 17 99 C3 79 A0 C0 | 02 00 EB 00 07 00 08 00 01 00 | 00 00 01 00 02 00 D9 04 FE FF 00 00 80 3F | 70 03 B0 09
```

### 6.3 Echo from the SIL

```
03 00 EB 00 07 00 08 00 2B 00 | 00 00 01 00 02 00 D9 04 FE FF 00 00 80 3F
echo, #235, firmware 7.8.43   | same data as the request
```
