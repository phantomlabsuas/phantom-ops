// UI state: everything the bridge sends, plus UI-only state (panels, PiP, scale, planned route) and short histories.
import { create } from "zustand";
import type { AlertState, AlertSummary, ClientMsg, CommandId, CommandState, LinkStatus, ServerMsg, VarSample } from "../../shared/protocol.ts";
import { loadOfflineMap, type OfflineMap } from "../map/offline.ts";
import { PROVIDERS, probeBasemap, verdictOf, type BasemapHealth, type Blame, type OnlineBasemap } from "../map/basemaps.ts";

export type Menu = "fly" | "plan" | "payload" | "check" | "sys" | "log" | "hand" | "settings";
export type Corner = "tl" | "tr" | "bl" | "br";
export type Basemap = "satellite" | "dark" | "offline";

export interface LogEntry { t: number; kind: "alert" | "clear" | "command" | "link"; text: string; level?: number }

/** A waypoint planned in Phantom OPS. v0 draws the route; it is not uploaded to the autopilot. */
export interface Waypoint { id: string; lat: number; lon: number; alt: number }

const HISTORY_LEN = 2 * 3600; // 2 h at 1 Hz
const TRACK_LEN = 3600;       // last 3600 positions (~30 min at 2 Hz)

// ---- persisted UI choices (namespaced keys, validated on load) -------------------------------------------
const KEY = (k: string) => `phops.${k}`;
const load = <T,>(k: string, d: T, valid: (v: unknown) => boolean): T => {
  try { const raw = localStorage.getItem(KEY(k)); if (!raw) return d; const v = JSON.parse(raw); return valid(v) ? (v as T) : d; } catch { return d; }
};
const save = (k: string, v: unknown) => { try { localStorage.setItem(KEY(k), JSON.stringify(v)); } catch { /* ignore */ } };
const isWaypoint = (w: unknown): w is Waypoint => {
  const o = w as Waypoint;
  return !!o && typeof o.id === "string" && [o.lat, o.lon, o.alt].every((x) => typeof x === "number" && Number.isFinite(x))
    && Math.abs(o.lat) <= 90 && Math.abs(o.lon) <= 180;
};

interface State {
  connected: boolean;
  vars: Record<string, VarSample>;
  names: Record<string, string>;
  status: LinkStatus | null;
  alerts: AlertSummary;
  command: CommandState | null;
  now: number;
  history: Record<string, (number | null)[]>;
  track: [number, number][];
  log: LogEntry[];
  // UI
  menu: Menu;
  panel: "eng" | "fuel" | null;
  pipCorner: Corner;
  swapped: boolean;
  scale: number | "auto";
  basemap: Basemap;
  offline: OfflineMap;
  online: Record<OnlineBasemap, BasemapHealth>;
  follow: boolean;
  route: Waypoint[];
  addingWaypoints: boolean;
  selectedWp: string | null;
  set: (p: Partial<State>) => void;
}

export const useStore = create<State>((set) => ({
  connected: false,
  vars: {},
  names: {},
  status: null,
  alerts: { active: [], noData: 0, historyCount: 0 },
  command: null,
  now: Date.now(),
  history: {},
  track: [],
  log: [],
  menu: "fly",
  panel: null,
  pipCorner: load<Corner>("pipCorner", "bl", (v) => ["tl", "tr", "bl", "br"].includes(v as string)),
  swapped: false,
  scale: load<number | "auto">("uiScale", "auto", (v) => v === "auto" || (typeof v === "number" && v >= 0.8 && v <= 1)),
  basemap: load<Basemap>("basemap", "satellite", (v) => ["satellite", "dark", "offline"].includes(v as string)),
  offline: { state: "loading" },
  online: { satellite: { state: "idle" }, dark: { state: "idle" } },
  follow: true,
  route: load<Waypoint[]>("route", [], (v) => Array.isArray(v) && v.every(isWaypoint)),
  addingWaypoints: false,
  selectedWp: null,
  set: (p) => set(p),
}));

useStore.subscribe((s, prev) => {
  if (s.pipCorner !== prev.pipCorner) save("pipCorner", s.pipCorner);
  if (s.scale !== prev.scale) save("uiScale", s.scale);
  if (s.basemap !== prev.basemap) save("basemap", s.basemap);
  if (s.route !== prev.route) save("route", s.route);
});

// ---- route editing ------------------------------------------------------------------------------------------
let wpCounter = 0;
export function addWaypoint(lat: number, lon: number) {
  const { route } = useStore.getState();
  const last = route[route.length - 1];
  const vars = useStore.getState().vars;
  const msl = typeof vars.R503?.v === "number" ? vars.R503.v : 0;
  const alt = last ? last.alt : Math.round((msl + 120) / 10) * 10;   // default: 120 m above the aircraft
  const wp: Waypoint = { id: `wp-${Date.now().toString(36)}-${wpCounter++}`, lat, lon, alt };
  useStore.setState({ route: [...route, wp], selectedWp: wp.id });
}
export function moveWaypoint(id: string, lat: number, lon: number) {
  useStore.setState({ route: useStore.getState().route.map((w) => (w.id === id ? { ...w, lat, lon } : w)) });
}
export function updateWaypoint(id: string, patch: Partial<Omit<Waypoint, "id">>) {
  useStore.setState({ route: useStore.getState().route.map((w) => (w.id === id ? { ...w, ...patch } : w)) });
}
export function removeWaypoint(id: string) {
  const s = useStore.getState();
  useStore.setState({ route: s.route.filter((w) => w.id !== id), selectedWp: s.selectedWp === id ? null : s.selectedWp });
}

// ---- offline basemap ----------------------------------------------------------------------------------------
// Looked for at startup and on request (Display settings). While the chosen offline file is missing, the map shows
// another basemap (shownBasemap) but the choice is kept, so the extract is used again once it is back.
export async function rescanOffline() {
  // a map already drawn stays drawn while the folder is checked again
  if (useStore.getState().offline.state !== "ready") useStore.setState({ offline: { state: "loading" } });
  const offline = await loadOfflineMap();
  if (offline.state === "none") console.warn(`Offline basemap unavailable: ${offline.hint}`);
  useStore.setState({ offline });
}
rescanOffline();

// ---- online basemaps --------------------------------------------------------------------------------------------
// Probed when an online basemap is needed: chosen, or as the fallback for a missing offline file. With OFFLINE in use
// and its file present the UI contacts no internet host. Also probed on request (Display settings > Recheck), when the
// browser comes back online, and on a back-off timer while a basemap is failed or running on a lesser provider.
// A provider whose tiles keep failing while in use is blamed (skipped) for 10 min, doubling on repeats up to an hour,
// and the next candidate is probed. A failure that turns out to be our own lost connection blames nobody.
const blamed = new Map<string, Blame>();
let probedOnce = false;
let probeRun = 0;
const RETRY_S = [60, 120, 300];
const retryAt: Record<OnlineBasemap, number> = { satellite: 0, dark: 0 };
const retryStep: Record<OnlineBasemap, number> = { satellite: 0, dark: 0 };
const lastSkipped: Record<OnlineBasemap, string> = { satellite: "", dark: "" };

export async function checkOnlineBasemaps(which: OnlineBasemap[] = ["satellite", "dark"]) {
  probedOnce = true;
  const run = ++probeRun;
  useStore.setState((s) => ({ online: { ...s.online, ...Object.fromEntries(which.map((b) => [b, { state: "checking", prev: verdictOf(s.online[b]) }])) } }));
  await Promise.all(which.map(async (b) => {
    const h = await probeBasemap(b, blamed);
    if (run !== probeRun && useStore.getState().online[b].state !== "checking") return;   // a newer check already answered
    const lesser = h.state === "failed" || h.skipped.length > 0;
    retryAt[b] = lesser ? Date.now() + RETRY_S[Math.min(retryStep[b]++, RETRY_S.length - 1)] * 1000 : 0;
    if (!lesser) retryStep[b] = 0;
    const note = h.state === "failed" ? `unavailable: ${h.detail}` : h.skipped.length ? `using ${h.provider.name}; passed over ${h.skipped.join(" · ")}` : "";
    if (note && note !== lastSkipped[b]) console.warn(`Basemap ${b} ${note}`);
    lastSkipped[b] = note;
    const before = verdictOf(useStore.getState().online[b]);
    const v = h.state === "failed" ? { ...h, cached: before?.state === "ok" || (before?.state === "failed" && !!before.cached) } : h;
    useStore.setState((s) => ({ online: { ...s.online, [b]: v } }));
    // Nothing reachable for this basemap: check the other online basemap too (its last 'ok' may be stale, or it was
    // never checked) before calling it our own connection; a firewall may block only the imagery hosts.
    const other: OnlineBasemap = b === "satellite" ? "dark" : "satellite";
    const os = useStore.getState().online[other].state;
    if (h.state === "failed" && h.network && (os === "ok" || os === "idle")) checkOnlineBasemaps([other]);
  }));
}

const offlineInUse = (s: { basemap: Basemap; offline: OfflineMap }) => s.basemap === "offline" && s.offline.state === "ready";
const onlineNeeded = (s: { basemap: Basemap; offline: OfflineMap }) => s.basemap !== "offline" || s.offline.state === "none";
if (onlineNeeded(useStore.getState())) checkOnlineBasemaps();
useStore.subscribe((s) => { if (!probedOnce && onlineNeeded(s)) checkOnlineBasemaps(); });

/** Online basemaps due another probe: failed ones, and ones running on a lesser provider once a better candidate is no
 *  longer blamed, each after its back-off (or at once when forced). Never while OFFLINE is in use. */
function dueForRetry(force: boolean): OnlineBasemap[] {
  const s = useStore.getState();
  if (!probedOnce || offlineInUse(s)) return [];
  const now = Date.now();
  return (["satellite", "dark"] as const).filter((b) => {
    const h = s.online[b];
    if (h.state === "failed") return force || now >= retryAt[b];
    if (h.state !== "ok") return false;
    const best = PROVIDERS[b].find((p) => (blamed.get(p.id)?.until ?? 0) <= now);
    return !!best && best.id !== h.provider.id && (force || now >= retryAt[b]);
  });
}
setInterval(() => { const due = dueForRetry(false); if (due.length) checkOnlineBasemaps(due); }, 15_000);
window.addEventListener("online", () => { const due = dueForRetry(true); if (due.length) checkOnlineBasemaps(due); });

/** Called by MapView when the provider in use keeps failing. `http`: the failures carried an HTTP status (401, 403,
 *  429, 5xx), so the provider itself refused.
 *  Failures without a status may be our own connection: errors of requests made during a drop are even delivered just
 *  after it is back. So the first one only re-probes from the top, blaming nobody: a provider that still answers is
 *  kept (and its failed tiles reloaded). A second one within 5 minutes blames the provider. */
const inUseFailures = new Map<string, number[]>();
export async function markBasemapFailed(b: OnlineBasemap, providerId: string, detail: string, http: boolean) {
  console.warn(`Basemap ${b} (${providerId}) failed while in use: ${detail}`);
  const now = Date.now();
  const recent = [...(inUseFailures.get(providerId) ?? []).filter((t) => now - t < 5 * 60_000), now];
  inUseFailures.set(providerId, recent);
  if (!http && recent.length < 2) { await checkOnlineBasemaps([b]); return; }
  const prev = blamed.get(providerId);
  const count = prev && now - prev.until < 60 * 60_000 ? prev.count + 1 : 1;   // the escalation resets after a clean hour
  blamed.set(providerId, { why: `failed while in use (${detail})`, until: now + Math.min(60, 10 * 2 ** (count - 1)) * 60_000, count });
  await checkOnlineBasemaps([b]);
  // Every candidate unreachable, the blamed one included: our own connection dropped, not this provider. Undo the
  // blame; the retry timer (or the browser's 'online' event) brings the basemap back when the connection does. The
  // re-probe skipped the provider just blamed, so when it reached nothing else (DARK has one candidate) that provider
  // is asked as well; this only decides the blame and does not change what the map shows.
  const h = useStore.getState().online[b];
  if (!http && h.state === "failed") {
    const all = h.network ? h : await probeBasemap(b, new Map([...blamed].filter(([id]) => id !== providerId)));
    if (all.state === "failed" && all.network) { if (prev) blamed.set(providerId, prev); else blamed.delete(providerId); }
  }
}
/** The operator picks a basemap. Picking an online one that failed, or was never checked, probes it now (an explicit
 *  request, so this also applies while OFFLINE is in use). */
export function chooseBasemap(b: Basemap) {
  useStore.getState().set({ basemap: b });
  if (b !== "offline" && probedOnce && useStore.getState().online[b].state !== "ok" && useStore.getState().online[b].state !== "checking") checkOnlineBasemaps([b]);
}
/** Display settings "Recheck": forget blames and back-offs, probe every online basemap again and look for the offline file. */
export function recheckBasemaps() {
  blamed.clear();
  retryStep.satellite = retryStep.dark = 0;
  checkOnlineBasemaps();
  rescanOffline();
}

// Offline counts only once its layers can be drawn (a missing or still-loading file would leave the map blank). An
// online basemap counts by the verdict in force: while a re-probe runs the last verdict holds, so a working fallback is
// not swapped for a blank map; before its first verdict it counts only while its probe is under way.
export const basemapUsable = (b: Basemap, o: OfflineMap, on: Record<OnlineBasemap, BasemapHealth>) => {
  if (b === "offline") return o.state === "ready";
  const v = verdictOf(on[b]);
  return v ? v.state === "ok" : on[b].state === "checking";
};
/** This basemap failed because none of its candidates could be reached at all (no HTTP answer). */
export const unreachable = (h: BasemapHealth) => { const v = verdictOf(h); return v?.state === "failed" && v.network; };
/** Our own connection looks down: the basemap reached nothing, and neither did the other online basemap (or its
 *  cross-check is still running, or it was never checked). With only one basemap unreachable it is that provider set. */
export function connectionDown(b: OnlineBasemap, on: Record<OnlineBasemap, BasemapHealth>) {
  if (!unreachable(on[b])) return false;
  const o = on[b === "satellite" ? "dark" : "satellite"];
  return o.state === "checking" || !verdictOf(o) || unreachable(o);
}
/** The basemap actually drawn: the chosen one, or while it is unavailable the first usable one of satellite, dark,
 *  offline. The choice itself is kept, so the chosen basemap comes back once it works again.
 *  - While the chosen offline file is still being looked for, offline (nothing drawn yet; the notice says so).
 *  - With our own connection down, another online basemap would not load either: the offline map is shown if there is
 *    one, otherwise the chosen basemap stays, and MapLibre keeps drawing the tiles it already has.
 *  - With none usable the chosen one is returned and the map shows its plain background. */
export function shownBasemap(b: Basemap, o: OfflineMap, on: Record<OnlineBasemap, BasemapHealth>): Basemap {
  if (b === "offline" && o.state === "loading") return "offline";
  if (basemapUsable(b, o, on)) return b;
  if (b !== "offline" && connectionDown(b, on)) return o.state === "ready" ? "offline" : b;
  return (["satellite", "dark", "offline"] as const).find((x) => basemapUsable(x, o, on)) ?? b;
}

// ---- bridge connection ---------------------------------------------------------------------------------
let ws: WebSocket | null = null;

/** Send to the bridge. Returns false (nothing sent) when the bridge is not connected. */
export function send(m: ClientMsg): boolean {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  ws.send(JSON.stringify(m));
  return true;
}

export function sendCommand(id: CommandId, opts: { value?: number; stage?: "arm" | "confirm" } = {}): boolean {
  const ok = send({ type: "command", id, ...opts });
  if (!ok) {
    const st: CommandState = { seq: (useStore.getState().command?.seq ?? 0) + 0.5, id, label: id.toUpperCase(), phase: "blocked", detail: "not sent: bridge offline", t: Date.now() };
    pushLog({ t: st.t, kind: "command", text: `${id}: not sent (bridge offline)` });
    useStore.setState({ command: st });
  }
  return ok;
}
export const ackAlerts = (ids: string[]) => ids.forEach((id) => send({ type: "ack", id }));

function pushLog(e: LogEntry) {
  const log = useStore.getState().log;
  useStore.setState({ log: [e, ...log].slice(0, 500) });
}

function diffAlerts(prev: AlertState[], next: AlertState[]) {
  const before = new Map(prev.map((a) => [a.id, a]));
  const after = new Set(next.map((a) => a.id));
  for (const a of next) if (!before.has(a.id)) pushLog({ t: a.since, kind: "alert", text: `${a.text}${a.inhibited ? ` (inhibited: ${a.inhibitReason})` : ""}`, level: a.level });
  for (const a of prev) if (!after.has(a.id)) pushLog({ t: Date.now(), kind: "clear", text: `${a.text} cleared`, level: a.level });
}

export function connectBridge() {
  const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
  const sock = new WebSocket(url);
  ws = sock;
  sock.onopen = () => { useStore.setState({ connected: true }); pushLog({ t: Date.now(), kind: "link", text: "Bridge connected" }); };
  sock.onclose = () => {
    if (ws !== sock) return;
    if (useStore.getState().connected) pushLog({ t: Date.now(), kind: "link", text: "Bridge disconnected: values and alerts on screen are frozen" });
    useStore.setState({ connected: false });
    setTimeout(connectBridge, 1500);
  };
  sock.onmessage = (ev) => {
    let m: ServerMsg;
    try { m = JSON.parse(ev.data) as ServerMsg; } catch { return; }
    const s = useStore.getState();
    switch (m.type) {
      case "hello":
        diffAlerts(s.alerts.active, m.alerts.active);   // logs alerts already active at connect / changed while away
        useStore.setState({ status: m.status, vars: m.vars, alerts: m.alerts, command: m.command, names: m.names });
        break;
      case "names": useStore.setState({ names: m.names }); break;
      case "vars": useStore.setState({ vars: { ...s.vars, ...m.vars } }); break;
      case "status":
        if (s.status && s.status.apAlive !== m.status.apAlive) pushLog({ t: Date.now(), kind: "link", text: m.status.apAlive ? `Autopilot ${m.status.apAddress} reporting` : "Autopilot no report" });
        useStore.setState({ status: m.status });
        break;
      case "alerts": diffAlerts(s.alerts.active, m.alerts.active); useStore.setState({ alerts: m.alerts }); break;
      case "command": {
        const c = m.command;
        pushLog({ t: c.t, kind: "command", text: `${c.label}: ${c.phase}${c.detail ? ` (${c.detail})` : ""}` });
        // A late verdict of an older command is logged but does not replace the newer command on screen.
        if (!s.command || c.seq >= s.command.seq) useStore.setState({ command: c });
        break;
      }
    }
  };
}

// ---- clocks: freshness tick (2 Hz), histories (1 Hz), track (2 Hz) ----------------------------------------
const HISTORY_VARS = ["R3502", "R3499", "R3208", "R3400", "R3215", "R3604", "R503", "R3130"];

setInterval(() => useStore.setState({ now: Date.now() }), 500);

setInterval(() => {
  const { vars, history } = useStore.getState();
  const h = { ...history };
  for (const k of HISTORY_VARS) {
    const s = vars[k];
    const v = s && typeof s.v === "number" && Date.now() - s.rx < Math.max(4 * s.p, 1000) ? s.v : null;
    const arr = h[k] ?? [];
    arr.push(v);
    if (arr.length > HISTORY_LEN) arr.splice(0, arr.length - HISTORY_LEN);
    h[k] = arr.slice();   // new reference so subscribers re-render; avoids a double copy
  }
  useStore.setState({ history: h });
}, 1000);

setInterval(() => {
  const { vars, track } = useStore.getState();
  const la = vars.R501, lo = vars.R500;
  if (!la || !lo || typeof la.v !== "number" || typeof lo.v !== "number" || Date.now() - la.rx > 1000) return;
  const p: [number, number] = [(lo.v * 180) / Math.PI, (la.v * 180) / Math.PI];
  const last = track[track.length - 1];
  if (last && Math.abs(last[0] - p[0]) < 1e-7 && Math.abs(last[1] - p[1]) < 1e-7) return;
  useStore.setState({ track: [...track, p].slice(-TRACK_LEN) });
}, 500);

// The store owns module-level timers, listeners and the bridge socket: a hot update would start a second set, so
// changes to it (or to modules it imports) reload the page instead.
import.meta.hot?.accept(() => location.reload());
