import { useState } from "react";
import { useStore, ackAlerts } from "../state/store.ts";
import type { AlertState } from "../../shared/protocol.ts";
import { LevelIcon } from "./icons.tsx";

// The level is coded by icon shape, colour and border (CLAUDE.md alert model); its name is in the accessible label.
const LEVEL_NAME: Record<number, string> = { 4: "TIME-CRITICAL", 3: "WARNING", 2: "CAUTION", 1: "ADVISORY" };
const cls = (l: number) => (l >= 3 ? "red" : l === 2 ? "amber" : "white");

function age(since: number, now: number) {
  const s = Math.max(0, Math.floor((now - since) / 1000));
  return s < 3600 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;
}

const StaleTag = ({ a }: { a: AlertState }) => (a.stale ? <span className="stale-tag" title="Its telemetry stopped updating: held until fresh data clears it">DATA LOST</span> : null);

function Card({ a, now, canAck }: { a: AlertState; now: number; canAck: boolean }) {
  return (
    <div className={`alert-card ${cls(a.level)}${a.stale ? " stale" : ""}`} role="group" aria-label={`${LEVEL_NAME[a.level]}, ${a.segment}: ${a.text}`}>
      <div className="ac-head" title={LEVEL_NAME[a.level]}>
        <LevelIcon level={a.level} />
        <span className="ac-level">{a.segment}</span>
        <StaleTag a={a} />
        <span className="grow" />
        <span className="mono muted">{age(a.since, now)}</span>
      </div>
      <div className="ac-row">
        <div className="ac-text">{a.text}</div>
        <button type="button" className="btn ack" disabled={!canAck} onClick={() => ackAlerts([a.id])}
          aria-label={`Acknowledge ${a.text} (does not clear it)`} title="Acknowledge (does not clear the alert)">ACK</button>
      </div>
    </div>
  );
}

function Row({ a, now, hollow }: { a: AlertState; now: number; hollow?: boolean }) {
  return (
    <div className={`alert-row ${cls(a.level)}${a.inhibited ? " inhibited" : ""}`} title={LEVEL_NAME[a.level]} aria-label={`${LEVEL_NAME[a.level]}, ${a.segment}: ${a.text}`}>
      <LevelIcon level={a.level} hollow={hollow} />
      <span className="ar-main">
        <span className="ar-text">{a.text}{a.inhibited && a.inhibitReason ? ` · inhibited: ${a.inhibitReason}` : ""}</span>
        <span className="ar-level">{a.segment}<StaleTag a={a} /></span>
      </span>
      <span className="mono muted">{age(a.since, now)}</span>
    </div>
  );
}

export function AlertsPanel() {
  const { active, noData, historyCount } = useStore((s) => s.alerts);
  const now = useStore((s) => s.now);
  const connected = useStore((s) => s.connected);
  const [showInhibited, setShowInhibited] = useState(false);

  const live = active.filter((a) => !a.inhibited);
  const fresh = live.filter((a) => !a.acked);
  const acked = live.filter((a) => a.acked);
  const inhibited = active.filter((a) => a.inhibited);
  const counts = ([4, 3, 2, 1] as const).map((l) => [l, live.filter((a) => a.level === l).length] as const).filter(([, c]) => c > 0);
  const summary = counts.map(([l, c]) => `${c} ${LEVEL_NAME[l].toLowerCase()}`).join(", ") || "none active";

  return (
    <section className="panel alerts" aria-label="Alerts">
      <div className="panel-head">
        <h2>ALERTS</h2>
        {connected ? (
          <span className="lvl-counts" title={summary} aria-label={summary}>
            {counts.length === 0 && <span className="muted">none</span>}
            {counts.map(([l, c]) => <span key={l} className={`lvl-count ${cls(l)}`}><LevelIcon level={l} />{c}</span>)}
          </span>
        ) : <span className="muted small">OFFLINE · frozen</span>}
        {connected && fresh.length > 1 && (
          <button type="button" className="btn small-btn" onClick={() => ackAlerts(fresh.map((a) => a.id))}>ACK ALL ({fresh.length})</button>
        )}
      </div>
      <div className="alerts-scroll">
        {fresh.slice(0, 3).map((a) => <Card key={a.id} a={a} now={now} canAck={connected} />)}
        {fresh.slice(3).map((a) => <Row key={a.id} a={a} now={now} />)}
        {acked.length > 0 && <div className="sec-title">ACKNOWLEDGED · STILL ACTIVE</div>}
        {acked.map((a) => <Row key={a.id} a={a} now={now} hollow />)}
        {showInhibited && inhibited.map((a) => <Row key={a.id} a={a} now={now} hollow />)}
      </div>
      <div className="panel-foot small">
        <button type="button" className="linkish" onClick={() => setShowInhibited(!showInhibited)} disabled={!inhibited.length}>
          Inhibited: {inhibited.length ? `${inhibited.length} (${inhibited[0].inhibitReason})` : "none"}
        </button>
        <span className="muted" title="PCS alerts cannot be evaluated: PCS (ground station) telemetry is not decoded in v0. History = activations since the bridge started.">
          PCS n/a {noData} · hist {historyCount}
        </span>
      </div>
    </section>
  );
}
