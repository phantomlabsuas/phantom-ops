# Veronte 1x PDI – Structure and Interpretation

| | |
|---|---|
| **Scope** | Structure of the Veronte 1x PDI (autopilot configuration exported by *Veronte 1x PDI Builder*): file roles, cross-references, variables, events, automations, actions, phases, block programs, I/O and telemetry definitions. |
| **Applies to** | PDI 7.8 (`ver_spdif_*.xml`, version 7.8.70) – Phantom Hawk Maintenance PDI (`veronte/Maint PDI/`), identical in content to the flight PDI |
| **Status** | Derived from the Phantom Hawk PDI and cross-checked against SIL behaviour. |
| **Related** | `vcp-protocol.md` · `telemetry-feedback.md` · `trigger-buttonevent.md` |

---

## 1. File map

All files are named `ver_spdif_<name>.xml`.

| File | Content |
|---|---|
| `events.xml` | event definitions (type, duration, parameters) |
| `mevent.xml` | event names; variable used by Ops to colour the event button |
| `evact.xml` | automations: condition tree of events → list of actions |
| `mevact.xml` | automation names and groups |
| `actions.xml` | action definitions |
| `maction.xml` | action names |
| `limits.xml` | comparisons "variable > / < constant" used by limit events |
| `mbit.xml`, `muvar.xml`, `mrvar.xml` | names of user Bit, Uint and Real variables |
| `varini.xml` | initial values of user variables |
| `blocks.xml`, `blklibNN.xml` | block programs and block library functions |
| `tm.xml` | telemetry vectors |
| `fmset.xml`, `fmsg_c.xml`, `fmsg_p.xml` | field message sets, consumers, producers (CAN / serial custom messages) |
| `can_in.xml`, `can_out.xml`, `xpccan.xml` | CAN filters, outputs and custom-message routing |
| `gpio.xml`, `pwmdev.xml`, `ecap.xml` | I/O pin configuration |
| `network_config.xml` | AP IP address, net mask, STANAG UDP port |
| `mname.xml` | vehicle name |

## 2. XML conventions

- Each file has a header with `<id>` (configurable ID), `<filename>` and `<version>` (PDI version).
- Arrays are sequences of `str-tunarray-element`. When an element carries `str-tunarray-key="N"`, **N is the index** used by all cross-references (event ID, action ID, automation ID, limit ID).
- A variable reference (`vref-var`) has `type` and `id`; a constant (`vref-kval`) has `type` 65534 and the value in `kval`.

## 3. Variables

### 3.1 Types

| `vref` type | Kind | Prefix | Names |
|---|---|---|---|
| 0 | Real (Float32) | R | `mrvar.xml`; system variables: VCP PDF ch. 5.1 |
| 1 | Uint16 | U | `muvar.xml`; VCP PDF ch. 5.2 |
| 2 | Bit | B | `mbit.xml`; VCP PDF ch. 5.3 |
| 65534 | constant | – | value in `kval` |

### 3.2 ID ranges

| Range | Meaning |
|---|---|
| system IDs | defined by the firmware (e.g. R500 Longitude, R501 Latitude, U1 Current phase identifier, B800–B815 GPIO/PWM read values); names in the VCP PDF only |
| B1200 – B2199 | user Bits; Veronte Ops shows B(1200 + N) as *user bit N* |
| U1000 – U1999 | user Uints |
| R3100 – R4099 | user Reals |

User variables may be unnamed; identify variables by type and ID, not by name.

## 4. Events (`events.xml`)

Event ID = element key. Fields: `type`, `duration` (seconds the condition must hold), `idx`, `indexes` (parameters).

| `type` | Condition | `indexes` |
|---|---|---|
| 1 | current phase is one of the listed phases | phase IDs |
| 2 | all listed limits are true | limit IDs |
| 4 | bit variable = 1 | Bit ID |
| 5 | bit variable = 0 | Bit ID |
| 6 | current mode is one of the listed modes | mode IDs |
| 9 | user / button event – no condition; triggered by the operator or by VCP User Event (50002) | – |
| 12 | user timer elapsed | timer number |

`limits.xml` entries: `variable` (vref), `type` (0 = greater than, 1 = less than), `value`. An equality test is expressed by two limits (e.g. > 0.5 and < 1.5).

## 5. Automations (`evact.xml`)

Each automation has `enabled`, `delay`, a condition tree `node` and a list of action IDs `actions`.

- Condition nodes: `and-or` (`type` 1 = AND, 0 = OR) with `list-nodes`; `not` wrapping a node; leaf `event` with `param` = event ID.
- Automations fire on the **transition** of the condition to true, not continuously.

## 6. Actions (`actions.xml`)

| Element | `idCfg` | Effect |
|---|---|---|
| `acset-gpio` | 221 | GPIO `id` on / off (`id` = I/O number) |
| `acset-var` | 235 | destination variable := source variable or constant |
| `acset-phase` | 222 | change flight phase (`phase-cmd`) |
| `acset-mode` | 220 | change control mode |
| `acset-can-tx` | 182 | send a CAN custom message |
| `acset-uclk` | 224 | start / stop a user timer |
| `acset-detour-cmd` | 193 | detour (hold / hover position) |
| `acset-fmem` | 189 | store a position |
| `acset-step` | 231 | run an operation program |
| `acset-block` | 233 | block command (e.g. trim) |

## 7. Phases

Phase IDs used by phase events, phase-change actions and U1 *Current phase identifier*:

| ID | Phase | ID | Phase |
|---|---|---|---|
| 0 | STANDBY | 7 | NTC |
| 1 | TAKE-OFF | 9 | TAKE-OFF READY |
| 2 | ROUTE | 10 | RETURN HOME |
| 3 | LANDING | 12 | HDG |
| 4 | HOLD | 13 | ARMED |
| 5 | HOVER | 20 | INITIAL |
| 6 | FBX | | |

## 8. Block programs (`blocks.xml`, `blklibNN.xml`)

- Block programs execute every cycle.
- Getters (`rvarget`, `bvarget`, `uvarget`, `mult_*get`) read variables; setters (`rvarset`, `bvarset`, `uvarset`, and `mult_*set` writing `n` consecutive IDs) write them.
- Programs commonly branch on the current phase (`phase` block with a phase → case map).
- **A variable written by a block program is overwritten every cycle** in the phases where that branch executes; external writes and automations that change it have no lasting effect there.
- Before relying on a variable as a command or feedback, list all of its writers (block setters and `acset-var` actions) and the phases in which they run.

## 9. I/O pins (`gpio.xml`)

| Element | I/O | Attributes |
|---|---|---|
| `gpio-pwm000` … `gpio-pwm015` | I/O_0 … I/O_15 | `io` 1 = output, 0 = input · `pu` pull-up · `mux` 1 = peripheral (PWM) · `q` input qualification |
| `gpio-io01` … `gpio-io04`, `gpio-ioA`, `gpio-ioB` | auxiliary GPIO | |

- GPIO action `id` = I/O number.
- Pin read-back: system Bit **B(800 + n)** = *GPIO/PWM (n + 1) read value* = state of I/O_n.

## 10. Telemetry vectors (`tm.xml`)

Each vector defines `fields`, `enable` (Bit ID; 1 = always), `periode` and `address/uav`. Decoding rules and the current vector list: `telemetry-feedback.md`. A variable is readable by a client only if it is part of an enabled vector.

## 11. Custom messages (`fmset.xml`, `fmsg_c.xml`, `fmsg_p.xml`)

`fmset.xml` holds ordered field sets used by CAN / serial custom messages (ECU, PMU, ESC, servo commands and feedback). `fmsg_c` maps incoming messages to field sets (variables written); `fmsg_p` maps field sets to outgoing messages.

## 12. Lookup guide

| Question | Procedure |
|---|---|
| Event ID of a button | name in `mevent.xml` → key; confirm `type` 9 in `events.xml` |
| Effect of a button | automations in `evact.xml` containing the event → their actions |
| Variable holding a button's state | the automation's `acset-var` action; `mevent.xml` colour variable |
| Is a variable overwritten? | setters in `blocks.xml` / `blklib*.xml` and `acset-var` actions; check phase branches |
| Can a client read a variable? | variable present in an enabled vector in `tm.xml` |
| Pin driven by an action | `acset-gpio` id → I/O number → read-back B(800 + id) |

## 13. Phantom Hawk Maintenance PDI – specifics

### 13.0 Source

| Item | Value |
|---|---|
| Location in the repository | `veronte/Maint PDI/setup/` (217 files), `veronte/Maint PDI/operation/` (18 files), `veronte/Maint PDI/xsd/` |
| Used by | the maintenance app (telemetry layouts, event list) and the reference scripts in `veronte/vcp_test/` |
| Relation to the flight PDI | identical file set; the only difference is `ver_spdif_mname.xml` (vehicle name *Maintenance* instead of *Phantom Hawk*). Events, automations, actions, I/O and telemetry vectors are the same, so everything in this chapter applies to both. |

### 13.1 I/O assignment

| I/O | Function | Direction |
|---|---|---|
| I/O_0 | Lidar power (DoodLidPit+) | output |
| I/O_1 | position lights | output |
| I/O_2 | strobe lights | output |
| I/O_3 | throttle PWM to ECU | output (PWM, driven by mixer output *Puller Motor*) |
| I/O_4 | ECU enable | output (switched on in ARMED / TAKE-OFF READY) |
| I/O_5 | PMU crank | output (no action drives it in this PDI) |
| I/O_6 | – | input |
| I/O_7 | safety switch (*Wing disarm switch*) | input, pull-up |

### 13.2 Behaviour relevant to maintenance

| Function | Behaviour |
|---|---|
| Nav lights in STANDBY | block P27 writes R3202 *Nav Lights Auto CMD ON* from library function 11 "3 blinks"; the auto-lights automations follow it, so the lights and B2199 blink continuously |
| Nav lights in TAKE-OFF, TAKE-OFF READY, LANDING | P27 holds R3202 = 1 (lights on) |
| Nav lights in ARMED / INITIAL | no override; the NAV LIGHTS SWITCH event toggles them |
| Strobe lights | auto-ON automation exists, no auto-OFF |
| Servo test | event *Servo Test button CMD* sets B1270; block P29 runs a ~10.5 s sequence; B1270 is never reset by the PDI |

### 13.3 Known issues

| Issue | Location |
|---|---|
| Aileron L temperature feedback is mapped onto the Aileron R variables (R4026, B2126, B2132) | `fmset.xml`, set 67 |
| Nav lights state B2199 has no name | `mbit.xml` |
| No action drives I/O_5 (crank is sent over CAN only) | `actions.xml` |
| I/O_4 is only switched in ARMED / TAKE-OFF READY; no maintenance command | `evact.xml` |
| GPIO read-backs B800–B808 are in V0 since the 2026-10-05 Maintenance PDI. Many other maintenance feedback variables (servo feedback, Raw ADC, ECU / PMU status bits) are not in an enabled telemetry vector; the Maintenance PDI does not change this | `tm.xml` |

## 14. Examples

### 14.1 Toggle button – NAV LIGHTS SWITCH (event 78)

```
events.xml   key 78: type 9                         → button event
events.xml   key 84: type 5, indexes [2199]         → "B2199 = 0"
evact.xml    NAV Light Position ON : E78 AND E84    → actions 36 (GPIO 1 on), 38 (B2199 := 1)
evact.xml    NAV Light Position OFF: E78 AND NOT E84 → actions 35 (GPIO 1 off), 37 (B2199 := 0)
```

### 14.2 Limit-based event – "Nav Lights Auto CMD ON" (event 153)

```
events.xml   key 153: type 2, indexes [94, 95]
limits.xml   key 94: R3202 < 1.5     key 95: R3202 > 0.5      → "R3202 = 1"
```
