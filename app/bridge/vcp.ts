// VCP codec for Veronte Link's application interface (veronte/integration-guide.md §3, reference/vcp-protocol.md).
// Application framing: Reserved(2) Len(2) Src(4) Dst(4) Type(2) Props(2) | payload | [CRC-32]
// Header big endian; private-message payloads little endian.
import { crc32 } from "node:zlib";

export const TYPE = {
  ACK: 17000,
  DISCOVERY: 50001,
  USER_EVENT: 50002,
  SYSTEM_STATUS: 50008,
  TELEMETRY: 50020,
  CONFIG: 50041,
} as const;

export const HEADER_LEN = 16;
const CHK_LEN = [0, 2, 4, 4];

export interface Frame {
  src: number;
  dst: number;
  type: number;
  props: number;
  payload: Buffer;
  checksumOk: boolean | null;
}

export function makeProps(ack = true, idd = 32, checksumType = 3): number {
  return ((idd & 0x7f) << 8) | ((checksumType & 3) << 6) | (ack ? 0x8000 : 0);
}

export function buildFrame(src: number, dst: number, type: number, payload: Buffer, ack = true): Buffer {
  const head = Buffer.alloc(HEADER_LEN);
  head.writeUInt16BE(0, 0);
  head.writeUInt16BE(payload.length, 2);
  head.writeUInt32BE(src >>> 0, 4);
  head.writeUInt32BE(dst >>> 0, 8);
  head.writeUInt16BE(type, 12);
  head.writeUInt16BE(makeProps(ack), 14);
  const body = Buffer.concat([head, payload]);
  const chk = Buffer.alloc(4);
  chk.writeUInt32BE(crc32(body) >>> 0, 0);
  return Buffer.concat([body, chk]);
}

export function parseFrame(d: Buffer): Frame | null {
  if (d.length < HEADER_LEN) return null;
  const len = d.readUInt16BE(2);
  const props = d.readUInt16BE(14);
  const chkType = (props >> 6) & 3;
  const end = HEADER_LEN + len;
  if (d.length < end + CHK_LEN[chkType]) return null;
  let checksumOk: boolean | null = null;
  if (chkType === 3) checksumOk = d.readUInt32BE(end) === (crc32(d.subarray(0, end)) >>> 0);
  return {
    src: d.readUInt32BE(4),
    dst: d.readUInt32BE(8),
    type: d.readUInt16BE(12),
    props,
    payload: d.subarray(HEADER_LEN, end),
    checksumOk,
  };
}

// --- User Event (50002): trigger a PDI button event ------------------------------------------------------
export function buildUserEvent(src: number, dst: number, eventId: number, rxId: number): Buffer {
  const p = Buffer.alloc(8);
  p.writeUInt16LE(0, 0);
  p.writeUInt16LE(eventId, 2);
  p.writeUInt32LE(rxId >>> 0, 4);
  return buildFrame(src, dst, TYPE.USER_EVENT, p);
}

export interface UserEventReply { ack: number; eventId: number; rxId: number; enabled: number; user: number; licence: number }

export function parseUserEventReply(f: Frame): UserEventReply | null {
  if (f.type !== TYPE.USER_EVENT || f.payload.length < 14) return null;
  const p = f.payload;
  return { ack: p.readUInt16LE(0), eventId: p.readUInt16LE(2), rxId: p.readUInt32LE(4),
           enabled: p.readUInt16LE(8), user: p.readUInt16LE(10), licence: p.readUInt16LE(12) };
}

// --- Variable set (50041, configurable #235) --------------------------------------------------------------
// Destination kind uses the PDI vref encoding: Real 0, Uint 1, Bit 2.
const VREF_KIND: Record<string, number> = { R: 0, U: 1, B: 2 };

export function varSetData(kind: "R" | "U" | "B", id: number, value: number): Buffer {
  const b = Buffer.alloc(14);
  b.writeUInt16LE(0, 0);          // mode
  b.writeUInt16LE(1, 2);          // entries
  b.writeUInt16LE(VREF_KIND[kind], 4);
  b.writeUInt16LE(id, 6);
  b.writeUInt16LE(0xfffe, 8);     // source: constant
  b.writeFloatLE(value, 10);
  return b;
}

export function buildVarSet(src: number, dst: number, kind: "R" | "U" | "B", id: number, value: number): Buffer {
  const head = Buffer.alloc(10);
  head.writeUInt16LE(2, 0);       // SET
  head.writeUInt16LE(235, 2);     // Variable set
  head.writeUInt16LE(7, 4); head.writeUInt16LE(8, 6); head.writeUInt16LE(1, 8); // PDI version as Ops sends it
  return buildFrame(src, dst, TYPE.CONFIG, Buffer.concat([head, varSetData(kind, id, value)]));
}

/** Data part of a #235 echo (argument 3), to compare with the request; null otherwise. */
export function parseVarSetEcho(f: Frame): Buffer | null {
  if (f.type !== TYPE.CONFIG || f.payload.length < 10) return null;
  if (f.payload.readUInt16LE(0) !== 3 || f.payload.readUInt16LE(2) !== 235) return null;
  return f.payload.subarray(10);
}

// --- System status (50008) --------------------------------------------------------------------------------
export interface SystemStatus { appId: number; uptimeMs: number; phase: number | null; mode: number | null }

export function parseSystemStatus(f: Frame): SystemStatus | null {
  if (f.type !== TYPE.SYSTEM_STATUS || f.payload.length < 7) return null;
  const p = f.payload;
  const arg = p.readUInt16LE(0);
  const appId = p[6];
  if (arg !== 0 || p.length < 13) return { appId, uptimeMs: NaN, phase: null, mode: null };
  return { appId, uptimeMs: p.readUInt32LE(7), phase: p[11], mode: p[12] };
}
