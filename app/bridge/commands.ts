// Command service (safety core): catalogue, gating, sending and the Sent › Acknowledged › Executed lifecycle.
// Rules (veronte/integration-guide.md §5.5): only on operator action, never auto-resend, hazardous commands need
// a confirmation the bridge enforces (arm, then confirm 0.4–4 s later), a command is "requested" until telemetry
// confirms it. Each command is also gated by AP whitelist, flight phase and (for SIM bits) SIM mode.
import { randomInt } from "node:crypto";
import type { CommandId, CommandState, VarSample } from "../shared/protocol.ts";
import { CONFIRM_MAX_MS, CONFIRM_MIN_MS, GROUND_PHASES, PHASES } from "../shared/protocol.ts";
import { buildUserEvent, buildVarSet, parseUserEventReply, parseVarSetEcho, varSetData, type Frame } from "./vcp.ts";
import { findButtonEvent, type Pdi } from "./pdi.ts";

type Expect =
  | { var: string; eq: number }
  | { var: string; toggle: true }
  | { var: string; near: true; tol: number };

interface Def {
  label: (v?: number) => string;
  event?: string;                                  // PDI button-event name
  set?: { kind: "R" | "U" | "B"; id: number; min: number; max: number; fixed?: number };
  expect: Expect;
  executeMs: number;
  confirm?: boolean;                               // needs arm + confirm
  phases?: number[];                               // allowed flight phases (bridge-side gate)
  require?: { var: string; eq: number; why: string };
}

const GROUND = [...GROUND_PHASES];
const AIRBORNE = Object.keys(PHASES).map(Number).filter((p) => !GROUND_PHASES.has(p));
const SIM_ONLY = { var: "B1226", eq: 1, why: "SIM mode only (B1226 Simulation Enable = 0)" };

// Phase IDs and guards from the PDI automations (veronte/ops-layout-data-map.md, pdi-button-events.csv).
export const CATALOGUE: Record<CommandId, Def> = {
  // Launch sequence. In the SIL the wing safety switch and the knob box are simulated by SIM bits that a PDI block
  // copies into B1243 / B1232; on hardware these are physical switches, so these two commands are SIM-only.
  armWing:      { label: () => "ARM (wing enable, SIM)", set: { kind: "B", id: 1241, min: 0, max: 1, fixed: 1 },
                  expect: { var: "U1", eq: 13 }, executeMs: 3000, confirm: true, phases: [0], require: SIM_ONLY },
  disarmWing:   { label: () => "DISARM (wing, SIM)", set: { kind: "B", id: 1241, min: 0, max: 1, fixed: 0 },
                  expect: { var: "U1", eq: 0 }, executeMs: 3000, phases: [13, 9], require: SIM_ONLY },
  motorsArm:    { label: () => "MOTORS ARM (knob, SIM)", set: { kind: "B", id: 1236, min: 0, max: 1, fixed: 1 },
                  expect: { var: "B1232", eq: 1 }, executeMs: 2000, confirm: true, phases: [13], require: SIM_ONLY },
  motorsDisarm: { label: () => "MOTORS DISARM (knob, SIM)", set: { kind: "B", id: 1236, min: 0, max: 1, fixed: 0 },
                  expect: { var: "B1232", eq: 0 }, executeMs: 2000, phases: GROUND, require: SIM_ONLY },
  takeoffReady: { label: () => "TAKE-OFF READY", event: "TAKE-OFF READY Button", expect: { var: "U1", eq: 9 }, executeMs: 3000, confirm: true, phases: [13] },
  takeoff:      { label: () => "TAKE-OFF", event: "TAKE-OFF Button", expect: { var: "U1", eq: 1 }, executeMs: 3000, confirm: true, phases: [9] },
  // Flight
  // Phases mirror the PDI guards (A7 HOLD: NTC/HDG/ROUTE or RETURN HOME; A13 RTH: HOLD/NTC/HDG/ROUTE/HOVER; A6 LANDING).
  hold:      { label: () => "HOLD", event: "HOLD Button", expect: { var: "U1", eq: 4 }, executeMs: 3000, confirm: true, phases: [7, 12, 2, 10] },
  rth:       { label: () => "RETURN HOME", event: "RETURN HOME Button", expect: { var: "U1", eq: 10 }, executeMs: 3000, confirm: true, phases: [4, 7, 12, 2, 5] },
  land:      { label: () => "LAND", event: "LANDING Button", expect: { var: "U1", eq: 3 }, executeMs: 3000, confirm: true, phases: [1, 5, 10, 7, 4, 12, 2] },
  iasMin:    { label: () => "IAS MIN", event: "SET IAS CMD MODE MINIMUM", expect: { var: "U1002", eq: 1 }, executeMs: 2000 },
  iasCrs:    { label: () => "IAS CRUISE", event: "SET IAS CMD MODE NOMINAL", expect: { var: "U1002", eq: 0 }, executeMs: 2000 },
  iasMax:    { label: () => "IAS MAX", event: "IAS CMD MODE MAXIMUM BUTT", expect: { var: "U1002", eq: 2 }, executeMs: 2000 },
  navLights: { label: () => "NAV LIGHTS", event: "NAV LIGHTS SWITCH", expect: { var: "B2199", toggle: true }, executeMs: 2000 },
  // On the ground a PDI block rewrites R3173 with the current MSL, so the altitude target is airborne-only.
  altSet:    { label: (v) => `ALT ${v ?? "?"} m`, set: { kind: "R", id: 3173, min: 0, max: 15000 },
               expect: { var: "R3173", near: true, tol: 0.5 }, executeMs: 2000, phases: AIRBORNE },
  // Fuel quantity entered by the operator (Ops "Fuel Quantity Input" slider, 0–7.5 L). R3183 is in V2 (2 s period).
  fuelSet:   { label: (v) => `FUEL ${v?.toFixed(1) ?? "?"} L`, set: { kind: "R", id: 3183, min: 0, max: 7.5 },
               expect: { var: "R3183", near: true, tol: 0.05 }, executeMs: 5000, phases: GROUND },
};

interface Pending {
  state: CommandState;
  watching?: boolean;
  rxId?: number;
  echo?: Buffer;
  value?: number;
  before: number | null;
  sentAt: number;
  ackTimer?: NodeJS.Timeout;
  execTimer?: NodeJS.Timeout;
}

export interface CommandDeps {
  ownAddress: number;
  allowed: number[];
  apAddress: () => number | null;
  pdi: () => Pdi | null;
  phase: () => number | null;
  get: (key: string) => VarSample | undefined;
  fresh: (key: string) => boolean;
  send: (datagram: Buffer) => void;
  publish: (s: CommandState) => void;
  now?: () => number;
}

export class CommandService {
  private seq = 0;
  private awaiting: Pending | null = null;      // waiting for the AP's reply
  private watches = new Set<Pending>();         // acknowledged, waiting for telemetry to confirm
  private late = new Set<Pending>();            // timed out without a reply; a late reply is still reported
  private armed = new Map<CommandId, number>(); // confirm-type commands armed at (ms)
  last: CommandState | null = null;

  constructor(private d: CommandDeps) {}

  private now() { return this.d.now ? this.d.now() : Date.now(); }

  allowed(): boolean {
    const ap = this.d.apAddress();
    return ap !== null && this.d.allowed.includes(ap) && this.d.pdi() !== null;
  }

  private emit(state: CommandState, phase: CommandState["phase"], detail?: string): CommandState {
    const s = { ...state, phase, detail, t: this.now() };
    this.last = s;
    this.d.publish(s);
    return s;
  }

  private num(key: string): number | null {
    const s = this.d.get(key);
    return s && typeof s.v === "number" && Number.isFinite(s.v) && this.d.fresh(key) ? s.v : null;
  }

  /** Reasons a command may not be sent right now, or null. */
  private gate(def: Def, value: number | undefined): string | null {
    const ap = this.d.apAddress();
    if (ap === null) return "no autopilot";
    if (!this.d.allowed.includes(ap)) return `commands to AP ${ap} not allowed (config)`;
    if (!this.d.pdi()) return "autopilot PDI not identified";
    const phase = this.d.phase();
    if (def.confirm && phase === null) return "flight phase unknown";
    if (def.phases && (phase === null || !def.phases.includes(phase)))
      return `not available in ${phase === null ? "unknown phase" : PHASES[phase] ?? `phase ${phase}`}`;
    if (def.require) {
      const v = this.num(def.require.var);
      if (v !== def.require.eq) return def.require.why;
    }
    if (def.set && def.set.fixed === undefined) {
      if (value === undefined || !Number.isFinite(value) || value < def.set.min || value > def.set.max)
        return `value out of range ${def.set.min}–${def.set.max}`;
    }
    if (def.event && findButtonEvent(this.d.pdi()!, def.event) === null) return `event "${def.event}" not in ${this.d.pdi()!.name}`;
    if ("toggle" in def.expect && this.num(def.expect.var) === null) return `${def.expect.var} state unknown (telemetry stale)`;
    return null;
  }

  request(id: CommandId, value?: number, stage?: "arm" | "confirm"): void {
    if (!Object.hasOwn(CATALOGUE, id)) return;
    const def = CATALOGUE[id];
    const state: CommandState = { seq: ++this.seq, id, label: def.label(def.set?.fixed ?? value), phase: "sent", t: this.now() };
    const why = this.gate(def, value);
    if (why) { this.armed.delete(id); this.emit(state, "blocked", why); return; }

    if (def.confirm) {
      const t = this.now();
      if (stage === "arm") { this.armed.set(id, t); this.emit(state, "armed", "tap again to confirm"); return; }
      const at = this.armed.get(id);
      this.armed.delete(id);
      if (stage !== "confirm" || at === undefined) { this.emit(state, "blocked", "confirmation required"); return; }
      if (t - at < CONFIRM_MIN_MS) { this.emit(state, "blocked", "confirmed too quickly (double-click?)"); return; }
      if (t - at > CONFIRM_MAX_MS) { this.emit(state, "blocked", "confirmation expired"); return; }
    }

    if (this.awaiting && this.now() - this.awaiting.sentAt < 1000) { this.emit(state, "blocked", "previous command awaiting reply"); return; }

    const ap = this.d.apAddress()!;
    const pdi = this.d.pdi()!;
    const p: Pending = { state, value: def.set?.fixed ?? value, before: this.num(def.expect.var), sentAt: this.now() };
    let datagram: Buffer;
    if (def.event) {
      p.rxId = randomInt(1, 0xffffffff);
      datagram = buildUserEvent(this.d.ownAddress, ap, findButtonEvent(pdi, def.event)!, p.rxId);
    } else {
      const v = p.value!;
      p.echo = varSetData(def.set!.kind, def.set!.id, v);
      datagram = buildVarSet(this.d.ownAddress, ap, def.set!.kind, def.set!.id, v);
    }
    try { this.d.send(datagram); } catch (e) { this.emit(state, "blocked", `send failed: ${(e as Error).message}`); return; }
    const prev = this.awaiting;
    if (prev) {   // replaced before its reply timer ran: give it a verdict instead of leaving it at "sent"
      clearTimeout(prev.ackTimer);
      prev.state = this.emit(prev.state, "no-reply", "replaced by a newer command before a reply");
    }
    this.awaiting = p;
    p.state = this.emit(state, "sent");
    p.ackTimer = setTimeout(() => {
      if (this.awaiting !== p) return;
      this.awaiting = null;
      p.state = this.emit(p.state, "no-reply", "no reply within 1 s · watching telemetry");
      this.late.add(p);                                  // a late reply is still reported
      setTimeout(() => this.late.delete(p), 4000);
      this.watch(p, p.sentAt, "no AP reply; confirmed by telemetry");   // the effect may still happen
    }, 1000);
  }

  /** Feed every frame from the AP. Frames whose optional checksum fails are ignored. */
  onFrame(f: Frame): void {
    if (f.dst !== this.d.ownAddress || f.checksumOk === false) return;
    for (const lp of this.late) {                   // reply after the 1 s timeout
      const r = lp.rxId !== undefined ? parseUserEventReply(f) : null;
      const e = lp.echo ? parseVarSetEcho(f) : null;
      if ((r && r.rxId === lp.rxId) || (e && lp.echo && e.equals(lp.echo))) {
        this.late.delete(lp);
        const ok = !r || (r.ack === 1 && r.enabled === 1 && r.user === 1 && r.licence === 1);
        lp.state = this.emit(lp.state, ok ? "acknowledged" : "rejected", ok ? "late reply" : "late reply: rejected");
        if (ok && !lp.watching) this.watch(lp);
        return;
      }
    }
    const p = this.awaiting;
    if (!p) return;
    if (p.rxId !== undefined) {
      const r = parseUserEventReply(f);
      if (!r || r.rxId !== p.rxId) return;
      this.settle(p);
      if (r.ack === 1 && r.enabled === 1 && r.user === 1 && r.licence === 1) { p.state = this.emit(p.state, "acknowledged"); this.watch(p); }
      else p.state = this.emit(p.state, "rejected", [r.ack !== 1 && "NACK", r.enabled !== 1 && "event disabled", r.user !== 1 && "not a user event", r.licence !== 1 && "no telecommand licence"].filter(Boolean).join(", "));
    } else if (p.echo) {
      const e = parseVarSetEcho(f);
      if (!e || !e.equals(p.echo)) return;
      this.settle(p);
      p.state = this.emit(p.state, "acknowledged");
      this.watch(p);
    }
  }

  private settle(p: Pending) { clearTimeout(p.ackTimer); if (this.awaiting === p) this.awaiting = null; }

  private target(p: Pending, ex: Expect): number | undefined { return "eq" in ex ? ex.eq : "near" in ex ? p.value : undefined; }

  private watch(p: Pending, from?: number, okDetail?: string) {
    if (p.watching) return;
    p.watching = true;
    const def = CATALOGUE[p.state.id];
    const ex = def.expect;
    const ackAt = from ?? this.now();
    const tgt = this.target(p, ex);
    const matches = (v: number) => ("eq" in ex ? v === ex.eq : "near" in ex ? tgt !== undefined && Math.abs(v - tgt) <= ex.tol : false);
    // Already in the requested state before the command: say so instead of claiming the command did it.
    if (tgt !== undefined && p.before !== null && matches(p.before)) {
      const v = this.num(ex.var);
      if (v !== null && matches(v)) { p.state = this.emit(p.state, "executed", "already in this state"); return; }
    }
    let toggleSeen = 0, lastRx = 0;
    this.watches.add(p);
    const check = () => {
      const s = this.d.get(ex.var);
      const fresh = !!s && s.rx > ackAt && typeof s.v === "number" && this.d.fresh(ex.var);
      let ok = false;
      if (fresh) {
        const v = s!.v as number;
        if ("toggle" in ex) {   // the new value must hold for two distinct telemetry samples
          if (s!.rx !== lastRx) { lastRx = s!.rx; toggleSeen = p.before !== null && v !== p.before ? toggleSeen + 1 : 0; }
          ok = toggleSeen >= 2;
        }
        else ok = matches(v);
      }
      if (ok) { this.watches.delete(p); p.state = this.emit(p.state, "executed", okDetail); return; }
      if (this.now() - ackAt > def.executeMs) {
        this.watches.delete(p);
        const why = "eq" in ex && ex.var === "U1" ? "phase did not change: PDI conditions not met in this phase" : `${ex.var} did not change as expected`;
        p.state = this.emit(p.state, "not-executed", why);
        return;
      }
      p.execTimer = setTimeout(check, 100);
    };
    check();
  }

  /** Stop all timers (tests, shutdown). */
  dispose() {
    if (this.awaiting) clearTimeout(this.awaiting.ackTimer);
    for (const w of this.watches) clearTimeout(w.execTimer);
    this.watches.clear();
    this.awaiting = null;
  }
}
