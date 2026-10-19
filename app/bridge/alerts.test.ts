// Alert engine behaviour: stale data holds alerts, acknowledgement survives gaps, derived engine alerts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { AlertEngine, type AlertContext } from "./alerts.ts";
import type { VarSample } from "../shared/protocol.ts";

const DEFS = [
  { id: "ap-B1060-0", var: "B1060", device: 0, triggerOn: 0, text: "ECU No Comm", level: 3 as const, segment: "ENG" as const, delayMs: 1000 },
  { id: "ap-B1320-1", var: "B1320", device: 0, triggerOn: 1, text: "IAS Critical Low Speed", level: 3 as const, segment: "NAV" as const, delayMs: 0, inhibit: "ground" as const },
];

function ctx(vars: Record<string, number>, o: Partial<AlertContext> & { now: number; staleAll?: boolean }): AlertContext {
  const store = new Map<string, VarSample>(Object.entries(vars).map(([k, v]) => [k, { v, t: 0, rx: o.now, p: 167 }]));
  return {
    now: o.now, get: (k) => store.get(k), fresh: (k) => store.has(k) && !o.staleAll, phase: o.phase ?? 0,
    apSeen: true, apAlive: o.apAlive ?? true, telemetryAlive: o.telemetryAlive ?? true, unknownLayout: false,
  };
}

test("onset waits for delayMs, then the alert is active", () => {
  const e = new AlertEngine(DEFS);
  assert.equal(e.evaluate(ctx({ B1060: 0 }, { now: 0 })).active.length, 0);
  assert.equal(e.evaluate(ctx({ B1060: 0 }, { now: 999 })).active.length, 0);
  const a = e.evaluate(ctx({ B1060: 0 }, { now: 1000 })).active;
  assert.deepEqual(a.map((x) => x.id), ["ap-B1060-0"]);
});

test("a telemetry gap holds the alert and its acknowledgement (marked stale), fresh data clears it", () => {
  const e = new AlertEngine(DEFS);
  e.evaluate(ctx({ B1060: 0 }, { now: 0 }));
  e.evaluate(ctx({ B1060: 0 }, { now: 1000 }));
  e.ack("ap-B1060-0");
  const gap = e.evaluate(ctx({ B1060: 0 }, { now: 2000, staleAll: true, telemetryAlive: false }));
  const held = gap.active.find((x) => x.id === "ap-B1060-0")!;
  assert.ok(held, "held during the gap");
  assert.equal(held.stale, true);
  assert.equal(held.acked, true);
  assert.ok(gap.active.some((x) => x.id === "ap-link" && /telemetry lost/.test(x.text)), "the gap itself is annunciated");
  const back = e.evaluate(ctx({ B1060: 0 }, { now: 3000 })).active.find((x) => x.id === "ap-B1060-0")!;
  assert.equal(back.acked, true, "no re-annunciation after the gap");
  assert.equal(back.stale, undefined);
  assert.equal(e.evaluate(ctx({ B1060: 1 }, { now: 4000 })).active.length, 0, "fresh data clears it");
  assert.equal(e.evaluate(ctx({ B1060: 1 }, { now: 4000 })).historyCount, 2, "ECU No Comm + telemetry lost, no re-activation after the gap");
});

test("ground inhibit lists the alert as inhibited (never hidden) and lifts in flight", () => {
  const e = new AlertEngine(DEFS);
  const g = e.evaluate(ctx({ B1320: 1, B1060: 1 }, { now: 0, phase: 0 })).active[0];
  assert.equal(g.inhibited, true);
  const f = e.evaluate(ctx({ B1320: 1, B1060: 1 }, { now: 100, phase: 2 })).active[0];
  assert.equal(f.inhibited, false);
});

test("engine-out: L4 in fixed-wing flight with the engine stopped; listed as inhibited in LANDING", () => {
  const e = new AlertEngine([]);
  const fly = { B1212: 1, B1214: 0, U1005: 0, R3499: 0, B1060: 1 };
  e.evaluate(ctx(fly, { now: 0, phase: 2 }));
  const eo = e.evaluate(ctx(fly, { now: 1000, phase: 2 })).active.find((x) => x.id === "engine-out")!;
  assert.equal(eo.level, 4);
  assert.equal(eo.inhibited, false);
  const land = e.evaluate(ctx(fly, { now: 1500, phase: 3 })).active.find((x) => x.id === "engine-out")!;
  assert.equal(land.inhibited, true);
  assert.match(land.inhibitReason!, /LANDING/);
  assert.equal(new AlertEngine([]).evaluate(ctx({ ...fly, U1005: 2, R3499: 5000 }, { now: 5000, phase: 2 })).active.length, 0);
});

test("engine data lost in flight raises 'engine state unknown' instead of staying silent", () => {
  const e = new AlertEngine([]);
  const v = { B1212: 1, B1214: 0, U1005: 2, R3499: 5500, B1060: 0 };    // ECU comm lost, frozen values
  e.evaluate(ctx(v, { now: 0, phase: 2 }));
  const a = e.evaluate(ctx(v, { now: 1000, phase: 2 })).active;
  assert.ok(a.some((x) => x.id === "engine-unknown" && x.level === 3));
  assert.ok(!a.some((x) => x.id === "engine-out"));
});

test("no engine alerts on the ground or in multicopter flight", () => {
  const e = new AlertEngine([]);
  for (const t of [0, 2000]) assert.equal(e.evaluate(ctx({ B1212: 0, B1214: 0, U1005: 0, B1060: 0 }, { now: t, phase: 5 })).active.length, 0);
  for (const t of [3000, 5000]) assert.equal(e.evaluate(ctx({ B1212: 1, B1214: 0, U1005: 0, B1060: 0 }, { now: t, phase: 0 })).active.length, 0);
});

test("ENGINE OUT stays held and acknowledged through a telemetry gap, then clears only on fresh data", () => {
  const e = new AlertEngine([]);
  const fly = { B1212: 1, B1214: 0, U1005: 0, R3499: 0, B1060: 1 };
  e.evaluate(ctx(fly, { now: 0, phase: 2 }));
  e.evaluate(ctx(fly, { now: 1000, phase: 2 }));
  e.ack("engine-out");
  const gap = e.evaluate(ctx(fly, { now: 2000, phase: 2, staleAll: true, telemetryAlive: false }));
  const eo = gap.active.find((x) => x.id === "engine-out")!;
  assert.ok(eo, "held during the gap");
  assert.equal(eo.acked, true);
  assert.equal(eo.stale, true);
  const back = e.evaluate(ctx(fly, { now: 3000, phase: 2 })).active.find((x) => x.id === "engine-out")!;
  assert.equal(back.acked, true, "no re-annunciation");
  assert.equal(e.evaluate(ctx({ ...fly, U1005: 2, R3499: 5500 }, { now: 4000, phase: 2 })).active.some((x) => x.id === "engine-out"), false);
});

test("one link alert: no flapping when only the 4 s System status arrives", () => {
  const e = new AlertEngine([]);
  const ids: string[] = [];
  for (let t = 0; t < 12000; t += 250) {
    const apAlive = t % 4000 < 1000;   // a frame (50008) every 4 s keeps apAlive true for 1 s
    const a = e.evaluate(ctx({}, { now: t, phase: 2, apAlive, telemetryAlive: false })).active;
    ids.push(a.filter((x) => x.segment === "LINK").map((x) => x.id).join(","));
  }
  assert.ok(ids.every((x) => x === "ap-link"), "always exactly the one link alert");
  assert.equal(e.evaluate(ctx({}, { now: 12000, phase: 2, apAlive: true, telemetryAlive: false })).historyCount, 1, "a single activation");
});

test("reset forgets alerts and acknowledgements (new autopilot adopted)", () => {
  const e = new AlertEngine(DEFS);
  e.evaluate(ctx({ B1060: 0 }, { now: 0 })); e.evaluate(ctx({ B1060: 0 }, { now: 1000 }));
  e.ack("ap-B1060-0");
  e.reset();
  assert.equal(e.evaluate(ctx({ B1060: 0 }, { now: 1100 })).active.length, 0, "onset delay starts again");
  const a = e.evaluate(ctx({ B1060: 0 }, { now: 2100 })).active[0];
  assert.equal(a.acked, false);
});
