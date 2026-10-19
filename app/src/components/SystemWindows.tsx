// Engine and fuel windows that open above the health strip. Live values only; items the PDI does not
// report (EGT, CHT 2, MAP, engine hours) are listed as not available rather than invented.
import { useEffect, useState } from "react";
import { useStore, sendCommand } from "../state/store.ts";
import { GROUND_PHASES } from "../../shared/protocol.ts";
import { useNum, fmt, hm, ENGINE_STATE, FUEL_CAPACITY_L } from "../state/signals.ts";
import { Icon } from "./icons.tsx";
import { Spark } from "./HealthStrip.tsx";

// Ops colour bands (Operational layout, HUD widgets). Units as displayed by Ops; to be confirmed with the engine docs.
const RPM_MAX = 10000;
const RPM_BANDS = [{ from: 8500, to: 9000, c: "var(--amber)" }, { from: 9000, to: RPM_MAX, c: "var(--red)" }];
const CHT = { min: 0, max: 250, amber: 170, red: 190 };

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const [x0, y0] = polar(cx, cy, r, a0), [x1, y1] = polar(cx, cy, r, a1);
  return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

function RpmGauge({ rpm }: { rpm: number | null }) {
  const A0 = -120, A1 = 120, ang = (v: number) => A0 + (Math.min(Math.max(v, 0), RPM_MAX) / RPM_MAX) * (A1 - A0);
  return (
    <svg viewBox="0 0 170 150" className="gauge" role="img" aria-label={`Engine RPM ${fmt(rpm)}`}>
      <path d={arc(85, 85, 66, A0, A1)} className="g-track" />
      {RPM_BANDS.map((b) => <path key={b.from} d={arc(85, 85, 66, ang(b.from), ang(b.to))} stroke={b.c} className="g-band" />)}
      {Array.from({ length: 11 }, (_, i) => {
        const [x0, y0] = polar(85, 85, 58, ang(i * 1000)), [x1, y1] = polar(85, 85, 52, ang(i * 1000));
        const [tx, ty] = polar(85, 85, 42, ang(i * 1000));
        return <g key={i}><line x1={x0} y1={y0} x2={x1} y2={y1} className="g-tick" />{i % 2 === 0 && <text x={tx} y={ty + 3.5} className="g-num">{i}</text>}</g>;
      })}
      {rpm !== null && <line x1="85" y1="85" x2="85" y2="29" transform={`rotate(${ang(rpm)} 85 85)`} className="g-needle" />}
      <circle cx="85" cy="85" r="5" className="g-hub" />
      <text x="85" y="126" className="g-val">{fmt(rpm)}</text>
      <text x="85" y="144" className="g-unit">rpm · ×1000 scale</text>
    </svg>
  );
}

function VBar({ label, v, min, max, amber, red, unit }: { label: string; v: number | null; min: number; max: number; amber?: number; red?: number; unit: string }) {
  const H = 120, y = (x: number) => 12 + H - ((Math.min(Math.max(x, min), max) - min) / (max - min)) * H;
  const tone = v !== null && red !== undefined && v >= red ? "var(--red)" : v !== null && amber !== undefined && v >= amber ? "var(--amber)" : "var(--muted)";
  return (
    <svg viewBox="0 0 60 170" className="vbar" role="img" aria-label={`${label} ${fmt(v, 0, unit)}`}>
      <rect x="18" y="12" width="24" height={H} rx="3" className="vb-track" />
      {v !== null && <rect x="19" y={y(v)} width="22" height={12 + H - y(v)} fill={tone} />}
      {amber !== undefined && <path d={`M 14 ${y(amber)} H 46`} stroke="var(--amber)" strokeWidth="1.5" />}
      {red !== undefined && <path d={`M 14 ${y(red)} H 46`} stroke="var(--red)" strokeWidth="1.5" />}
      <text x="30" y="148" className="vb-label">{label}</text>
      <text x="30" y="164" className="vb-val">{fmt(v, 0)}</text>
    </svg>
  );
}

function HBar({ label, v, max, unit, d = 0 }: { label: string; v: number | null; max: number; unit: string; d?: number }) {
  const pct = v === null ? 0 : Math.min(100, Math.max(0, (v / max) * 100));
  return (
    <div className="hbar">
      <div className="row between small"><span className="muted">{label}</span><span className="mono">{fmt(v, d, unit)}</span></div>
      <div className="hb-track"><div className="hb-fill" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function Tile({ k, v, title }: { k: string; v: string; title?: string }) {
  return <div className="tile" title={title}><div className="muted tiny">{k}</div><div className="mono">{v}</div></div>;
}

export function EngineWindow() {
  const open = useStore((s) => s.panel === "eng");
  const set = useStore((s) => s.set);
  const history = useStore((s) => s.history);
  const state = useNum("U1005"), rpm = useNum("R3499"), cht = useNum("R3502"), mat = useNum("R3503");
  const thrCmd = useNum("R3500"), thrOut = useNum("R3514"), tps = useNum("R3501");
  const ecuV = useNum("R3516"), ecuA = useNum("R3518"), pump = useNum("R3513"), ecuT = useNum("R3506"), tlm = useNum("B1060");
  if (!open) return null;
  const tone = cht !== null && cht >= CHT.red ? "red" : cht !== null && cht >= CHT.amber ? "amber" : "";
  return (
    <section className="syswin eng" aria-label="Engine window">
      <div className="sw-head">
        <h2>ENGINE · ECU</h2>
        <span className={`state-chip ${state === 2 ? "on" : ""}`}>{state === null ? "NO DATA" : ENGINE_STATE[state] ?? state}</span>
        {tlm === 0 && <span className="state-chip amber">NO ECU TELEMETRY</span>}
        <span className="grow" />
        <span className="muted small">live · V1 6 Hz</span>
        <button type="button" className="btn icon" onClick={() => set({ panel: null })} aria-label="Close engine window"><Icon.close /></button>
      </div>
      <div className="row gap top">
        <RpmGauge rpm={rpm} />
        <VBar label="CHT" v={cht} min={CHT.min} max={CHT.max} amber={CHT.amber} red={CHT.red} unit="°C" />
        <VBar label="MAT" v={mat} min={-20} max={80} unit="°C" />
        <div className="col grow gap-s">
          <div className="sec-title">THROTTLE</div>
          <HBar label="Commanded (R3500)" v={thrCmd} max={100} unit="%" />
          <HBar label="Output (R3514)" v={thrOut} max={100} unit="%" />
          <HBar label="TPS (R3501)" v={tps} max={100} unit="%" />
          <div className="muted tiny" title="Amber / red lines are the Ops HUD bands. To be confirmed against the engine limits.">CHT lines 170 / 190 °C: Ops bands, to be confirmed</div>
        </div>
      </div>
      <div className="col gap-s">
        <div className="row between sec-title"><span>CHT · SESSION TREND</span><span className={tone}>{fmt(cht, 0, "°C")}</span></div>
        <Spark data={history.R3502} window={1800} w={488} h={56} min={0} max={CHT.max} stretch />
      </div>
      <div className="tiles2">
        <Tile k="ECU supply" v={`${fmt(ecuV, 1, "V")} · ${fmt(ecuA, 1, "A")}`} />
        <Tile k="Fuel pump" v={fmt(pump, 0, "%")} />
        <Tile k="ECU temp" v={fmt(ecuT, 0, "°C")} />
        <Tile k="EGT · CHT 2 · MAP" v="not in telemetry" />
      </div>
    </section>
  );
}

export function FuelWindow() {
  const open = useStore((s) => s.panel === "fuel");
  const set = useStore((s) => s.set);
  const history = useStore((s) => s.history);
  const sensor = useNum("R3400"), mass = useNum("R3185"), remaining = useNum("R3215"), flow = useNum("R3208");
  const level = remaining ?? sensor;   // calculated remaining (entered quantity minus burn), sensor as fallback
  const mismatch = remaining !== null && sensor !== null && Math.abs(remaining - sensor) > 0.5;
  const temp = useNum("R3401"), press = useNum("R3531"), crit = useNum("B1308"), low = useNum("B1307");
  if (!open) return null;
  const pct = level === null ? null : Math.min(1, Math.max(0, level / FUEL_CAPACITY_L));
  const forEndurance = remaining !== null && sensor !== null ? Math.min(remaining, sensor) : level;
  const endurance = forEndurance !== null && flow !== null && flow > 0.05 ? forEndurance / flow : null;
  const tankH = 176 * (pct ?? 0);
  return (
    <section className="syswin fuel" aria-label="Fuel window">
      <div className="sw-head">
        <h2>FUEL</h2>
        {crit === 1 ? <span className="state-chip red">LEVEL CRITICAL</span> : low === 1 ? <span className="state-chip amber">LEVEL LOW</span> : <span className="state-chip">{remaining !== null ? "CALCULATED · R3215" : "LEVEL SENSOR · R3400"}</span>}
        <span className="grow" />
        <button type="button" className="btn icon" onClick={() => set({ panel: null })} aria-label="Close fuel window"><Icon.close /></button>
      </div>
      <div className="row gap top">
        <svg viewBox="0 0 136 200" className="tank" role="img" aria-label={`Fuel tank ${fmt(level, 2, "L")}`}>
          <rect x="8" y="8" width="60" height="184" rx="10" className="tk-shell" />
          {pct !== null && <rect x="12" y={188 - tankH} width="52" height={tankH} rx="4" className="tk-fill" />}
          <text x="76" y="16" className="tk-cap">{FUEL_CAPACITY_L} L</text>
          <text x="76" y={Math.max(30, 188 - tankH + 4)} className="tk-val">{fmt(level, 2, "L")}</text>
        </svg>
        <div className="col grow gap-s">
          <div className="row gap base"><span className="mono huge">{fmt(level, 2, "L")}</span><span className="muted">{pct === null ? "—" : Math.round(pct * 100)}% of {FUEL_CAPACITY_L} L</span></div>
          <div className="row between small"><span className="sec-title">BURN</span><span className="mono">{fmt(flow, 2, "L/h")}</span></div>
          <Spark data={history.R3208} window={7200} w={230} h={28} min={0} stretch />
          <div className="tiles2">
            <Tile k="Level sensor" v={fmt(sensor, 2, "L")} title="R3400" />
            <Tile k="Mass" v={fmt(mass, 2)} title="R3185" />
            <Tile k="Fuel temp" v={fmt(temp, 0, "°C")} title="R3401" />
            <Tile k="Fuel pressure" v={fmt(press, 2)} title="R3531" />
          </div>
        </div>
      </div>
      {mismatch && (
        <div className="fuel-mismatch small">
          Calculated {fmt(remaining, 1, "L")} and sensor {fmt(sensor, 1, "L")} disagree. The autopilot's fuel alerts follow the
          sensor; endurance uses the lower value. Check the entered quantity and the sensor.
        </div>
      )}
      <FuelEntry />
      <div className="col gap-s">
        <div className="sec-title">ENDURANCE AT CURRENT BURN</div>
        <div className="mono">{endurance === null ? "— (no fuel flow)" : `${hm(endurance)} h:mm to dry`}</div>
        <div className="muted tiny" title="Bingo needs distance and fuel to home, which are not in telemetry yet. Capacity 7.5 L from the Ops fuel-quantity slider.">Bingo: distance to home not in telemetry yet</div>
      </div>
    </section>
  );
}

/** Fuel quantity entered by the operator, as in the Ops Engine panel (FUEL QUANTITY slider, R3183, 0–7.5 L,
 *  step 0.1). Staged with − / + or the slider, then sent with Send. The bridge allows it on the ground only. */
function FuelEntry() {
  const entered = useNum("R3183");
  const phase = useStore((s) => s.status?.phase ?? null);
  const allowed = useStore((s) => s.connected && !!s.status?.commandsAllowed);
  const [v, setV] = useState<number | null>(null);
  useEffect(() => { if (v !== null && entered !== null && Math.abs(v - entered) < 0.05) setV(null); }, [v, entered]);
  const onGround = phase !== null && GROUND_PHASES.has(phase);
  const cur = v ?? entered ?? 0;
  const setStaged = (x: number) => setV(Math.round(Math.min(FUEL_CAPACITY_L, Math.max(0, x)) * 10) / 10);
  const can = allowed && onGround;
  return (
    <div className="fuel-entry">
      <div className="row between">
        <div className="sec-title">FUEL QUANTITY INPUT</div>
        <div className="mono muted small">entered {fmt(entered, 1, "L")} (R3183)</div>
      </div>
      <div className="row gap">
        <button type="button" className="btn sq" disabled={!can} onClick={() => setStaged(cur - 0.1)} aria-label="Decrease fuel by 0.1 L">−</button>
        <input type="range" min={0} max={FUEL_CAPACITY_L} step={0.1} value={cur} disabled={!can} className="fuel-slider"
          onChange={(e) => setStaged(Number(e.target.value))} aria-label="Fuel quantity in litres" />
        <button type="button" className="btn sq" disabled={!can} onClick={() => setStaged(cur + 0.1)} aria-label="Increase fuel by 0.1 L">+</button>
        <div className={`mono step-val${v !== null ? " pending" : ""}`}>{cur.toFixed(1)} L</div>
      </div>
      <div className="row gap">
        <button type="button" className={`btn send${v !== null ? " ready" : ""}`} disabled={!can || v === null} onClick={() => { if (sendCommand("fuelSet", { value: v! })) setV(null); }}>Send</button>
        <button type="button" className="btn" disabled={v === null} onClick={() => setV(null)}>Cancel</button>
      </div>
      {!onGround && <div className="muted tiny">Fuel quantity can be entered on the ground only.</div>}
    </div>
  );
}
