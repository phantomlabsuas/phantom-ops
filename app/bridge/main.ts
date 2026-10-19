// Phantom OPS v0 bridge: Veronte Link application interface (UDP multicast) <-> UI (WebSocket).
// Receives every AP packet Link republishes, decodes telemetry with the PDI that matches the vector hash,
// evaluates alerts, and sends operator commands. See veronte/integration-guide.md.
import dgram from "node:dgram";
import { readFileSync, createWriteStream, type WriteStream } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import type { CommandId, LinkStatus, ServerMsg, VarSample } from "../shared/protocol.ts";
import { GROUND_PHASES } from "../shared/protocol.ts";
import { parseFrame, parseSystemStatus, TYPE } from "./vcp.ts";
import { loadPdi, type Pdi, type Vector } from "./pdi.ts";
import { decodeTelemetry, telemetryHeader } from "./telemetry.ts";
import { AlertEngine } from "./alerts.ts";
import { CommandService } from "./commands.ts";
import { gatingPhase, isClientMsg, originAllowed, shouldAdoptAp } from "./link.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cfg = JSON.parse(readFileSync(process.env.PHOPS_CONFIG ?? join(root, "config/bridge.config.json"), "utf-8"));
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 23), ...a);

const LIVE_MS = 1000;          // AP / telemetry liveness window (integration-guide §4.5)
const AP_SWITCH_MS = 5000;     // another AP is adopted only after the current one has been silent this long
const PDI_LOST_MS = 3000;      // active PDI dropped when V0 has not been decoded for this long
const PHASE_MAX_AGE_MS = 5000; // commands treat the phase as unknown when V1 / 50008 have not confirmed it for this long
// Elapsed-time checks use a monotonic clock so a system clock step cannot make stale data look fresh.
const mono = () => performance.now();

// ---- PDI profiles: hash -> (profile, vector) ------------------------------------------------------------
const hashTable = new Map<number, { pdi: Pdi; vec: Vector }>();
for (const p of cfg.pdiProfiles) {
  try {
    const pdi = loadPdi(p.name, p.setupDir);
    for (const [h, vname] of Object.entries<string>(p.hashes)) {
      const vec = pdi.vectors.find((v) => v.name === vname);
      if (!vec) { log(`profile ${p.name}: ${vname} not in tm.xml`); continue; }
      const key = Number(h);
      if (!hashTable.has(key)) hashTable.set(key, { pdi, vec });
    }
    log(`PDI "${p.name}" loaded: ${pdi.vectors.length} vectors, ${Object.keys(pdi.buttonEvents).length} button events (${pdi.setupDir})`);
  } catch (e) {
    log(`PDI "${p.name}" not loaded: ${(e as Error).message}`);
  }
}

// Display names: Ops layout descriptions for system variables, overridden by the active PDI's names.
const baseNames: Record<string, string> = JSON.parse(readFileSync(join(root, "config/var-names.json"), "utf-8")).names;
const names = (): Record<string, string> => ({ ...baseNames, ...(activePdi?.varNames ?? {}) });

// ---- state ----------------------------------------------------------------------------------------------
const store = new Map<string, VarSample>();
const dirty = new Set<string>();
let activePdi: Pdi | null = null;
const vecLastRx: Record<string, number> = {};   // last decode time per vector name (monotonic ms)
const rxMono = new Map<string, number>();        // last decode time per variable (monotonic ms)
let apLastMono: number | null = null;
let phaseConfirmedMono: number | null = null;
const unknownHashes = new Set<string>();
let unknownSince = 0;
const counts: Record<string, number> = {};
let pcsLastRx = 0;
let statusPhase: number | null = null;          // phase byte of the last System status (fallback only)
let lastConflictLog = 0;
let videoFailures = 0;

const status: LinkStatus = {
  socketOpen: false, socketError: "", apAddress: null, apAlive: false, telemetryAlive: false, apLastRx: null, apUptimeMs: null,
  phase: null, pcsAlive: false, pdiProfile: null, vehicleName: null, unknownHashes: [], rates: {},
  commandsAllowed: false, ownAddress: cfg.ownAddress, videoUrl: cfg.video?.url ?? "", videoReachable: null,
  flightStart: null, flightStartPartial: false, phaseSince: null,
};

const fresh = (key: string) => {
  const s = store.get(key), t = rxMono.get(key);
  return !!s && t !== undefined && mono() - t < Math.max(4 * s.p, LIVE_MS);
};
const apAlive = () => apLastMono !== null && mono() - apLastMono < LIVE_MS;
const telemetryAlive = () => vecLastRx.V1 !== undefined && mono() - vecLastRx.V1 < LIVE_MS;

// ---- clients --------------------------------------------------------------------------------------------
// Only the Phantom OPS UI may connect: browsers always send an Origin header, so a page from any other site is
// refused (it could otherwise send commands). Non-browser local tools send no Origin and are accepted.
const allowedOrigins: string[] = cfg.allowedOrigins ?? ["http://127.0.0.1:5173", "http://localhost:5173"];
const wss = new WebSocketServer({
  port: cfg.wsPort, host: "127.0.0.1",
  verifyClient: ({ origin }: { origin?: string }) => {
    const ok = originAllowed(origin, allowedOrigins);
    if (!ok) log(`refused WebSocket from origin ${origin}`);
    return ok;
  },
});
wss.on("error", (e: NodeJS.ErrnoException) => {
  log(e.code === "EADDRINUSE" ? `port ${cfg.wsPort} is in use: another bridge is already running` : `WebSocket server error: ${e.message}`);
  process.exit(1);
});
const sendAll = (m: ServerMsg) => { const s = JSON.stringify(m); for (const c of wss.clients) if (c.readyState === WebSocket.OPEN) c.send(s); };

const alerts = new AlertEngine(join(root, "config/alerts.json"));
const evalAlerts = () => alerts.evaluate({
  now: Date.now(), get: (k) => store.get(k), fresh, phase: status.phase,
  apSeen: status.apAddress !== null, apAlive: apAlive(), telemetryAlive: telemetryAlive(),
  unknownLayout: unknownHashes.size > 0 && mono() - unknownSince < 5000 && !(vecLastRx.V0 && mono() - vecLastRx.V0 < 2000),
});

// ---- sockets --------------------------------------------------------------------------------------------
const { group, iface, rxPort, txPort } = cfg.multicast;
const rx = dgram.createSocket({ type: "udp4", reuseAddr: true });
const tx = dgram.createSocket({ type: "udp4" });
tx.on("error", (e) => log("tx error", e.message));

const commands = new CommandService({
  ownAddress: cfg.ownAddress,
  allowed: cfg.commands?.allowedApAddresses ?? [],
  apAddress: () => status.apAddress,
  pdi: () => activePdi,
  phase: () => gatingPhase(status.phase, phaseConfirmedMono === null ? null : mono() - phaseConfirmedMono, PHASE_MAX_AGE_MS),
  get: (k) => store.get(k),
  fresh,
  send: (d) => { tx.send(d, txPort, group); log(`TX ${d.length} B to ${group}:${txPort}`); },
  publish: (c) => { log(`command ${c.label}: ${c.phase}${c.detail ? ` (${c.detail})` : ""}`); sendAll({ type: "command", command: c }); },
});

wss.on("connection", (ws) => {
  ws.on("error", (e) => log("client socket error", e.message));
  try {
    ws.send(JSON.stringify({ type: "hello", status: snapshotStatus(), vars: Object.fromEntries(store), alerts: evalAlerts(), command: commands.last, names: names() } satisfies ServerMsg));
  } catch (e) { log("hello failed", (e as Error).message); }
  ws.on("message", (raw) => {
    try {
      const m: unknown = JSON.parse(String(raw));
      if (!isClientMsg(m)) { log("ignored malformed client message"); return; }
      if (m.type === "ack") alerts.ack(m.id);
      else if (m.type === "ackAll") alerts.ackAll();
      else commands.request(m.id as CommandId, m.value, m.stage);
    } catch (e) { log("client message failed", (e as Error).message); }
  });
});

// ---- optional recording (one stream, errors disable it) -------------------------------------------------
let recorder: WriteStream | null = null;
if (cfg.replay?.recordTo) {
  const path = resolve(root, cfg.replay.recordTo);
  recorder = createWriteStream(path, { flags: "a" });
  recorder.on("error", (e) => { log(`recording disabled: ${e.message}`); recorder = null; });
  log(`recording datagrams to ${path}`);
}

// ---- receive ----------------------------------------------------------------------------------------------
function adoptAp(src: number, why: string) {
  const since = apLastMono === null ? null : mono() - apLastMono;
  if (!shouldAdoptAp(status.apAddress, src, since, LIVE_MS, AP_SWITCH_MS)) {
    if (status.apAddress !== src && apAlive() && Date.now() - lastConflictLog > 10000) {
      log(`ignoring second autopilot ${src} (${why}); locked on ${status.apAddress}`); lastConflictLog = Date.now();
    }
    return;
  }
  const changed = status.apAddress !== null;
  log(`autopilot ${changed ? `changed ${status.apAddress} ->` : "found"} at address ${src} (${why})`);
  status.apAddress = src;
  status.apLastRx = Date.now(); apLastMono = mono();
  activePdi = null;                      // re-identify the PDI of the new unit
  unknownHashes.clear();
  store.clear(); rxMono.clear();
  for (const k of Object.keys(vecLastRx)) delete vecLastRx[k];
  status.phase = null; statusPhase = null; phaseConfirmedMono = null;
  status.flightStart = null; status.flightStartPartial = false; status.phaseSince = null;
  if (changed) { alerts.reset(); sendAll({ type: "alerts", alerts: evalAlerts() }); }   // never carry alerts / acks over to another unit
}

rx.on("message", (d) => {
  if (recorder) recorder.write(JSON.stringify({ t: Date.now(), d: d.toString("base64") }) + "\n");
  const f = parseFrame(d);
  if (!f) return;
  if (f.checksumOk === false) { counts.badChecksum = (counts.badChecksum ?? 0) + 1; return; }
  counts.total = (counts.total ?? 0) + 1;

  if (f.src === cfg.pcsAddress) { pcsLastRx = Date.now(); return; } // PCS: liveness only in v0

  if (f.type === TYPE.SYSTEM_STATUS) {
    const s = parseSystemStatus(f);
    if (s && s.appId === 3) adoptAp(f.src, "system status");
  } else if (f.type === TYPE.TELEMETRY && status.apAddress === null) {
    const h = telemetryHeader(f.payload);
    if (h && hashTable.has(h.hash)) adoptAp(f.src, "telemetry");
  }
  if (status.apAddress === null || f.src !== status.apAddress) return;
  status.apLastRx = Date.now(); apLastMono = mono();

  if (f.type === TYPE.SYSTEM_STATUS) {
    const s = parseSystemStatus(f);
    if (s) {
      counts.status = (counts.status ?? 0) + 1;
      if (s.phase !== null) statusPhase = s.phase;
      if (Number.isFinite(s.uptimeMs) && !telemetryAlive()) status.apUptimeMs = s.uptimeMs;
      if (!telemetryAlive() && statusPhase !== null) { setPhase(statusPhase); phaseConfirmedMono = mono(); }   // fallback while V1 is missing
    }
  }

  if (f.dst === cfg.ownAddress) commands.onFrame(f);

  if (f.type === TYPE.TELEMETRY) {
    const h = telemetryHeader(f.payload);
    if (!h) return;
    const hit = hashTable.get(h.hash);
    if (!hit) {
      const hx = "0x" + h.hash.toString(16).toUpperCase().padStart(8, "0");
      if (!unknownHashes.has(hx)) log(`unknown telemetry hash ${hx} (${f.payload.length} B, dst ${f.dst}): vector not in config, or another PDI`);
      unknownHashes.add(hx); unknownSince = mono();
      return;
    }
    const dec = decodeTelemetry(f.payload, hit.vec);
    if (!dec) { counts.badLayout = (counts.badLayout ?? 0) + 1; return; }
    const now = Date.now();
    if (hit.vec.name === "V0" && activePdi !== hit.pdi) { activePdi = hit.pdi; log(`AP runs "${hit.pdi.name}"`); sendAll({ type: "names", names: names() }); }
    const m = mono();
    vecLastRx[hit.vec.name] = m;
    const period = hit.vec.periodS * 1000;
    for (const [k, v] of dec.values) { store.set(k, { v, t: dec.time, rx: now, p: period }); rxMono.set(k, m); dirty.add(k); }
    counts[hit.vec.name] = (counts[hit.vec.name] ?? 0) + 1;
    status.apUptimeMs = Math.round(dec.time * 1000);   // AP time, updated at the vector rate
    if (hit.vec.name === "V1") { const u1 = store.get("U1")?.v; if (typeof u1 === "number") { setPhase(u1); phaseConfirmedMono = m; } }   // U1 is the phase source
  }
});

function setPhase(p: number) {
  if (status.phase === p) return;
  log(`phase ${status.phase} -> ${p}`);
  const first = status.phase === null;
  const wasGround = first || GROUND_PHASES.has(status.phase!);
  status.phase = p;
  status.phaseSince = first ? null : Date.now();   // unknown when the bridge starts mid-phase
  const ground = GROUND_PHASES.has(p);
  if (wasGround && !ground) { status.flightStart = Date.now(); status.flightStartPartial = first; }
  if (ground) { status.flightStart = null; status.flightStartPartial = false; }
  queueMicrotask(() => sendAll({ type: "status", status: snapshotStatus() }));   // phase changes reach the UI at once
}

rx.on("error", (e) => { status.socketError = e.message; log("rx error", e.message); });
rx.bind(rxPort, "0.0.0.0", () => {
  try {
    rx.addMembership(group, iface);
    status.socketOpen = true;
    log(`joined ${group}:${rxPort} on ${iface}; own address ${cfg.ownAddress}; WebSocket ws://127.0.0.1:${cfg.wsPort}`);
  } catch (e) { status.socketError = (e as Error).message; log("addMembership failed", status.socketError); }
});
tx.bind(() => { tx.setMulticastInterface(iface); tx.setMulticastTTL(1); tx.setMulticastLoopback(true); });

// ---- periodic work --------------------------------------------------------------------------------------
setInterval(() => {                      // 20 Hz: variable deltas (median added latency ~25 ms)
  if (!dirty.size) return;
  const vars: Record<string, VarSample> = {};
  for (const k of dirty) vars[k] = store.get(k)!;
  dirty.clear();
  sendAll({ type: "vars", vars });
}, 50);

setInterval(() => {                      // 4 Hz: PDI validity, alerts
  if (activePdi && (!vecLastRx.V0 || mono() - vecLastRx.V0 > PDI_LOST_MS)) { log("V0 lost: PDI no longer identified, commands blocked"); activePdi = null; }
  const a = evalAlerts();
  if (alerts.changed(a)) sendAll({ type: "alerts", alerts: a });
}, 250);

function snapshotStatus(): LinkStatus {
  status.apAlive = apAlive();
  status.telemetryAlive = telemetryAlive();
  status.pcsAlive = Date.now() - pcsLastRx < 2000;
  status.pdiProfile = activePdi?.name ?? null;
  status.vehicleName = activePdi?.vehicleName ?? null;
  status.unknownHashes = [...unknownHashes];
  status.commandsAllowed = commands.allowed();
  return status;
}

let lastRateT = Date.now();
setInterval(() => {                      // 1 Hz: status
  const now = Date.now();
  const dt = (now - lastRateT) / 1000; lastRateT = now;
  status.rates = Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, Math.round(v / dt)]));
  for (const k of Object.keys(counts)) counts[k] = 0;
  sendAll({ type: "status", status: snapshotStatus() });
}, 1000);

async function probeVideo() {              // is the video server up? The UI keeps the video until 3 probes fail.
  if (!status.videoUrl) return;
  try {
    const r = await fetch(status.videoUrl, { method: "GET", signal: AbortSignal.timeout(1500) });
    if (r.status < 500) { videoFailures = 0; status.videoReachable = true; } else throw new Error(String(r.status));
  } catch { videoFailures++; if (videoFailures >= 3 || status.videoReachable === null) status.videoReachable = false; }
}
probeVideo(); setInterval(probeVideo, 10000);
