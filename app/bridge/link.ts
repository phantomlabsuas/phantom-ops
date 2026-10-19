// Side-effect-free pieces of the bridge's link handling, so they can be tested without sockets (see link.test.ts).
import type { ClientMsg } from "../shared/protocol.ts";
import { CATALOGUE } from "./commands.ts";

/** Validate a parsed WebSocket message from the UI. Anything else is ignored by the bridge. */
export function isClientMsg(m: unknown): m is ClientMsg {
  if (!m || typeof m !== "object" || Array.isArray(m)) return false;
  const o = m as Record<string, unknown>;
  if (o.type === "ackAll") return true;
  if (o.type === "ack") return typeof o.id === "string" && o.id.length < 200;
  if (o.type === "command")
    return typeof o.id === "string" && Object.hasOwn(CATALOGUE, o.id)
      && (o.value === undefined || (typeof o.value === "number" && Number.isFinite(o.value)))
      && (o.stage === undefined || o.stage === "arm" || o.stage === "confirm");
  return false;
}

/** Browsers always send Origin; only the UI's origins may connect. Non-browser local tools send none. */
export function originAllowed(origin: string | undefined, allowed: string[]): boolean {
  return !origin || allowed.includes(origin);
}

/** Whether a frame from `src` should make it the autopilot. The current AP is kept while it is alive and for
 *  `switchMs` after it went silent, so two units on one Link never interleave. */
export function shouldAdoptAp(current: number | null, src: number, msSinceCurrentRx: number | null, aliveMs: number, switchMs: number): boolean {
  if (current === src) return false;
  if (current === null || msSinceCurrentRx === null) return true;
  if (msSinceCurrentRx < aliveMs) return false;
  return msSinceCurrentRx >= switchMs;
}

/** Phase used for command gating: unknown (null) unless confirmed recently by V1 or a System status. */
export function gatingPhase(phase: number | null, msSincePhaseConfirmed: number | null, maxAgeMs: number): number | null {
  return phase !== null && msSincePhaseConfirmed !== null && msSincePhaseConfirmed <= maxAgeMs ? phase : null;
}
