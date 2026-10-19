// Telemetry 50020 decoder (veronte/reference/telemetry-feedback.md).
// Payload LE: Float32 timestamp (s) · Uint32 hash · bit stream of the vector's fields, LSB first, no padding.
import type { Vector } from "./pdi.ts";
import type { VarValue } from "../shared/protocol.ts";

const f32 = new DataView(new ArrayBuffer(4));

function readBits(buf: Buffer, pos: number, n: number): number {
  let v = 0;
  for (let i = 0; i < n; i++) {
    const b = pos + i;
    if ((buf[b >> 3] >> (b & 7)) & 1) v += 2 ** i;
  }
  return v;
}

const toInt32 = (u: number) => (u >= 0x80000000 ? u - 0x100000000 : u);

export interface Decoded { time: number; hash: number; values: [string, VarValue][] }

export function telemetryHeader(payload: Buffer): { time: number; hash: number } | null {
  if (payload.length < 8) return null;
  return { time: payload.readFloatLE(0), hash: payload.readUInt32LE(4) };
}

/** Decode a 50020 payload with a known vector layout. Returns null unless the body is the layout's size or one
 *  padding byte longer (the AP pads to an even length: V1 = 417 + 1 B). This catches most wrong hash→vector entries,
 *  but not two vectors of the same byte size (V1 and V7 are both 417 B): the hash table must be right. */
export function decodeTelemetry(payload: Buffer, vec: Vector): Decoded | null {
  const h = telemetryHeader(payload);
  if (!h) return null;
  const body = payload.subarray(8);
  const need = Math.ceil(vec.packedBits / 8);
  if (body.length < need || body.length > need + 1) return null;
  const values: [string, VarValue][] = [];
  let pos = 0;
  for (const f of vec.fields) {
    let v: VarValue;
    switch (f.kind) {
      case "bit": v = readBits(body, pos, 1); break;
      case "uinteger16": v = readBits(body, pos, 16); break;
      case "real-float32": {
        f32.setUint32(0, readBits(body, pos, 32), true);
        const x = f32.getFloat32(0, true) * f.scale;
        v = Number.isFinite(x) ? x : null;   // NaN / ±Inf = invalid (JSON could not carry them anyway)
        break;
      }
      case "pos_abs":
        v = [toInt32(readBits(body, pos, 32)), toInt32(readBits(body, pos + 32, 32)), toInt32(readBits(body, pos + 64, 32))];
        break;
    }
    values.push([f.key, v]);
    pos += f.bits;
  }
  return { time: h.time, hash: h.hash, values };
}
