// Command service: server-side confirmation, gating, reply matching and the execution watch (fake network/clock).
import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { CommandService } from "./commands.ts";
import { buildFrame, parseFrame, TYPE } from "./vcp.ts";
import type { Pdi } from "./pdi.ts";
import type { CommandState, VarSample } from "../shared/protocol.ts";

const AP = 6041, OWN = 1100;
const PDI: Pdi = {
  name: "test", setupDir: "", vehicleName: "", vectors: [], varNames: {},
  buttonEvents: { 2: "TAKE-OFF READY Button", 4: "TAKE-OFF Button", 12: "LANDING Button", 14: "HOLD Button", 78: "NAV LIGHTS SWITCH",
                  80: "RETURN HOME Button", 93: "SET IAS CMD MODE MINIMUM ", 94: "SET IAS CMD MODE NOMINAL ", 95: "IAS CMD MODE MAXIMUM BUTT" },
};

function setup(t: TestContext, o: { phase?: number; vars?: Record<string, number>; sendThrows?: boolean } = {}) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });
  const store = new Map<string, VarSample>();
  const setVar = (k: string, v: number) => store.set(k, { v, t: 0, rx: Date.now(), p: 167 });
  for (const [k, v] of Object.entries(o.vars ?? {})) setVar(k, v);
  const sent: Buffer[] = [];
  const states: CommandState[] = [];
  let phase = o.phase ?? 0;
  let throwOnce = !!o.sendThrows;
  const svc = new CommandService({
    ownAddress: OWN, allowed: [AP], apAddress: () => AP, pdi: () => PDI, phase: () => phase,
    get: (k) => store.get(k), fresh: (k) => store.has(k),
    send: (d) => { if (throwOnce) { throwOnce = false; throw new Error("EHOSTUNREACH"); } sent.push(d); },
    publish: (s) => states.push(s), now: () => Date.now(),
  });
  t.after(() => svc.dispose());
  const last = () => states[states.length - 1];
  const reply = (rxId: number, flags = [1, 1, 1, 1], corrupt = false) => {
    const p = Buffer.alloc(14);
    p.writeUInt16LE(flags[0], 0); p.writeUInt16LE(0, 2); p.writeUInt32LE(rxId, 4);
    p.writeUInt16LE(flags[1], 8); p.writeUInt16LE(flags[2], 10); p.writeUInt16LE(flags[3], 12);
    const f = buildFrame(AP, OWN, TYPE.USER_EVENT, p, false);
    if (corrupt) f[f.length - 1] ^= 0xff;
    svc.onFrame(parseFrame(f)!);
  };
  const rxIdOf = (d: Buffer) => d.readUInt32LE(16 + 4);
  return { svc, sent, states, last, reply, rxIdOf, setVar, setPhase: (p: number) => { phase = p; }, tick: (ms: number) => t.mock.timers.tick(ms) };
}

test("HOLD needs arm then confirm 0.4–4 s later; the datagram is a correct User Event", (t) => {
  const h = setup(t, { phase: 2 });
  h.svc.request("hold");
  assert.equal(h.last().phase, "blocked"); assert.match(h.last().detail!, /confirmation required/);
  h.svc.request("hold", undefined, "arm"); assert.equal(h.last().phase, "armed");
  h.tick(200); h.svc.request("hold", undefined, "confirm");
  assert.match(h.last().detail!, /too quickly/); assert.equal(h.sent.length, 0);
  h.svc.request("hold", undefined, "arm"); h.tick(5000); h.svc.request("hold", undefined, "confirm");
  assert.match(h.last().detail!, /expired/);
  h.svc.request("hold", undefined, "arm"); h.tick(600); h.svc.request("hold", undefined, "confirm");
  assert.equal(h.last().phase, "sent");
  const d = h.sent[0];
  assert.equal(d.readUInt32BE(4), OWN); assert.equal(d.readUInt32BE(8), AP);
  assert.equal(d.readUInt16BE(12), TYPE.USER_EVENT); assert.equal(d.readUInt16BE(14), 0xa0c0);
  assert.equal(d.readUInt16LE(16 + 2), 14);
});

test("launch commands are gated by phase and SIM mode", (t) => {
  const h = setup(t, { phase: 13, vars: { B1226: 1 } });
  h.svc.request("armWing", undefined, "arm");
  assert.match(h.last().detail!, /not available in ARMED/);
  h.setPhase(0); h.setVar("B1226", 0);
  h.svc.request("armWing", undefined, "arm");
  assert.match(h.last().detail!, /SIM mode only/);
  h.setVar("B1226", 1);
  h.svc.request("armWing", undefined, "arm"); h.tick(500); h.svc.request("armWing", undefined, "confirm");
  assert.equal(h.last().phase, "sent");
  const d = h.sent[0];
  assert.equal(d.readUInt16BE(12), TYPE.CONFIG);
  assert.equal(d.readUInt16LE(16 + 2), 235);        // Variable set
  assert.equal(d.readUInt16LE(16 + 14), 2);         // Bit
  assert.equal(d.readUInt16LE(16 + 16), 1241);      // Wing enable sim CMD
  assert.equal(d.readFloatLE(16 + 20), 1);
  h.svc.request("takeoff", undefined, "arm");
  assert.match(h.last().detail!, /not available in STANDBY/);
});

test("acknowledged, then executed only when telemetry newer than the reply shows the new phase", (t) => {
  const h = setup(t, { phase: 13, vars: { U1: 13 } });
  h.svc.request("takeoffReady", undefined, "arm"); h.tick(500); h.svc.request("takeoffReady", undefined, "confirm");
  h.reply(h.rxIdOf(h.sent[0]));
  assert.equal(h.last().phase, "acknowledged");
  h.tick(300); assert.equal(h.last().phase, "acknowledged");
  h.setVar("U1", 9); h.tick(200);
  assert.equal(h.last().phase, "executed");
});

test("rejected reply names the failing flag; a bad-checksum reply is ignored", (t) => {
  const h = setup(t, { phase: 2 });
  h.svc.request("iasMin");
  h.reply(h.rxIdOf(h.sent[0]), [1, 1, 1, 0]);
  assert.equal(h.last().phase, "rejected"); assert.match(h.last().detail!, /licence/);
  h.tick(1500);
  h.svc.request("iasMax");
  h.reply(h.rxIdOf(h.sent[1]), [1, 1, 1, 1], true);
  assert.equal(h.last().phase, "sent");
  h.tick(1000); assert.equal(h.last().phase, "no-reply");
});

test("after no-reply the next command is accepted at once; a failed send does not block the next one", (t) => {
  const h = setup(t, { phase: 2, sendThrows: true });
  h.svc.request("iasMin"); assert.match(h.last().detail!, /send failed/);
  h.tick(50); h.svc.request("iasMin"); assert.equal(h.last().phase, "sent");
  h.tick(1000); assert.equal(h.last().phase, "no-reply");
  h.tick(100); h.svc.request("iasCrs"); assert.equal(h.last().phase, "sent");
});

test("a second command does not cancel the first command's execution watch", (t) => {
  const h = setup(t, { phase: 2, vars: { U1002: 0 } });
  h.svc.request("iasMin"); const s1 = h.last().seq; h.reply(h.rxIdOf(h.sent[0]));
  h.tick(200);
  h.svc.request("iasMax"); const s2 = h.last().seq; h.reply(h.rxIdOf(h.sent[1]));
  h.setVar("U1002", 1); h.tick(200);
  assert.ok(h.states.some((s) => s.seq === s1 && s.phase === "executed"), "first command got its verdict");
  h.tick(2500);
  assert.ok(h.states.some((s) => s.seq === s2 && s.phase === "not-executed"), "second command got its own verdict");
});

test("a command whose target state already holds says so", (t) => {
  const h = setup(t, { phase: 2, vars: { U1002: 1 } });
  h.svc.request("iasMin"); h.reply(h.rxIdOf(h.sent[0]));
  assert.equal(h.last().phase, "executed"); assert.match(h.last().detail!, /already/);
});

test("fuel quantity: ground only, 0–7.5 L, Real variable set on R3183", (t) => {
  const h = setup(t, { phase: 2 });
  h.svc.request("fuelSet", 5); assert.match(h.last().detail!, /not available/);
  h.setPhase(0);
  h.svc.request("fuelSet", 9); assert.match(h.last().detail!, /out of range/);
  h.svc.request("fuelSet", 5.5); assert.equal(h.last().phase, "sent");
  const d = h.sent[0];
  assert.equal(d.readUInt16LE(16 + 14), 0);          // Real
  assert.equal(d.readUInt16LE(16 + 16), 3183);
  assert.equal(d.readFloatLE(16 + 20), 5.5);
});

test("HOLD / RTH / LAND are gated to the PDI's phases and blocked when the phase is unknown", (t) => {
  const h = setup(t, { phase: 0 });
  h.svc.request("land", undefined, "arm"); assert.match(h.last().detail!, /not available in STANDBY/);
  h.svc.request("hold", undefined, "arm"); assert.match(h.last().detail!, /not available in STANDBY/);
  h.setPhase(5); h.svc.request("hold", undefined, "arm"); assert.match(h.last().detail!, /not available in HOVER/);
  h.svc.request("rth", undefined, "arm"); assert.equal(h.last().phase, "armed");
  h.setPhase(null as unknown as number); h.svc.request("land", undefined, "arm"); assert.match(h.last().detail!, /phase unknown/);
  h.setPhase(0); h.svc.request("altSet", 100); assert.match(h.last().detail!, /not available in STANDBY/);
});

test("a reply arriving after the 1 s timeout is still reported, and telemetry can still confirm execution", (t) => {
  const h = setup(t, { phase: 13, vars: { U1: 13 } });
  h.svc.request("takeoffReady", undefined, "arm"); h.tick(500); h.svc.request("takeoffReady", undefined, "confirm");
  const rx = h.rxIdOf(h.sent[0]);
  h.tick(1000); assert.equal(h.last().phase, "no-reply");
  h.tick(200); h.reply(rx);
  assert.equal(h.last().phase, "acknowledged"); assert.match(h.last().detail!, /late/);
  h.setVar("U1", 9); h.tick(200);
  assert.equal(h.last().phase, "executed");
});

test("no reply at all, but the phase changes: executed, confirmed by telemetry", (t) => {
  const h = setup(t, { phase: 9, vars: { U1: 9 } });
  h.svc.request("takeoff", undefined, "arm"); h.tick(500); h.svc.request("takeoff", undefined, "confirm");
  h.tick(1000); assert.equal(h.last().phase, "no-reply");
  h.setVar("U1", 1); h.tick(200);
  assert.equal(h.last().phase, "executed"); assert.match(h.last().detail!, /telemetry/);
});

test("a toggle is refused when its current state is unknown", (t) => {
  const h = setup(t, { phase: 0 });
  h.svc.request("navLights"); assert.match(h.last().detail!, /state unknown/);
  h.setVar("B2199", 0); h.svc.request("navLights"); assert.equal(h.last().phase, "sent");
});
