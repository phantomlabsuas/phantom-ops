// Read helpers: live values with staleness, and display formatting. Variable meanings: veronte/ops-layout-data-map.md.
import { useStore } from "./store.ts";
import type { VarSample } from "../../shared/protocol.ts";

export const RAD = 180 / Math.PI;

/** Same freshness rule as the bridge: several vector periods, at least 1 s. */
export const isFresh = (s: VarSample | undefined, now: number) => !!s && now - s.rx < Math.max(4 * (s.p || 500), 1000);

/** Live numeric value, or null when missing, invalid (NaN) or stale. */
export function useNum(key: string): number | null {
  const s = useStore((st) => st.vars[key]);
  const now = useStore((st) => st.now);
  return s && typeof s.v === "number" && isFresh(s, now) ? s.v : null;
}

export function useBit(key: string): boolean | null {
  const v = useNum(key);
  return v === null ? null : v === 1;
}

export const fmt = (v: number | null | undefined, d = 0, unit = ""): string =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : `${v.toFixed(d)}${unit ? ` ${unit}` : ""}`;

export const hdg3 = (rad: number | null): string => {
  if (rad === null) return "—";
  const d = Math.round(((rad * RAD) % 360 + 360) % 360) % 360;
  return `${String(d).padStart(3, "0")}°`;
};

export const hms = (ms: number | null): string => {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

export const hm = (hours: number | null): string => {
  if (hours === null || !Number.isFinite(hours) || hours < 0) return "—";
  const m = Math.round(hours * 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
};

export const ENGINE_STATE: Record<number, string> = { 0: "OFF", 1: "WARM UP", 2: "RUNNING" };
export const PMU_MODE: Record<number, string> = { 0: "DISABLED", 1: "STOP", 2: "NOT GEN", 3: "BEEP", 4: "CRANKING", 5: "GENERATING", 6: "AUGMENTING" };
export const GNSS_FIX: Record<number, string> = { 0: "NO FIX", 1: "DR", 2: "2D", 3: "3D", 4: "GNSS+DR", 5: "TIME" };
export const IAS_MODE: Record<number, string> = { 0: "CRUISE", 1: "MIN", 2: "MAX", 3: "MANUAL" };

/** Fuel tank capacity in litres: the range of the Ops "Fuel Quantity Input" slider (R3183, 0–7.5 L). */
export const FUEL_CAPACITY_L = 7.5;
/** Engine-out glide ratio used for the map ring. Placeholder from the mockup, not an aircraft figure. */
export const GLIDE_RATIO = 12;

/** Control source from the stick variables, using the Veronte Ops colour bands (Operational layout):
 *  R3104 Stick-Mode AUTO [-0.3, 0.3] / FBX [0.8, 1.2]; R3106 Stick-Manual AP [-0.2, 0.2] / DISCO [0.8, 1.2].
 *  Anything else (the SIL reports 0.5 with no stick detected) is shown as unknown rather than guessed. */
export function controlSource(mode: number | null, manual: number | null, detected: number | null): string {
  if (mode === null || manual === null) return "—";
  if (manual >= 0.8 && manual <= 1.2) return "STICK DISCONNECTED";
  if (mode >= -0.3 && mode <= 0.3) return "AP · AUTO";
  if (mode >= 0.8 && mode <= 1.2) return "FBX · MANUAL";
  return detected === 0 ? "AP · NO STICK" : "STICK ?";
}

/** Device telemetry-received bits: 0 means the values from that device are frozen / not updating. */
export const DEVICE_COMM = { ecu: "B1060", pmu: "B1070", esc: ["B1077", "B1078", "B1079"] } as const;
