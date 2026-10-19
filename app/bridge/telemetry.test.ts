// Decoding regression tests on real Veronte Link output (SIL 6041, Maintenance PDI), captured 2026-10-16.
// Expected values are from an independent decoder that matched the bridge on 89,185 live samples.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrame, parseSystemStatus, TYPE } from "./vcp.ts";
import { loadPdi, findButtonEvent } from "./pdi.ts";
import { decodeTelemetry, telemetryHeader } from "./telemetry.ts";

const here = dirname(fileURLToPath(import.meta.url));
const frames = readFileSync(join(here, "fixtures/link-sil-2026-10-16.jsonl"), "utf-8").trim().split("\n")
  .map((l) => JSON.parse(l) as { rx: number; type: number; d: string })
  .map((r) => ({ ...r, buf: Buffer.from(r.d, "base64") }));

const MAINT = "C:/Projects/Operational/phantomhawk-maint/veronte/Maint PDI/setup";
const hasPdi = existsSync(join(MAINT, "ver_spdif_tm.xml"));
const HASH = { V0: 0x347392f9, V1: 0xd7463605, V2: 0x1e9bc63c };

test("every captured datagram parses as application framing from AP 6041", () => {
  for (const f of frames) {
    const p = parseFrame(f.buf);
    assert.ok(p, `type ${f.type}`);
    assert.equal(p.src, 6041);
    assert.equal(p.type, f.type);
    assert.equal(p.checksumOk, null); // AP traffic carries no optional checksum (Props 0x2000)
  }
});

test("System status 50008: autopilot application, phase STANDBY", () => {
  const s = parseSystemStatus(parseFrame(frames.find((f) => f.type === TYPE.SYSTEM_STATUS)!.buf)!);
  assert.ok(s);
  assert.equal(s.appId, 3);
  assert.equal(s.phase, 0);
  assert.ok(s.uptimeMs > 0);
});

test("V0 / V1 / V2 decode to the independently verified values", { skip: !hasPdi && "Maintenance PDI not on this machine" }, () => {
  const pdi = loadPdi("Maintenance PDI", MAINT);
  const vec = (n: string) => pdi.vectors.find((v) => v.name === n)!;
  assert.equal(vec("V0").packedBits, 985);
  assert.equal(vec("V1").packedBits, 3330);
  assert.equal(vec("V2").packedBits, 704);
  const values: Record<string, unknown> = {};
  for (const f of frames.filter((x) => x.type === TYPE.TELEMETRY)) {
    const p = parseFrame(f.buf)!;
    const h = telemetryHeader(p.payload)!;
    const name = Object.entries(HASH).find(([, v]) => v === h.hash)?.[0];
    assert.ok(name, `hash 0x${h.hash.toString(16)}`);
    const dec = decodeTelemetry(p.payload, vec(name));
    assert.ok(dec, `${name} decodes`);
    for (const [k, v] of dec.values) values[k] = v;
  }
  assert.equal(Object.keys(values).length, 380);
  const near = (k: string, want: number, tol = 1e-6) => assert.ok(Math.abs((values[k] as number) - want) < tol, `${k}=${values[k]}`);
  near("R501", 0.426994264);   // 24.46497 N
  near("R500", 0.953620315);   // 54.63842 E
  near("R3", 2.229, 0.01);
  assert.equal(values.U1, 0);
  assert.equal(values.B1213, 1);
  assert.equal(values.R2094, null); // NaN in the SIL → null
});

test("a payload of the wrong size for its vector is rejected", { skip: !hasPdi && "Maintenance PDI not on this machine" }, () => {
  const pdi = loadPdi("Maintenance PDI", MAINT);
  const v1 = parseFrame(frames.find((f) => f.type === TYPE.TELEMETRY && parseFrame(f.buf)!.payload.length === 426)!.buf)!;
  assert.equal(decodeTelemetry(v1.payload, pdi.vectors[0]), null);                 // V1 bytes with the V0 layout
  assert.ok(decodeTelemetry(v1.payload, pdi.vectors[1]));                           // 417 + 1 padding byte accepted
  assert.equal(decodeTelemetry(Buffer.concat([v1.payload, Buffer.alloc(2)]), pdi.vectors[1]), null);
});

test("button events resolve exactly (or by 25-char truncation) and fail closed otherwise", { skip: !hasPdi && "Maintenance PDI not on this machine" }, () => {
  const pdi = loadPdi("Maintenance PDI", MAINT);
  assert.equal(findButtonEvent(pdi, "TAKE-OFF READY Button"), 2);
  assert.equal(findButtonEvent(pdi, "TAKE-OFF Button"), 4);
  assert.equal(findButtonEvent(pdi, "HOLD Button"), 14);
  assert.equal(findButtonEvent(pdi, "RETURN HOME Button"), 80);
  assert.equal(findButtonEvent(pdi, "SET IAS CMD MODE MINIMUM"), 93);   // PDI name has a trailing space
  assert.equal(findButtonEvent(pdi, "IAS CMD MODE MAXIMUM BUTTON"), 95); // stored truncated to 25 characters
  assert.equal(findButtonEvent(pdi, "TAKE-OFF"), null);                  // a prefix alone never matches
  assert.equal(findButtonEvent(pdi, "LANDING"), null);
});
