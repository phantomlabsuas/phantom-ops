// Checks the codec against the byte examples verified in veronte/reference (SIL captures).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFrame, buildUserEvent, buildVarSet, parseFrame, parseUserEventReply, TYPE } from "./vcp.ts";

const hex = (s: string) => Buffer.from(s.replace(/\s+/g, ""), "hex");

test("User Event 78 from 1000 to 6041 matches link-architecture §9.3", () => {
  const f = buildUserEvent(1000, 6041, 78, 0xdde0a265);
  assert.equal(f.toString("hex"), hex("00 00 00 08 00 00 03 E8 00 00 17 99 C3 52 A0 C0 00 00 4E 00 65 A2 E0 DD 80 76 0D FF").toString("hex"));
});

test("Discovery from 1000 to 6041 matches link-architecture §9.2", () => {
  const f = buildFrame(1000, 6041, TYPE.DISCOVERY, Buffer.alloc(14));
  assert.equal(f.subarray(-4).toString("hex"), "803e6a09");
});

test("Variable set B1241 := 1 from 1000 matches variable-write §6.2", () => {
  const f = buildVarSet(1000, 6041, "B", 1241, 1.0);
  assert.equal(f.toString("hex"),
    hex("00 00 00 18 00 00 03 E8 00 00 17 99 C3 79 A0 C0 02 00 EB 00 07 00 08 00 01 00 00 00 01 00 02 00 D9 04 FE FF 00 00 80 3F 70 03 B0 09").toString("hex"));
});

test("parse a User Event reply", () => {
  const head = hex("00 00 00 0E 00 00 17 99 00 00 03 E8 C3 52 20 00");
  const f = parseFrame(Buffer.concat([head, hex("01 00 4E 00 65 A2 E0 DD 01 00 01 00 01 00")]))!;
  const r = parseUserEventReply(f)!;
  assert.deepEqual(r, { ack: 1, eventId: 78, rxId: 0xdde0a265, enabled: 1, user: 1, licence: 1 });
});
