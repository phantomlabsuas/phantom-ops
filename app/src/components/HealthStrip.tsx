// Seven-segment health strip. Greyscale while normal; a segment takes the colour of its highest non-inhibited
// active alert (solid while unacknowledged, outline once acknowledged). An alert always wins over "NO DATA".
// Values from a device that reports "no comm" are dashed rather than shown as if live.
import { useStore } from "../state/store.ts";
import { useNum, fmt, hm, hms, ENGINE_STATE, PMU_MODE, GNSS_FIX, FUEL_CAPACITY_L } from "../state/signals.ts";
import { PHASES } from "../../shared/protocol.ts";
import type { Segment } from "../../shared/protocol.ts";
import { Icon, LevelIcon } from "./icons.tsx";

/** Sparkline over the last `window` samples (1 Hz history), min/max-downsampled to ~200 points. */
export function Spark({ data, w = 64, h = 24, min, max, window = 300, stretch }: {
  data: (number | null)[] | undefined; w?: number; h?: number; min?: number; max?: number; window?: number;
  /** fill the CSS box instead of keeping the viewBox aspect (wide trend charts; the stroke does not scale) */
  stretch?: boolean;
}) {
  const par = stretch ? "none" : undefined;
  const raw = (data ?? []).slice(-window);
  const buckets = Math.min(200, raw.length);
  const pts: (number | null)[] = [];
  if (raw.length > buckets && buckets > 0) {
    const size = raw.length / buckets;
    for (let b = 0; b < buckets; b++) {
      const seg = raw.slice(Math.floor(b * size), Math.floor((b + 1) * size)).filter((v): v is number => v !== null);
      pts.push(seg.length ? (b % 2 ? Math.max(...seg) : Math.min(...seg)) : null);
    }
  } else pts.push(...raw);
  const nums = pts.filter((v): v is number => v !== null);
  if (nums.length < 2) return <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio={par} className="spark" aria-hidden="true" />;
  const lo = min ?? Math.min(...nums), hi = max ?? Math.max(...nums);
  const span = hi - lo || 1;
  let d = "", pen = false;
  pts.forEach((v, i) => {
    if (v === null) { pen = false; return; }          // gap: start a new sub-path after missing data
    const x = (i / Math.max(1, pts.length - 1)) * w, y = h - 2 - ((Math.min(Math.max(v, lo), hi) - lo) / span) * (h - 4);
    d += `${pen ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)} `;
    pen = true;
  });
  return <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio={par} className="spark" aria-hidden="true"><path d={d} /></svg>;
}

function useSegmentAlert(seg: Segment) {
  const active = useStore((s) => s.alerts.active);
  const mine = active.filter((a) => a.segment === seg && !a.inhibited);
  const level = mine.reduce((m, a) => Math.max(m, a.level), 0);
  const unacked = mine.some((a) => a.level === level && !a.acked);
  return { level, count: mine.filter((a) => a.level >= 2).length, advisories: mine.filter((a) => a.level === 1).length, unacked };
}

function Seg({ seg, top, main, spark, onClick, open, stale, title }: {
  seg: Segment; top: string; main: string; spark?: React.ReactNode; onClick?: () => void; open?: boolean; stale?: boolean; title?: string;
}) {
  const { level, count, advisories, unacked } = useSegmentAlert(seg);
  const tone = level >= 3 ? "red" : level === 2 ? "amber" : stale ? "stale" : "normal";
  const sub = stale ? "NO DATA" : top;
  const value = stale ? "—" : main;
  const Tag = onClick ? "button" : "div";
  const summary = level >= 2 ? `${count} alert${count > 1 ? "s" : ""}${unacked ? "" : ", acknowledged"}` : "normal";
  return (
    <Tag type={onClick ? "button" : undefined} className={`seg ${tone}${level >= 2 && !unacked ? " acked" : ""}${open ? " open" : ""}`} onClick={onClick} title={title}
      aria-label={onClick ? `${seg}: ${sub}, ${value}. ${summary}. ${open ? "Close" : "Open"} ${seg.toLowerCase()} window` : undefined}
      role={onClick ? undefined : "group"} aria-roledescription={onClick ? undefined : "health segment"}>
      <span className="seg-body">
        <span className="seg-top">
          {level >= 2 && <LevelIcon level={level} hollow={!unacked} />}
          <span className="seg-name">{seg}</span>
          {advisories > 0 && level < 2 && <span className="adv-badge" title={`${advisories} advisory`}>{advisories}</span>}
          {level >= 2 && count > 1 && <span className="count-badge">{count}</span>}
          <span className="seg-sub">{sub}</span>
        </span>
        <span className="seg-main">{value}</span>
      </span>
      {spark}
      {onClick && (open ? <Icon.chevDown /> : <Icon.chevUp />)}
    </Tag>
  );
}

export function HealthStrip() {
  const panel = useStore((s) => s.panel);
  const set = useStore((s) => s.set);
  const history = useStore((s) => s.history);
  const st = useStore((s) => s.status);
  const connected = useStore((s) => s.connected);
  const toggle = (p: "eng" | "fuel") => set({ panel: panel === p ? null : p });

  const engState = useNum("U1005"), rpm = useNum("R3499"), cht = useNum("R3502"), ecuComm = useNum("B1060");
  const fuelCalc = useNum("R3215"), fuelSensor = useNum("R3400"), flow = useNum("R3208");
  const fuel = fuelCalc ?? fuelSensor;   // R3215 = entered quantity minus consumption (PDI); sensor as fallback
  const fuelMismatch = fuelCalc !== null && fuelSensor !== null && Math.abs(fuelCalc - fuelSensor) > 0.5;
  const fuelForEndurance = fuelCalc !== null && fuelSensor !== null ? Math.min(fuelCalc, fuelSensor) : fuel;
  const battV = useNum("R3604"), battA = useNum("R3201"), pmu = useNum("R3610"), pmuComm = useNum("B1070");
  const escA = [useNum("R3252"), useNum("R3255"), useNum("R3258")];
  const motT = [useNum("R3300"), useNum("R3301"), useNum("R3302")];
  const escComm = [useNum("B1077"), useNum("B1078"), useNum("B1079")];
  const fix1 = useNum("U117"), fix2 = useNum("U167"), sat1 = useNum("U100"), sat2 = useNum("U150"), acc1 = useNum("R3209");
  const pri = useNum("B1310"), sec = useNum("B1311");
  const cpu = useNum("R2094");

  const maxOf = (a: (number | null)[]) => { const n = a.filter((x): x is number => x !== null); return n.length ? Math.max(...n) : null; };
  const endurance = fuelForEndurance !== null && flow !== null && flow > 0.05 ? fuelForEndurance / flow : null;
  const live = connected && !!st?.apAlive;
  const linkTxt = (b: number | null) => (b === null ? "—" : b ? "UP" : "DOWN");
  const fixName = (f: number | null) => (f === null ? "—" : GNSS_FIX[f] ?? String(f));
  const hasFix = (fix1 !== null && fix1 >= 2 && fix1 <= 4) || (fix2 !== null && fix2 >= 2 && fix2 <= 4);
  const ecuDown = ecuComm === 0, pmuDown = pmuComm === 0, escDown = escComm.every((c) => c === 0);

  return (
    <footer className="health" aria-label="Aircraft health">
      <Seg seg="ENG" onClick={() => toggle("eng")} open={panel === "eng"} stale={!live || engState === null}
        title="Engine state · rpm (ECU)"
        top={ecuDown ? "ECU NO COMM" : `${engState === null ? "—" : ENGINE_STATE[engState] ?? engState} · ${fmt(rpm, 0)}`}
        main={ecuDown ? "values frozen" : `CHT ${fmt(cht, 0, "°C")}`} spark={<Spark data={history.R3502} />} />
      <Seg seg="FUEL" onClick={() => toggle("fuel")} open={panel === "fuel"} stale={!live || fuel === null}
        title={`Fuel ${fuelCalc !== null ? "calculated (R3215)" : "level sensor (R3400)"} · END = endurance h:mm at current burn`}
        top={fuelMismatch ? `≠ sensor ${fmt(fuelSensor, 1, "L")}` : `END ${hm(endurance)} · ${fuelCalc !== null ? "calc" : "sensor"}`}
        main={`${fmt(fuel, 2, "L")} · ${fuel === null ? "—" : Math.round((fuel / FUEL_CAPACITY_L) * 100)}%`} spark={<Spark data={fuelCalc !== null ? history.R3215 : history.R3400} min={0} max={FUEL_CAPACITY_L} />} />
      <Seg seg="ELEC" stale={!live || battV === null}
        top={pmuDown ? "PMU NO COMM" : `PMU ${pmu === null ? "—" : PMU_MODE[Math.round(pmu)] ?? pmu}`}
        main={pmuDown ? "values frozen" : `${fmt(battV, 1, "V")} · ${fmt(battA, 1, "A")}`} spark={<Spark data={history.R3604} />} />
      <Seg seg="LIFT" stale={!live || escA[0] === null}
        top={escDown ? "ESC NO COMM" : "3 ESC · L R T"}
        main={escDown ? "values frozen" : `max ${fmt(maxOf(escA), 1, "A")} · ${fmt(maxOf(motT), 0, "°C")}`} />
      <Seg seg="NAV" stale={!live || fix1 === null}
        title="GNSS 1 / GNSS 2 fix · satellites · accuracy"
        top={`${fixName(fix1)} / ${fixName(fix2)}`}
        main={`SAT ${fmt(sat1)}/${fmt(sat2)} · ${hasFix ? `±${fmt(acc1, 1, "m")}` : "no fix"}`} />
      <Seg seg="LINK" stale={!connected || !st?.socketOpen}
        top={live ? `${Math.round(st?.rates.total ?? 0)} msg/s` : "AP NO REPORT"}
        main={`PRI ${linkTxt(pri)} · SEC ${linkTxt(sec)}`} />
      <Seg seg="AP" stale={!live}
        title={`Autopilot phase · uptime ${hms(st?.apUptimeMs ?? null)}`}
        top={`${st?.phase == null ? "—" : PHASES[st.phase] ?? st.phase} · ${st?.apUptimeMs == null ? "—" : hm(st.apUptimeMs / 3.6e6)}`}
        main={`GNC CPU ${cpu === null ? "—" : `${Math.round(cpu * 100)}%`}`} />
    </footer>
  );
}
