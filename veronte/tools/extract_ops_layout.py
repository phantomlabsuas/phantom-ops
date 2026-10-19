"""Cross-reference a Veronte Ops workspace (.vws) with the Veronte 1x PDI.

Produces the tables in ../generated/ that tell Phantom OPS, for every element of the
Veronte Ops "Operational" layout:
  - which autopilot variable it reads, and whether that variable arrives in an
    always-on telemetry vector (V0-V2), a conditional vector, or not at all;
  - which button event it triggers (VCP 50002) and what the PDI automations then do;
  - which variable it writes (VCP 50041, configurable #235);
  - which alerts it raises.

Usage:
  python -I extract_ops_layout.py <Operational.vws> <PDI setup dir> <output dir>

Standard library only. Re-run whenever the layout or the PDI changes.
"""
import csv
import json
import re
import sys
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

# Variable kind codes. Ops (vRefIO.vRef.systemVar) and tm.xml use one encoding,
# vref-var in events/limits/actions and the 50041 variable set use another.
KIND_TM = {0: "R", 2: "U", 3: "B", 10: "P"}       # tm.xml <type>, Ops systemVar
KIND_VREF = {0: "R", 1: "U", 2: "B"}              # vref-var <type>, 50041 dest type
FIELD_BITS = {"bit": 1, "uinteger16": 16, "real-float32": 32, "pos_abs": 96}

WIDGET_NAMES = {
    0: "Label", 1: "Map", 2: "Chart", 3: "Scatter", 4: "Gauge", 5: "Bar", 6: "Image",
    7: "Veronte Panel", 8: "Slider", 9: "Attitude", 10: "Heading", 11: "Action Button",
    12: "Text", 13: "Iframe", 14: "Input Data", 15: "Video", 16: "Veronte Alerts",
    17: "Stick", 18: "Dial Button", 20: "Roll Tape", 21: "Timer", 22: "Gimbal Buttons",
    23: "Gimbal Setup", 24: "Stick Buttons", 25: "ADS-B", 26: "Knob",
    27: "Group conditional", 28: "Lights", 29: "Engine Command", 30: "Flight Termination",
    31: "Battery Report", 32: "Tanks Status", 33: "Alerts", 34: "Electrical Report",
    35: "Vehicle Auxiliary", 36: "GPS Report", 37: "Wind", 38: "Group button",
    40: "Script", 41: "Label Script",
}
WRITE_WIDGETS = {8, 14, 26}   # Slider, Input Data, Knob write the bound variable
PHASES = {0: "STANDBY", 1: "TAKE-OFF", 2: "ROUTE", 3: "LANDING", 4: "HOLD", 5: "HOVER",
          6: "FBX", 7: "NTC", 9: "TAKE-OFF READY", 10: "RETURN HOME", 12: "HDG",
          13: "ARMED", 20: "INITIAL"}


def xml_root(setup: Path, name: str):
    return ET.parse(setup / f"ver_spdif_{name}.xml").getroot()


# Proposed Phantom OPS health-strip segment for an alert, by keywords in its text (first match wins).
# A draft for review, not a decision: see veronte/ops-layout-data-map.md.
SEGMENT_RULES = [
    ("LIFT", ("esc", "motors sync", "motors / pitot")),
    ("FUEL", ("fuel",)),
    ("ELEC", ("pmu", "battery", "generator", "voltage fault", "12v", "6v")),
    ("ENG", ("ecu", "engine", "cht", "throttle", "rpm")),
    ("LINK", ("uplink", "link", "fbx", "epb", "switch box", "knob")),
    ("NAV", ("imu", "gps", "gnss", "dgps", "mag", "position", "ekf", "ins ", "srtm", "qnh", "pitot", "ias",
             "altitude", "sensor", "lidar", "pitch", "roll", "heading")),
    ("AP", ("autopilot", "ops ", "cpu", "pdi", "file system", "io core")),
]


def proposed_segment(text):
    t = text.lower() + " "
    for seg, words in SEGMENT_RULES:
        if any(w in t for w in words):
            return seg
    return "AP"


def load_names(setup: Path):
    names = {}
    for kind, f in (("B", "mbit"), ("U", "muvar"), ("R", "mrvar")):
        for el in xml_root(setup, f).find("data/map"):
            vid = int(el.findtext("id"))
            n = (el.findtext("description/name") or el.findtext("value/description/name") or "").strip()
            if n:
                names[(kind, vid)] = n
    return names


def load_vectors(setup: Path):
    vectors = []
    for vi, v in enumerate(xml_root(setup, "tm").find("data")):
        fields, bit = [], 0
        for fs in v.find("fields"):
            k = list(fs.find("data-fieldset"))[0]
            kind = KIND_TM[int(k.findtext("type"))]
            fields.append({"kind": kind, "id": int(k.findtext("id")), "field": k.tag,
                           "bit_offset": bit, "bits": FIELD_BITS[k.tag]})
            bit += FIELD_BITS[k.tag]
        vectors.append({"vector": f"V{vi}", "enable": int(v.findtext("enable")),
                        "period_s": float(v.findtext("periode")),
                        "dst": int(v.findtext("address/uav")), "fields": fields,
                        "packed_bits": bit})
    return vectors


def summarise_action(a):
    tag, s = a.tag, a.find("str")
    if tag == "acset-phase":
        p = int(s.findtext("phase-cmd"))
        return f"phase -> {p} {PHASES.get(p, '')}".strip()
    if tag == "acset-mode":
        return f"mode -> {s.findtext('mode')}"
    if tag == "acset-var":
        out = []
        for e in s.iter("str-tunarray-element"):
            d = e.find("destination/vref-var")
            if d is None:
                continue
            dst = f"{KIND_VREF.get(int(d.findtext('type')), '?')}{d.findtext('id')}"
            src = e.find("source")
            kv = src.find(".//kval") if src is not None else None
            sv = src.find(".//vref-var") if src is not None else None
            if kv is not None and kv.text and kv.text.strip():
                out.append(f"{dst} := {kv.text.strip()}")
            elif sv is not None:
                out.append(f"{dst} := {KIND_VREF.get(int(sv.findtext('type')), '?')}{sv.findtext('id')}")
            else:
                out.append(f"{dst} := ?")
        return "set " + ", ".join(out)
    if tag == "acset-gpio":
        cmd = list(s.find("gpio/command-choice"))[0].tag
        return f"GPIO {s.findtext('gpio/id')} {cmd}"
    if tag == "acset-step":
        return f"run operation {s.findtext('operation-id')}"
    if tag == "acset-detour-cmd":
        return "detour " + list(s.find("detour-cmd"))[0].tag.replace("type-detour-", "")
    if tag == "acset-can-tx":
        return f"CAN tx producer {s.findtext('tx/producer')} msg {s.findtext('tx/custom-message')}"
    if tag == "acset-uclk":
        return f"user timer {s.findtext('uclk/ntimer')}"
    if tag == "acset-fmem":
        return f"store position mem {s.findtext('fmem/mem-idx')}"
    if tag == "acset-block":
        return f"block cmd sel {s.findtext('sel-idx')}"
    return tag


def load_pdi_logic(setup: Path):
    events = {}
    for el in xml_root(setup, "events").find("data"):
        d = el.find("data")
        events[int(el.get("str-tunarray-key"))] = {
            "type": int(d.findtext("type")),
            "indexes": [int(i.text) for i in (d.find("indexes") if d.find("indexes") is not None else [])]}
    ev_names = {int(el.get("str-tunarray-key")): el.findtext("data/name")
                for el in xml_root(setup, "mevent").find("data/map")}
    act_names = {int(el.get("str-tunarray-key")): el.findtext("data/name/name")
                 for el in xml_root(setup, "maction").find("data/map")}
    actions = {int(el.get("str-tunarray-key")): summarise_action(list(el.find("data"))[0])
               for el in xml_root(setup, "actions").find("data/action-array")}
    auto_names = {int(el.get("str-tunarray-key")): el.findtext("data/name")
                  for el in xml_root(setup, "mevact").find("data/map")}

    def cond(node):
        if node is None:
            return ""
        for c in node:
            if c.tag == "event":
                return f"E{c.findtext('param')}"
            if c.tag == "and-or":
                op = " AND " if c.findtext("type") == "1" else " OR "
                parts = [cond(e.find("data-elem-list-nodes")) for e in c.find("list-nodes")]
                return "(" + op.join(p for p in parts if p) + ")"
            if c.tag == "not":
                return "NOT " + cond(c)
            r = cond(c)
            if r:
                return r
        return ""

    automations = []
    for el in xml_root(setup, "evact").find("data"):
        d, key = el.find("data"), int(el.get("str-tunarray-key"))
        c = cond(d.find("node"))
        automations.append({
            "id": key, "name": auto_names.get(key, ""), "enabled": d.findtext("enabled") == "1",
            "condition": c, "events": [int(x) for x in re.findall(r"E(\d+)", c)],
            "actions": [int(a.text) for a in (d.find("actions") if d.find("actions") is not None else [])]})
    return events, ev_names, actions, act_names, automations


def event_text(eid, events):
    e = events.get(eid)
    if not e:
        return f"E{eid}"
    t, ix = e["type"], e["indexes"]
    if t == 1:
        return "phase in " + "/".join(PHASES.get(i, str(i)) for i in ix)
    if t == 4:
        return " & ".join(f"B{i}=1" for i in ix)
    if t == 5:
        return " & ".join(f"B{i}=0" for i in ix)
    if t == 9:
        return "BUTTON"
    if t == 6:
        return "mode in " + "/".join(map(str, ix))
    if t == 2:
        return "limits " + ",".join(map(str, ix))
    return f"type {t} {ix}"


def automation_effects(eid, automations, events, actions):
    """Readable 'condition -> actions' for every enabled automation that uses event eid."""
    out = []
    for a in automations:
        if eid not in a["events"] or not a["enabled"]:
            continue
        cond = re.sub(r"E(\d+)", lambda m: "BUTTON" if int(m.group(1)) == eid
                      else f"[{event_text(int(m.group(1)), events)}]", a["condition"])
        acts = "; ".join(f"A{x} {actions.get(x, '?')}" for x in a["actions"])
        out.append(f"{a['name']}: {cond} -> {acts}")
    return " || ".join(out) or "none"


def walk_widgets(node, path, out):
    if isinstance(node, dict):
        if "widgetTypeId" in node:
            out.append((node, tuple(path)))
            if node.get("name"):
                path = path + [node["name"]]
        for k, v in node.items():
            walk_widgets(v, path, out)
    elif isinstance(node, list):
        for v in node:
            walk_widgets(v, path, out)


def ranges_text(rng):
    out = []
    for r in (rng or {}).get("ranges", []) or []:
        s, e = r.get("start"), r.get("end")
        out.append(f"{r.get('name', '')}[{'' if s is None else s}..{'' if e is None else e}]{r.get('color', '')}")
    return "; ".join(out)


def main(vws, setup, outdir):
    vws, setup, outdir = Path(vws), Path(setup), Path(outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    layout = json.load(open(vws, encoding="utf-8-sig"))
    names = load_names(setup)
    vectors = load_vectors(setup)
    events, ev_names, actions, act_names, automations = load_pdi_logic(setup)

    where = defaultdict(list)   # (kind,id) -> ["V1", ...]
    for v in vectors:
        for f in v["fields"]:
            where[(f["kind"], f["id"])].append(v["vector"])
    always = {v["vector"] for v in vectors if v["enable"] == 1}
    vec_enable = {v["vector"]: v["enable"] for v in vectors}

    def availability(key):
        vs = where.get(key, [])
        if any(v in always for v in vs):
            return "always (" + ",".join(v for v in vs if v in always) + ")"
        if vs:
            return "conditional (" + ",".join(f"{v} if B{vec_enable[v]}" for v in vs) + ")"
        return "NOT IN TELEMETRY"

    widgets = []
    walk_widgets(layout["widgets"], [], widgets)

    bindings, writes, buttons, alerts, scripts, conds = [], [], [], [], [], []
    for w, path in widgets:
        t = w["widgetTypeId"]
        grp = " / ".join(path)
        for ref in w.get("vRefIO") or []:
            vr = ref.get("vRef")
            if not isinstance(vr, dict) or vr.get("id") is None:
                continue
            key = (KIND_TM.get(vr.get("systemVar"), "?"), vr["id"])
            addr = ref.get("uavAddress", 0)
            props = ref.get("properties") or {}
            row = {
                "group": grp, "widget": WIDGET_NAMES.get(t, t), "widget_id": w["id"],
                "var": f"{key[0]}{key[1]}", "description": ref.get("description") or "",
                "pdi_name": names.get(key, "") if addr == 0 else "", "unit": ref.get("unit", ""),
                "decimals": ref.get("decimals", ""), "source": "AP" if addr == 0 else f"device {addr}",
                "telemetry": availability(key) if addr == 0 else "other device",
                "label": props.get("overrideDescription") or w.get("overrideLabel")
                         or (w["title"] if isinstance(w.get("title"), str) else "") or "",
                "ranges": ranges_text(props.get("dataRange")) or ranges_text(w.get("dataRange")),
            }
            if t == 16:
                p = props
                alerts.append({"panel": "PCS" if (w.get("uavAddress") or addr) else "UAV", "var": row["var"],
                               "alert_text": p.get("overrideDescription") or row["description"],
                               "pdi_description": row["description"], "type": p.get("type", ""),
                               "trigger_on": p.get("triggerOn", ""), "delay_ms": p.get("milliseconds", ""),
                               "sound": p.get("sound", ""), "source": row["source"],
                               "proposed_segment": proposed_segment(p.get("overrideDescription") or row["description"]),
                               "telemetry": row["telemetry"]})
                continue
            if t in WRITE_WIDGETS:
                writes.append({**row, "range": f"{w.get('min', '')}..{w.get('max', '')} step {w.get('step', '')}".strip()
                               if t == 8 else "", "command": "VCP 50041 #235 variable set"})
            else:
                bindings.append(row)
        if t == 11:
            eid, dev = w.get("idx"), w.get("uavAddress") or 0
            if dev:   # event belongs to another device's configuration (e.g. the PCS), not the AP PDI
                buttons.append({"group": grp, "label": w.get("overrideLabel") or "", "event_id": eid,
                                "event_name": "", "event_type": "", "source": f"device {dev}",
                                "automations": "not in the AP PDI (event of that device)"})
            else:
                buttons.append({"group": grp, "label": w.get("overrideLabel") or "", "event_id": eid,
                                "event_name": ev_names.get(eid, ""),
                                "event_type": events.get(eid, {}).get("type", ""), "source": "AP",
                                "automations": automation_effects(eid, automations, events, actions)})
        if t == 27 and (w.get("checkText") or "").strip():
            expr = w["checkText"].strip()
            dev = w.get("uavAddress") or 0
            refs = sorted(set(re.findall(r"([bru])var(\d+)", expr)), key=lambda x: (x[0], int(x[1])))
            conds.append({"group_path": grp, "name": w.get("name", ""), "source": "AP" if not dev else f"device {dev}",
                          "expression": expr,
                          "vars": ", ".join(f"{k.upper()}{i}" for k, i in refs),
                          "telemetry": "; ".join(f"{k.upper()}{i}: " + (availability((k.upper(), int(i))) if not dev else "other device")
                                                 for k, i in refs)})
        if t in (40, 41):
            calls = sorted(set(re.findall(r"(\w+Var)\(\s*(\d+)\s*,\s*(\d+)", w.get("code", ""))))
            scripts.append({"group": grp, "widget": WIDGET_NAMES[t], "widget_id": w["id"],
                            "vars": ", ".join(f"{KIND_TM.get(int(k), '?')}{i} ({fn}, "
                                              f"{availability((KIND_TM.get(int(k), '?'), int(i)))})"
                                              for fn, k, i in calls),
                            "code": w.get("code", "")})

    def dump(name, rows):
        if not rows:
            return
        with open(outdir / name, "w", newline="", encoding="utf-8") as f:
            wr = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            wr.writeheader()
            wr.writerows(rows)

    dump("ops-layout-readouts.csv", bindings)
    dump("ops-layout-writes.csv", writes)
    dump("ops-layout-buttons.csv", buttons)
    dump("ops-layout-alerts.csv", alerts)
    dump("ops-layout-visibility.csv", conds)
    with open(outdir / "ops-layout-scripts.md", "w", encoding="utf-8") as f:
        f.write("# Label Script widgets in the Operational layout\n\n"
                "Generated by `veronte/tools/extract_ops_layout.py`. `getVar(kind, id)` uses the Ops "
                "kind code (0 = Real, 2 = Uint, 3 = Bit).\n\n")
        for s in scripts:
            f.write(f"## {s['group'] or '(top level)'} – {s['widget_id']}\n\nReads: {s['vars']}\n\n"
                    f"```js\n{s['code']}\n```\n\n")
    used_any = {b["var"] for b in bindings + writes + alerts if b["source"] == "AP"} |                {v.strip() for c in conds if c["source"] == "AP" for v in c["vars"].split(",") if v.strip()} |                {v for sc in scripts for v in re.findall(r"([RUB]\d+) \(", sc["vars"])}
    # System variables have no PDI name; fall back to the description Ops shows in the layout.
    layout_desc = {}
    for b in bindings + writes + alerts:
        if b["source"] == "AP":
            layout_desc.setdefault(b["var"], b.get("pdi_description") or b.get("description") or "")
    vec_rows = []
    for v in vectors:
        for i, fl in enumerate(v["fields"]):
            vec_rows.append({"vector": v["vector"], "enable_bit": v["enable"], "period_s": v["period_s"],
                             "dst": v["dst"], "index": i, "var": f"{fl['kind']}{fl['id']}",
                             "field": fl["field"], "bit_offset": fl["bit_offset"], "bits": fl["bits"],
                             "pdi_name": names.get((fl["kind"], fl["id"]), ""),
                             "ops_description": layout_desc.get(f"{fl['kind']}{fl['id']}", ""),
                             "used_in_ops_layout": "yes" if f"{fl['kind']}{fl['id']}" in used_any else ""})
    dump("telemetry-vectors.csv", vec_rows)
    buttons_pdi = [{"event_id": k, "name": ev_names.get(k, ""),
                    "in_ops_layout": "yes" if any(b["event_id"] == k and b["source"] == "AP" for b in buttons) else "",
                    "automations": automation_effects(k, automations, events, actions)}
                   for k, e in sorted(events.items()) if e["type"] == 9]
    dump("pdi-button-events.csv", buttons_pdi)

    # Stats for the README
    used = {(b["var"]) for b in bindings + writes if b["source"] == "AP"}
    missing = sorted({b["var"] for b in bindings + writes + alerts if b["telemetry"] == "NOT IN TELEMETRY"}
                     | {v.split(":")[0] for c in conds for v in c["telemetry"].split("; ") if "NOT IN TELEMETRY" in v})
    cond = sorted({b["var"] for b in bindings + writes + alerts if b["telemetry"].startswith("conditional")}
                  | {v.split(":")[0] for c in conds for v in c["telemetry"].split("; ") if "conditional" in v})
    stats = {"widgets": len(widgets), "readouts": len(bindings), "writes": len(writes),
             "buttons": len(buttons), "alerts": len(alerts), "scripts": len(scripts),
             "visibility_conditions": len(conds),
             "distinct_ap_vars": len(used), "not_in_telemetry": missing, "conditional_only": cond,
             "vectors": [{k: v[k] for k in ("vector", "enable", "period_s", "dst", "packed_bits")} |
                         {"fields": len(v["fields"])} for v in vectors]}
    json.dump(stats, open(outdir / "summary.json", "w", encoding="utf-8"), indent=2)
    print(json.dumps({k: (len(v) if isinstance(v, list) else v) for k, v in stats.items()}, indent=1))


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main(*sys.argv[1:])
