// Messages between the bridge (Node) and the UI (browser), over one local WebSocket.
// Variables use the "R3502" / "U1005" / "B1243" / "P28674" notation (see veronte/integration-guide.md §5.3).

export type VarValue = number | [number, number, number] | null; // null = NaN (invalid / unset)

export interface VarSample {
  v: VarValue;
  /** AP time of the telemetry message, seconds since AP start */
  t: number;
  /** local receive time, ms since epoch */
  rx: number;
  /** period of the telemetry vector that carries it, ms (for staleness) */
  p: number;
}

export interface LinkStatus {
  socketOpen: boolean;
  socketError: string;
  apAddress: number | null;
  /** any frame from the AP within the last second */
  apAlive: boolean;
  /** the always-on telemetry vector that carries the alert bits (V1) arrived within the last second */
  telemetryAlive: boolean;
  apLastRx: number | null;
  apUptimeMs: number | null;
  phase: number | null;
  pcsAlive: boolean;
  pdiProfile: string | null;
  vehicleName: string | null;
  unknownHashes: string[];
  /** messages per second by kind: "V0", "V1", "V2", "status", "total" */
  rates: Record<string, number>;
  commandsAllowed: boolean;
  ownAddress: number;
  videoUrl: string;
  videoReachable: boolean | null;
  /** ms since epoch when the aircraft left a ground phase; null on ground */
  flightStart: number | null;
  /** true when the bridge started while airborne, so flightStart is a lower bound */
  flightStartPartial: boolean;
  /** ms since epoch when the current phase was entered (null if the bridge started in it) */
  phaseSince: number | null;
}

export type AlertLevel = 1 | 2 | 3 | 4;
export type Segment = "ENG" | "FUEL" | "ELEC" | "LIFT" | "NAV" | "LINK" | "AP" | "GCS";

export interface AlertState {
  id: string;
  text: string;
  level: AlertLevel;
  segment: Segment;
  var?: string;
  since: number;
  acked: boolean;
  inhibited: boolean;
  inhibitReason?: string;
  /** the alert's variable is no longer fresh: the alert is held (not cleared) and shown as unconfirmed */
  stale?: boolean;
}

export interface AlertSummary {
  active: AlertState[];
  /** alerts that cannot be evaluated (e.g. PCS alerts without PCS telemetry) */
  noData: number;
  /** activations since the bridge started */
  historyCount: number;
}

export type CommandId =
  | "armWing" | "disarmWing" | "motorsArm" | "motorsDisarm" | "takeoffReady" | "takeoff"
  | "hold" | "rth" | "land" | "iasMin" | "iasCrs" | "iasMax" | "navLights" | "altSet" | "fuelSet";

export type CommandPhase = "armed" | "sent" | "acknowledged" | "executed" | "rejected" | "no-reply" | "not-executed" | "blocked";

export interface CommandState {
  seq: number;
  id: CommandId;
  label: string;
  phase: CommandPhase;
  detail?: string;
  t: number;
}

export type ServerMsg =
  | { type: "hello"; status: LinkStatus; vars: Record<string, VarSample>; alerts: AlertSummary; command: CommandState | null; names: Record<string, string> }
  | { type: "names"; names: Record<string, string> }
  | { type: "vars"; vars: Record<string, VarSample> }
  | { type: "status"; status: LinkStatus }
  | { type: "alerts"; alerts: AlertSummary }
  | { type: "command"; command: CommandState };

export type ClientMsg =
  | { type: "ack"; id: string }
  | { type: "ackAll" }
  /** Hazardous commands (HOLD, RTH, LAND) need stage "arm" then "confirm" 0.4–4 s later; the bridge enforces it. */
  | { type: "command"; id: CommandId; value?: number; stage?: "arm" | "confirm" };

/** Command confirmation window enforced by the bridge (and mirrored by the UI). */
export const CONFIRM_MIN_MS = 400;
export const CONFIRM_MAX_MS = 4000;

export const PHASES: Record<number, string> = {
  0: "STANDBY", 1: "TAKE-OFF", 2: "ROUTE", 3: "LANDING", 4: "HOLD", 5: "HOVER", 6: "FBX", 7: "NTC",
  9: "TAKE-OFF READY", 10: "RETURN HOME", 12: "HDG", 13: "ARMED", 20: "INITIAL",
};

/** Phases in which the aircraft is on the ground (used for alert inhibits and the flight timer). */
export const GROUND_PHASES = new Set([0, 9, 13, 20]);
