// Alert evaluation (safety core). Definitions come from config/alerts.json (draft taxonomy, L1-L4).
// Rules from CLAUDE.md: acknowledging does not clear an alert; inhibits are by flight phase and never silent;
// engine-out is always L4 and audible; planned engine stops do not alarm.
// Stale data never clears an alert: an active alert whose variable stops updating is held, keeps its
// acknowledgement and is marked stale; a "telemetry lost" alert says why. Only fresh data can clear an alert.
import { readFileSync } from "node:fs";
import type { AlertLevel, AlertState, AlertSummary, Segment, VarSample } from "../shared/protocol.ts";
import { GROUND_PHASES } from "../shared/protocol.ts";

interface AlertDef {
  id: string; var: string; device: number; triggerOn: number; text: string;
  level: AlertLevel; segment: Segment; delayMs: number; inhibit?: "ground";
}

export interface AlertContext {
  now: number;
  get: (key: string) => VarSample | undefined;
  /** true when the variable was received recently enough to trust */
  fresh: (key: string) => boolean;
  phase: number | null;
  /** an AP has been identified since the bridge started */
  apSeen: boolean;
  /** any frame from the AP within the liveness window */
  apAlive: boolean;
  /** the vector carrying the alert bits (V1) arrived within the liveness window */
  telemetryAlive: boolean;
  unknownLayout: boolean;
}

interface Track { since: number | null; activeSince: number | null; acked: boolean }

export class AlertEngine {
  private defs: AlertDef[];
  private tracks = new Map<string, Track>();
  private history = 0;
  private lastJson = "";

  constructor(pathOrDefs: string | AlertDef[]) {
    this.defs = typeof pathOrDefs === "string" ? (JSON.parse(readFileSync(pathOrDefs, "utf-8")).alerts as AlertDef[]) : pathOrDefs;
  }

  private track(id: string): Track {
    let t = this.tracks.get(id);
    if (!t) { t = { since: null, activeSince: null, acked: false }; this.tracks.set(id, t); }
    return t;
  }

  /** Advance with a known condition. Returns the activation time while active, else null. */
  private step(id: string, cond: boolean, delayMs: number, now: number): number | null {
    const t = this.track(id);
    if (!cond) { t.since = null; t.activeSince = null; t.acked = false; return null; }
    if (t.since === null) t.since = now;
    if (t.activeSince === null && now - t.since >= delayMs) { t.activeSince = now; this.history++; }
    return t.activeSince;
  }

  /** Condition unknown (stale / missing data): hold an active alert, abandon a pending onset. */
  private hold(id: string): number | null {
    const t = this.track(id);
    if (t.activeSince === null) t.since = null;
    return t.activeSince;
  }

  evaluate(c: AlertContext): AlertSummary {
    const active: AlertState[] = [];
    let noData = 0;
    const onGround = c.phase === null || GROUND_PHASES.has(c.phase);

    const push = (id: string, text: string, level: AlertLevel, segment: Segment, since: number,
                  opts: { v?: string; inhibitReason?: string; stale?: boolean } = {}) => {
      const t = this.track(id);
      active.push({ id, text, level, segment, var: opts.v, since, acked: t.acked,
                    inhibited: !!opts.inhibitReason, inhibitReason: opts.inhibitReason, stale: opts.stale || undefined });
    };

    for (const d of this.defs) {
      if (d.device !== 0) { noData++; continue; } // PCS telemetry is not decoded in v0
      const s = c.get(d.var);
      const known = !!s && c.fresh(d.var) && typeof s.v === "number" && Number.isFinite(s.v);
      const since = known ? this.step(d.id, s!.v === d.triggerOn, d.delayMs, c.now) : this.hold(d.id);
      if (since === null) continue;
      const inhibit = d.inhibit === "ground" && onGround ? "on ground" : undefined;
      push(d.id, d.text, d.level, d.segment, since, { v: d.var, inhibitReason: inhibit, stale: !known });
    }

    // ---- derived alerts -----------------------------------------------------------------------------------
    // Like catalogue alerts, a derived alert whose inputs are unknown (stale V1, no phase) is held, not cleared.
    const n = (k: string) => { const s = c.get(k); return s && typeof s.v === "number" && Number.isFinite(s.v) && c.fresh(k) ? s.v : null; };
    const derived = (id: string, text: string, level: AlertLevel, segment: Segment, v: string, cond: boolean | null, delayMs: number, inhibitReason?: string) => {
      const since = cond === null ? this.hold(id) : this.step(id, cond, delayMs, c.now);
      if (since !== null) push(id, text, level, segment, since, { v, inhibitReason, stale: cond === null });
    };
    const fwBit = n("B1212"), transBit = n("B1214");
    const engState = n("U1005"), rpm = n("R3499"), ecuComm = n("B1060");
    const airborne = c.phase !== null && !GROUND_PHASES.has(c.phase);
    // The ICE must run in fixed-wing flight and in transition. LANDING is the planned-stop window (VTOL landing
    // cuts the engine), so an engine alert there is listed as inhibited, never hidden.
    let eoCond: boolean | null, euCond: boolean | null;
    if (!c.telemetryAlive || c.phase === null || fwBit === null || transBit === null) { eoCond = null; euCond = null; }
    else if (!(airborne && (fwBit === 1 || transBit === 1))) { eoCond = false; euCond = false; }
    else if (ecuComm !== 1 || engState === null) { eoCond = null; euCond = true; }   // ECU silent: state unknown
    else { eoCond = engState !== 2 || (rpm !== null && rpm < 1500); euCond = false; }
    const landing = c.phase === 3 ? "LANDING: planned engine stop" : undefined;
    derived("engine-out", "ENGINE OUT", 4, "ENG", "U1005", eoCond, 1000, landing);
    derived("engine-unknown", "Engine state unknown (no ECU data)", 3, "ENG", "B1060", euCond, 1000, landing);

    // One link alert whose text gives the reason, so a change of reason (no frames at all / frames but no status
    // telemetry) does not re-annunciate or flap when only the 4 s System status still arrives.
    const linkDown = c.apSeen && (!c.apAlive || !c.telemetryAlive);
    const lk = this.step("ap-link", linkDown, 0, c.now);
    if (lk !== null) push("ap-link", !c.apAlive ? "Autopilot no report" : "Status telemetry lost (V1): alerts not updating", 3, "LINK", lk);

    const tl = this.step("tm-layout", c.unknownLayout, 0, c.now);
    if (tl !== null) push("tm-layout", "Telemetry layout unknown (PDI mismatch)", 1, "AP", tl);

    active.sort((a, b) => Number(a.inhibited) - Number(b.inhibited) || b.level - a.level || b.since - a.since);
    return { active, noData, historyCount: this.history };
  }

  /** Forget every alert (used when a different autopilot is adopted). The activation counter is kept. */
  reset(): void { this.tracks.clear(); this.lastJson = ""; }

  ack(id: string): void { const t = this.tracks.get(id); if (t && t.activeSince !== null) t.acked = true; }
  ackAll(): void { for (const t of this.tracks.values()) if (t.activeSince !== null) t.acked = true; }

  /** true when the summary differs from the last one returned by this method */
  changed(s: AlertSummary): boolean {
    const j = JSON.stringify(s);
    if (j === this.lastJson) return false;
    this.lastJson = j;
    return true;
  }
}
