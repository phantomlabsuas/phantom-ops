import { useMemo, useState } from "react";
import { chooseBasemap, recheckBasemaps, shownBasemap, unreachable, useStore, type Basemap } from "../state/store.ts";
import { isFresh } from "../state/signals.ts";
import { verdictOf } from "../map/basemaps.ts";
import { Icon } from "./icons.tsx";
import { RoutePlanner } from "./RoutePlanner.tsx";

const BASEMAPS: { id: Basemap; label: string }[] = [
  { id: "satellite", label: "Satellite" }, { id: "dark", label: "Dark map" }, { id: "offline", label: "Offline (local file)" },
];

const TITLES: Record<string, string> = {
  plan: "PLAN · ROUTE", payload: "PAYLOAD", check: "CHECKLISTS", sys: "SYSTEMS · LIVE VARIABLES", log: "EVENT LOG",
  hand: "SHIFT HANDOVER", settings: "DISPLAY SETTINGS",
};

function VariableInspector() {
  const vars = useStore((s) => s.vars);
  const names = useStore((s) => s.names);
  const now = useStore((s) => s.now);
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return Object.keys(vars)
      .filter((k) => !qq || k.toLowerCase().includes(qq) || (names[k] ?? "").toLowerCase().includes(qq))
      .sort((a, b) => a[0].localeCompare(b[0]) || Number(a.slice(1)) - Number(b.slice(1)));
  }, [vars, names, q]);
  const show = (v: unknown) => (v === null ? "NaN" : Array.isArray(v) ? v.join(", ") : typeof v === "number" ? (Number.isInteger(v) ? String(v) : Math.abs(v) < 10 ? v.toPrecision(7) : v.toFixed(3)) : String(v));
  return (
    <>
      <input className="search" placeholder="Filter by ID or name (e.g. R3502, fuel, ESC)" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="muted small">{rows.length} of {Object.keys(vars).length} variables · decoded from telemetry vectors V0–V2</div>
      <div className="var-list">
        {rows.map((k) => {
          const s = vars[k];
          return (
            <div key={k} className={`var-row${isFresh(s, now) ? "" : " stale"}`}>
              <span className="mono var-id">{k}</span>
              <span className="var-name" title={names[k]}>{names[k] ?? ""}</span>
              <span className="mono var-val">{show(s.v)}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function EventLog() {
  const log = useStore((s) => s.log);
  return (
    <div className="var-list">
      {log.length === 0 && <div className="muted">No events yet.</div>}
      {log.map((e, i) => (
        <div key={i} className={`log-row k-${e.kind}${e.level ? ` l${e.level}` : ""}`}>
          <span className="mono muted">{new Date(e.t).toLocaleTimeString("en-GB")}</span>
          <span>{e.text}</span>
        </div>
      ))}
    </div>
  );
}

function Settings() {
  const scale = useStore((s) => s.scale);
  const basemap = useStore((s) => s.basemap);
  const offline = useStore((s) => s.offline);
  const online = useStore((s) => s.online);
  const shown = shownBasemap(basemap, offline, online);
  const checking = offline.state === "loading" || online.satellite.state === "checking" || online.dark.state === "checking";
  const set = useStore((s) => s.set);
  const cur = scale === "auto" ? 1 : scale;
  // 100% is the ceiling: the panel widths are sized for the automatic text size, so larger text would not fit
  const step = (d: number) => set({ scale: Math.round(Math.min(1, Math.max(0.8, cur + d)) * 100) / 100 });
  return (
    <div className="settings">
      <div className="sec-title">UI SCALE</div>
      <div className="muted small">Text and panels follow the window size: 16 px text at 1920×1080, about 21 px at 2560×1440, 32 px at 4K. Reduce here to fit more on a small window.</div>
      <div className="row gap">
        <button type="button" className="btn sq" onClick={() => step(-0.05)} disabled={cur <= 0.8} aria-label="Smaller">−</button>
        <div className="mono big-val">{Math.round(cur * 100)}%</div>
        <button type="button" className="btn sq" onClick={() => step(0.05)} disabled={cur >= 1} aria-label="Larger">+</button>
        <button type="button" className={`btn${scale === "auto" ? " on" : ""}`} onClick={() => set({ scale: "auto" })}>Auto</button>
      </div>
      <div className="sec-title">BASEMAP</div>
      <div className="row gap wrap">
        {BASEMAPS.map((b) => (
          <button key={b.id} type="button" className={`btn${shown === b.id ? " on" : ""}${b.id !== "offline" && verdictOf(online[b.id])?.state === "failed" ? " failed" : ""}`}
            disabled={b.id === "offline" && offline.state !== "ready"} onClick={() => chooseBasemap(b.id)}>{b.label}</button>
        ))}
      </div>
      <div className="row gap top">
        <div className="col grow gap-s small">
          {(["satellite", "dark"] as const).map((b) => {
            const h = online[b], v = verdictOf(h);
            return (
              <div key={b} className={`bm-status${v?.state === "failed" ? " failed" : v?.state === "ok" && v.provider.degraded ? " degraded" : ""}`}>
                <span className="muted">{b === "satellite" ? "Satellite" : "Dark map"}:</span>{" "}
                {v?.state === "ok" ? <>{v.provider.name} · <span className="mono">{v.provider.host}</span>{v.provider.degraded ? " · fallback" : ""}</>
                  : v?.state === "failed" ? <>{unreachable(h) ? "unreachable" : "unavailable"} · {v.detail}</>
                  : h.state === "idle" ? "not checked (OFFLINE in use; choose it or press Recheck)" : "checking…"}
                {h.state === "checking" && v ? " · checking again…" : ""}
                {v?.state === "ok" && v.skipped.length > 0 && <div className="muted">Passed over: {v.skipped.join(" · ")}</div>}
              </div>
            );
          })}
          <div className={`bm-status${offline.state === "none" ? " failed" : ""}`}>
            <span className="muted">Offline:</span>{" "}
            {offline.state === "ready"
              ? <><span className="mono">{offline.file}</span> · {offline.kind} · zoom {offline.minZoom}–{offline.maxZoom}{offline.kind === "vector" && !offline.sprite ? " · no POI icons (sprites/ not in the folder)" : ""}</>
              : offline.state === "loading" ? "looking for the file…"
              : <>unavailable · {offline.hint} See README “Offline maps”.</>}
          </div>
          {shown !== basemap && <div className="bm-status">Showing {BASEMAPS.find((b) => b.id === shown)?.label} while {BASEMAPS.find((b) => b.id === basemap)?.label} is unavailable.</div>}
        </div>
        <button type="button" className="btn small-btn" onClick={() => recheckBasemaps()} disabled={checking} title="Probe the online providers again and look for the offline file">Recheck</button>
      </div>
      <div className="sec-title">WINDOW</div>
      <div className="mono small">{window.innerWidth} × {window.innerHeight} px · root {getComputedStyle(document.documentElement).fontSize}</div>
    </div>
  );
}

export function Drawer() {
  const menu = useStore((s) => s.menu);
  const set = useStore((s) => s.set);
  if (menu === "fly") return null;
  return (
    <section className="drawer" aria-label={TITLES[menu]}>
      <div className="drawer-head">
        <h2>{TITLES[menu]}</h2>
        <button type="button" className="btn icon" onClick={() => set({ menu: "fly" })} aria-label="Close panel"><Icon.close /></button>
      </div>
      {menu === "plan" && <RoutePlanner />}
      {menu === "sys" && <VariableInspector />}
      {menu === "log" && <EventLog />}
      {menu === "settings" && <Settings />}
      {!["plan", "sys", "log", "settings"].includes(menu) && (
        <div className="placeholder">
          <div className="ph-title">{TITLES[menu]} workspace</div>
          <div className="muted">Not part of v0. v0 covers the Fly view on live autopilot data; Systems and Event log are live.</div>
        </div>
      )}
    </section>
  );
}
