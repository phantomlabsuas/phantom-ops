// Plan workspace: waypoints added on the map (click while "+ WAYPOINT" is on, drag to move), their altitudes,
// legs and totals. v0 plans and draws the route in Phantom OPS only: there is no documented Veronte Link message
// for uploading a flight plan, so nothing is sent to the autopilot.
import { useEffect, useState } from "react";
import { removeWaypoint, updateWaypoint, useStore, type Waypoint } from "../state/store.ts";
import { useNum, RAD, hm } from "../state/signals.ts";
import { bearingDeg, distanceM, fmtBrg, fmtDist } from "../map/geo.ts";
import { Icon } from "./icons.tsx";

/** Altitude field: edited as text, committed on blur or Enter only when it is a valid number (an empty field never
 *  becomes 0 m); Escape or an invalid entry reverts to the stored altitude. */
function AltInput({ w, n }: { w: Waypoint; n: number }) {
  const [text, setText] = useState(String(w.alt));
  useEffect(() => setText(String(w.alt)), [w.alt]);
  const commit = () => {
    const v = Number(text);
    if (text.trim() !== "" && Number.isFinite(v)) updateWaypoint(w.id, { alt: Math.round(Math.max(0, Math.min(15000, v))) });
    else setText(String(w.alt));
  };
  return (
    <label className="wp-alt" onClick={(e) => e.stopPropagation()}>
      <input type="text" inputMode="numeric" value={text} aria-label={`WP ${n} altitude, metres AMSL`}
        onChange={(e) => setText(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setText(String(w.alt)); }} />
      <span className="muted tiny">m</span>
    </label>
  );
}

export function RoutePlanner() {
  const route = useStore((s) => s.route);
  const adding = useStore((s) => s.addingWaypoints);
  const selected = useStore((s) => s.selectedWp);
  const set = useStore((s) => s.set);
  const lat = useNum("R501"), lon = useNum("R500"), gs = useNum("R2"), iasCmd = useNum("R100");

  const legs = route.map((w, i) => {
    const from = i === 0 ? (lat !== null && lon !== null ? { lat: lat * RAD, lon: lon * RAD } : null) : route[i - 1];
    return from ? { d: distanceM(from.lat, from.lon, w.lat, w.lon), b: bearingDeg(from.lat, from.lon, w.lat, w.lon) } : null;
  });
  const routeLen = legs.slice(1).reduce((t, l) => t + (l?.d ?? 0), 0);
  const total = legs.reduce((t, l) => t + (l?.d ?? 0), 0);
  // ETA at the current ground speed when flying, otherwise at the commanded airspeed (no wind)
  const speed = gs !== null && gs > 5 ? gs : iasCmd !== null && iasCmd > 5 ? iasCmd : null;

  return (
    <div className="planner">
      <div className="row gap">
        <button type="button" className={`btn grow${adding ? " on" : ""}`} onClick={() => set({ addingWaypoints: !adding })}>
          {adding ? "Adding · click the map (tap to finish)" : "+ Add waypoints on map"}
        </button>
        <button type="button" className="btn" disabled={!route.length} onClick={() => set({ route: [], selectedWp: null })}>Clear</button>
      </div>
      <div className="muted tiny">Planned in Phantom OPS and drawn on the map. Not uploaded to the autopilot in v0: Veronte Link's flight-plan upload is not documented yet. Drag a waypoint to move it.</div>

      {route.length === 0 && <div className="placeholder"><div className="muted">No waypoints. Turn on "Add waypoints" and click the map; two waypoints make a route.</div></div>}

      <div className="wp-list">
        {route.map((w, i) => (
          <div key={w.id} className={`wp-row${selected === w.id ? " selected" : ""}`} onClick={() => set({ selectedWp: w.id })}>
            <span className="wp-n">{i + 1}</span>
            <span className="wp-main">
              <span className="mono small" title={`${w.lat.toFixed(6)}°, ${w.lon.toFixed(6)}°`}>{w.lat.toFixed(5)}°, {w.lon.toFixed(5)}°</span>
              <span className="muted tiny">{legs[i] ? `${i === 0 ? "from aircraft" : `from WP ${i}`} · ${fmtDist(legs[i]!.d)} · ${fmtBrg(legs[i]!.b)}` : i === 0 ? "no aircraft position" : ""}</span>
            </span>
            <AltInput w={w} n={i + 1} />
            <button type="button" className="btn icon" onClick={(e) => { e.stopPropagation(); removeWaypoint(w.id); }} aria-label={`Remove WP ${i + 1}`}><Icon.close /></button>
          </div>
        ))}
      </div>

      {route.length >= 1 && (
        <div className="tiles2">
          <div className="tile"><div className="muted tiny">Route (WP 1 → {route.length})</div><div className="mono">{route.length >= 2 ? fmtDist(routeLen) : "—"}</div></div>
          <div className="tile"><div className="muted tiny">Aircraft → last WP</div><div className="mono">{legs[0] ? fmtDist(total) : "—"}</div></div>
          <div className="tile"><div className="muted tiny">Speed for ETA</div><div className="mono">{speed === null ? "—" : `${speed.toFixed(0)} m/s ${gs !== null && gs > 5 ? "GS" : "IAS cmd"}`}</div></div>
          <div className="tile"><div className="muted tiny">ETA to last WP</div><div className="mono">{speed && legs[0] ? hm(total / speed / 3600) : "—"}</div></div>
        </div>
      )}
    </div>
  );
}
