// Link glue (pure functions used by main.ts): message validation, Origin check, AP lock, phase freshness.
import { test } from "node:test";
import assert from "node:assert/strict";
import { gatingPhase, isClientMsg, originAllowed, shouldAdoptAp } from "./link.ts";

test("client messages are validated before use", () => {
  assert.ok(isClientMsg({ type: "ackAll" }));
  assert.ok(isClientMsg({ type: "ack", id: "ap-B1060-0" }));
  assert.ok(isClientMsg({ type: "command", id: "hold", stage: "arm" }));
  assert.ok(isClientMsg({ type: "command", id: "fuelSet", value: 5 }));
  for (const bad of [null, 42, "x", [], {}, { type: "ack" }, { type: "ack", id: 5 }, { type: "command", id: "__proto__" },
                     { type: "command", id: "toString" }, { type: "command", id: "hold", stage: "go" },
                     { type: "command", id: "fuelSet", value: "5" }, { type: "command", id: "fuelSet", value: Infinity }, { type: "rm -rf" }])
    assert.equal(isClientMsg(bad), false, JSON.stringify(bad));
});

test("only the UI's origins (or no Origin header) may connect", () => {
  const allowed = ["http://127.0.0.1:5173", "http://localhost:5173"];
  assert.ok(originAllowed(undefined, allowed));
  assert.ok(originAllowed("http://localhost:5173", allowed));
  for (const o of ["http://evil.example", "null", "http://127.0.0.1:5174", "https://127.0.0.1:5173"]) assert.equal(originAllowed(o, allowed), false, o);
});

test("the autopilot address is locked while the current unit is alive and for 5 s after it goes silent", () => {
  assert.equal(shouldAdoptAp(null, 6041, null, 1000, 5000), true);
  assert.equal(shouldAdoptAp(6041, 6041, 10, 1000, 5000), false);
  assert.equal(shouldAdoptAp(6041, 6248, 200, 1000, 5000), false);   // current alive
  assert.equal(shouldAdoptAp(6041, 6248, 3000, 1000, 5000), false);  // silent, but not long enough
  assert.equal(shouldAdoptAp(6041, 6248, 5000, 1000, 5000), true);
});

test("commands see the phase as unknown once it has not been confirmed for a while", () => {
  assert.equal(gatingPhase(9, 200, 5000), 9);
  assert.equal(gatingPhase(9, 6000, 5000), null);
  assert.equal(gatingPhase(9, null, 5000), null);
  assert.equal(gatingPhase(null, 10, 5000), null);
});
