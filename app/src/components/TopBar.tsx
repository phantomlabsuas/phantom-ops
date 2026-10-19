import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useStore, ackAlerts } from "../state/store.ts";
import { useNum, useBit, fmt, hdg3, hms, hm, controlSource } from "../state/signals.ts";
import { useAudioState } from "./audio.ts";
import { PHASES } from "../../shared/protocol.ts";
import { Icon } from "./icons.tsx";

/** A top-bar field. `unit` is drawn smaller next to the value (saves the width that lets the numerals be large). */
function Field({ label, children, mono = true, wide, unit }: { label: string; children: React.ReactNode; mono?: boolean; wide?: boolean; unit?: string }) {
  return (
    <div className={`tb-field${wide ? " wide" : ""}`}>
      <div className="tb-label">{label}</div>
      <div className={`tb-value${mono ? " mono" : ""}`}>{children}{unit && children !== "—" && <span className="u">{unit}</span>}</div>
    </div>
  );
}

function Clock() {
  const [t, setT] = useState(() => new Date());
  useEffect(() => { const i = setInterval(() => setT(new Date()), 1000); return () => clearInterval(i); }, []);
  return <>{t.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</>;
}

/** VTOL phase strip from the AP's flight-mode bits. APPR / B-TRANS are not reported by this PDI. */
function VtolStrip() {
  const mc = useBit("B1213"), tr = useBit("B1214"), fw = useBit("B1212");
  const phase = useStore((s) => s.status?.phase ?? null);
  const chips: [string, boolean | null][] = [["MC", mc], ["TRANS", tr], ["FW", fw], ["LAND", phase === null ? null : phase === 3]];
  return (
    <div className="vtol">
      {chips.map(([n, on]) => <span key={n} className={`chip${on ? " on" : ""}${on === null ? " nodata" : ""}`}>{n}</span>)}
    </div>
  );
}

function MasterButtons() {
  const active = useStore((s) => s.alerts.active);
  const live = active.filter((a) => !a.inhibited);
  const warn = live.filter((a) => a.level >= 3 && !a.acked);
  const caut = live.filter((a) => a.level === 2 && !a.acked);
  return (
    <div className="masters">
      <button type="button" className={`master warning${warn.length ? " lit" : ""}`} onClick={() => ackAlerts(warn.map((a) => a.id))}
        aria-label={warn.length ? `Master warning, ${warn.length} unacknowledged, press to acknowledge` : "Master warning, not active"}>
        MASTER<br />WARNING
      </button>
      <button type="button" className={`master caution${caut.length ? " lit" : ""}`} onClick={() => ackAlerts(caut.map((a) => a.id))}
        aria-label={caut.length ? `Master caution, ${caut.length} unacknowledged, press to acknowledge` : "Master caution, not active"}>
        MASTER<br />CAUTION
      </button>
    </div>
  );
}

export function TopBar() {
  const st = useStore((s) => s.status);
  const now = useStore((s) => s.now);
  const ias = useNum("R3130"), msl = useNum("R503"), agl = useNum("R504"), hdg = useNum("R3"), gs = useNum("R2");
  const stick = useNum("R3104"), manual = useNum("R3106"), detected = useNum("B1266");
  const audioOn = useAudioState();
  const connected = useStore((s) => s.connected);
  const pri = useBit("B1310"), sec = useBit("B1311");
  const fuelCalc = useNum("R3215"), fuelSensor = useNum("R3400"), flow = useNum("R3208");
  const level = fuelCalc !== null && fuelSensor !== null ? Math.min(fuelCalc, fuelSensor) : fuelCalc ?? fuelSensor;   // conservative
  const endurance = level !== null && flow !== null && flow > 0.05 ? level / flow : null;

  const phase = st?.phase ?? null;
  const mode = phase === null ? "—" : PHASES[phase] ?? `PHASE ${phase}`;
  const control = controlSource(stick, manual, detected);
  const link = (b: boolean | null) => (b === null ? "—" : b ? "✓" : "✗");
  const flag = !connected ? "BRIDGE OFFLINE" : st && !st.apAlive && st.apAddress !== null ? "NO REPORT" : null;

  // Dev check: nothing in the bar is allowed to shrink, so a new long string would push MASTER off-screen.
  // Reported once per overflow amount, not on every render.
  const bar = useRef<HTMLElement>(null);
  const lastOverflow = useRef(0);
  useLayoutEffect(() => {
    if (!import.meta.env.DEV || !bar.current) return;
    const over = bar.current.scrollWidth - bar.current.clientWidth;
    if (over > 1 && over !== lastOverflow.current) console.warn(`top bar overflows by ${over} px at ${window.innerWidth} px wide`);
    lastOverflow.current = over > 1 ? over : 0;
  });

  return (
    <header className="topbar" ref={bar}>
      <div className="brand" title="Phantom OPS v0.1"><Icon.logo /></div>
      <Field label="AIRCRAFT">
        {flag ? <span className="tb-flag" title={st?.apAddress ? `AP ${st.apAddress}` : undefined}>{flag}</span>
          : st?.apAddress ? <span title={`${st.vehicleName ?? ""} · ${st.pdiProfile ?? ""}`}>AP {st.apAddress}</span> : "—"}
      </Field>
      <Field label="MODE" mono={false} wide>{mode}</Field>
      <div className="tb-field"><div className="tb-label">VTOL PHASE</div><VtolStrip /></div>
      <div className="tb-data">
        <Field label="IAS" unit="m/s">{fmt(ias, 1)}</Field>
        <Field label="ALT AMSL" unit="m">{fmt(msl, 0)}</Field>
        <Field label="AGL" unit="m">{fmt(agl, 0)}</Field>
        <Field label="HDG">{hdg3(hdg)}</Field>
        <Field label="GS" unit="m/s">{fmt(gs, 1)}</Field>
      </div>
      <Field label="CONTROL" mono={false}><span className="tb-ctl"><Icon.lock />{control}</span></Field>
      <Field label="C2 LINK"><span title="Primary / secondary link status (B1310 / B1311)">PRI {link(pri)} SEC {link(sec)}</span></Field>
      <Field label="FLIGHT">{st?.flightStart ? `${st.flightStartPartial ? "≥ " : ""}${hms(now - st.flightStart)}` : "ON GROUND"}</Field>
      <Field label="ENDURANCE">{hm(endurance)}</Field>
      {!audioOn && (
        <button type="button" className="audio-off" aria-label="Alarm audio off, click to enable"
          title="Browsers start sound only after a click or key press. Alarms are silent until then.">AUDIO<br />OFF</button>
      )}
      <MasterButtons />
      <Field label="LOCAL"><Clock /></Field>
    </header>
  );
}
