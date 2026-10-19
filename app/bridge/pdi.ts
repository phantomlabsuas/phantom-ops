// Loads what the bridge needs from a Veronte 1x PDI export (ver_spdif_*.xml):
// telemetry vectors (tm.xml), variable names, button-event names and the vehicle name.
// Layouts are loaded at run time, never hard-coded (veronte/reference/telemetry-feedback.md §6).
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { XMLParser } from "fast-xml-parser";

export type FieldKind = "bit" | "uinteger16" | "real-float32" | "pos_abs";
export interface Field { key: string; kind: FieldKind; bits: number; scale: number }
export interface Vector { name: string; enable: number; periodS: number; fields: Field[]; packedBits: number }

export interface Pdi {
  name: string;
  setupDir: string;
  vehicleName: string;
  vectors: Vector[];
  varNames: Record<string, string>;
  /** button events (type 9): id -> name */
  buttonEvents: Record<number, string>;
}

const BITS: Record<FieldKind, number> = { bit: 1, uinteger16: 16, "real-float32": 32, pos_abs: 96 };
const TM_KIND: Record<number, string> = { 0: "R", 2: "U", 3: "B", 10: "P" };

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  isArray: (name) => name === "str-tunarray-element",
});

function load(dir: string, name: string): any {
  const path = join(dir, `ver_spdif_${name}.xml`);
  return parser.parse(readFileSync(path, "utf-8"));
}

const arr = (x: any): any[] => (x == null ? [] : Array.isArray(x) ? x : [x]);

export function loadPdi(name: string, setupDir: string): Pdi {
  if (!existsSync(join(setupDir, "ver_spdif_tm.xml"))) throw new Error(`no ver_spdif_tm.xml in ${setupDir}`);

  const tm = load(setupDir, "tm")["entry-tm"].data;
  const vectors: Vector[] = arr(tm["str-tunarray-element"]).map((v: any, i: number) => {
    let bit = 0;
    const fields: Field[] = arr(v.fields?.["str-tunarray-element"]).map((fe: any) => {
      const fs = fe["data-fieldset"];
      const kind = Object.keys(fs)[0] as FieldKind;
      const f = fs[kind];
      const k = TM_KIND[Number(f.type)];
      // An unknown field kind would shift every later field: refuse the vector rather than decode garbage.
      if (!(kind in BITS) || !k) throw new Error(`V${i}: unsupported telemetry field <${kind}> type ${f?.type}`);
      const field = { key: `${k}${f.id}`, kind, bits: BITS[kind], scale: f.scale != null ? Number(f.scale) : 1 };
      bit += field.bits;
      return field;
    });
    return { name: `V${i}`, enable: Number(v.enable), periodS: Number(v.periode), fields, packedBits: bit };
  });

  const varNames: Record<string, string> = {};
  for (const [k, file, root] of [["B", "mbit", "entry-mbit"], ["U", "muvar", "entry-muvar"], ["R", "mrvar", "entry-mrvar"]] as const) {
    for (const el of arr(load(setupDir, file)[root].data?.map?.["str-tunarray-element"])) {
      const n = (el.description?.name ?? el.value?.description?.name ?? "").toString().trim();
      if (n) varNames[`${k}${el.id}`] = n;
    }
  }

  const evTypes: Record<number, number> = {};
  for (const el of arr(load(setupDir, "events")["entry-events"].data["str-tunarray-element"])) {
    evTypes[Number(el["@_str-tunarray-key"])] = Number(el.data.type);
  }
  const buttonEvents: Record<number, string> = {};
  for (const el of arr(load(setupDir, "mevent")["entry-mevent"].data.map["str-tunarray-element"])) {
    const id = Number(el["@_str-tunarray-key"]);
    if (evTypes[id] === 9) buttonEvents[id] = String(el.data?.name ?? "").trim();
  }

  let vehicleName = "";
  try { vehicleName = String(load(setupDir, "mname")["entry-mname"].data.name ?? ""); } catch { /* optional */ }

  return { name, setupDir, vehicleName, vectors, varNames, buttonEvents };
}

/** PDI event names are stored truncated to this many characters. */
const NAME_LEN = 25;
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Find a button event by name. Matches only the exact name or its 25-character truncation, and fails closed
 *  (null) when no event or more than one event matches, so a renamed PDI event can never be confused. */
export function findButtonEvent(pdi: Pdi, name: string): number | null {
  const want = norm(name), wantCut = norm(name.slice(0, NAME_LEN));
  const hits = Object.entries(pdi.buttonEvents).filter(([, n]) => { const have = norm(n); return have === want || have === wantCut; });
  return hits.length === 1 ? Number(hits[0][0]) : null;
}
