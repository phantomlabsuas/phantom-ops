import { useEffect, useRef, useState } from "react";
import { useStore, sendCommand } from "../state/store.ts";
import { useNum, fmt, IAS_MODE } from "../state/signals.ts";
import { CONFIRM_MAX_MS, CONFIRM_MIN_MS, GROUND_PHASES, PHASES } from "../../shared/protocol.ts";
import type { CommandId, CommandPhase, CommandState } from "../../shared/protocol.ts";
import { Icon } from "./icons.tsx";

// The UI window sits inside the bridge's (0.4–4 s) so network and timer jitter cannot push a confirm outside it.
const UI_CONFIRM_MIN_MS = CONFIRM_MIN_MS + 50, UI_CONFIRM_MAX_MS = CONFIRM_MAX_MS - 300;

/** Two-tap confirmation, enforced by the bridge: the first tap sends stage "arm"; the button shows "tap again" only
 *  once the bridge has reported the command armed. A second tap 0.45–3.7 s later confirms. A quicker second tap
 *  (double-click) is ignored and the command stays armed; if the bridge refuses the arm, the button resets. */
function useTwoStep(cmd: CommandState | null) {
  const [armed, setArmed] = useState<{ id: CommandId; at: number; seq: number } | null>(null);
  const t = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(t.current), []);
  const serverSaysArmed = !!armed && cmd?.id === armed.id && cmd.seq > armed.seq && cmd.phase === "armed";
  const serverRefused = !!armed && cmd?.id === armed.id && cmd.seq > armed.seq && cmd.phase === "blocked";
  useEffect(() => { if (serverRefused) { window.clearTimeout(t.current); setArmed(null); } }, [serverRefused]);
  const tap = (id: CommandId) => {
    const now = Date.now();
    if (armed?.id === id && serverSaysArmed) {
      if (now - armed.at < UI_CONFIRM_MIN_MS) return;           // double-click: keep waiting for a deliberate tap
      window.clearTimeout(t.current);
      setArmed(null);
      sendCommand(id, { stage: "confirm" });
      return;
    }
    window.clearTimeout(t.current);
    const seq = cmd?.seq ?? 0;
    if (!sendCommand(id, { stage: "arm" })) return;
    setArmed({ id, at: now, seq });
    t.current = window.setTimeout(() => setArmed(null), UI_CONFIRM_MAX_MS);
  };
  return { armed: serverSaysArmed ? armed!.id : null, tap };
}

/** Holding Enter on a focused button auto-repeats clicks; ignore repeats so one key press can never arm and confirm. */
const noRepeat = (e: React.KeyboardEvent) => { if (e.repeat) e.preventDefault(); };

const CHIPS: [string, CommandPhase[]][] = [
  ["Sent", ["sent", "acknowledged", "executed", "not-executed", "no-reply", "rejected"]],
  ["Acknowledged", ["acknowledged", "executed", "not-executed"]],
  ["Executed", ["executed"]],
];
const BAD: CommandPhase[] = ["rejected", "no-reply", "not-executed", "blocked"];
const TOR_TIMEOUT_S = 30;   // PDI: TAKE-OFF READY falls back to ARMED after 30 s (event 67 duration)

function Check({ ok, label }: { ok: boolean | null; label: string }) {
  return <span className={`pre ${ok === null ? "unk" : ok ? "ok" : "no"}`}>{ok === null ? "?" : ok ? "✓" : "✗"} {label}</span>;
}

export function CommandPanel() {
  const st = useStore((s) => s.status);
  const cmd = useStore((s) => s.command);
  const connected = useStore((s) => s.connected);
  const phase = st?.phase ?? null;
  const allowed = connected && !!st?.commandsAllowed;
  const { armed, tap } = useTwoStep(cmd);
  const onGround = phase === null || GROUND_PHASES.has(phase);

  const iasMode = useNum("U1002"), iasCmd = useNum("R100");
  const mslCmd = useNum("R3173");
  const sim = useNum("B1226"), knobArm = useNum("B1232"), posOk = useNum("B1246"), sync = useNum("B1263");

  // ---- TAKE-OFF READY countdown, from the bridge's phase-change time (survives reloads and reconnects) ----
  const now = useStore((s) => s.now);
  const torLeft = phase === 9 && st?.phaseSince ? Math.max(0, Math.min(TOR_TIMEOUT_S, Math.ceil(TOR_TIMEOUT_S - (now - st.phaseSince) / 1000))) : null;

  // ---- altitude stepper: starts from the actual command, snaps to 50 m on the first step ----
  const [altT, setAltT] = useState<number | null>(null);
  useEffect(() => { if (altT !== null && mslCmd !== null && Math.abs(altT - mslCmd) <= 0.5) setAltT(null); }, [altT, mslCmd]);
  const stepAlt = (dir: 1 | -1) => {
    const base = altT ?? mslCmd;
    if (base === null) return;
    const next = altT === null ? (dir > 0 ? Math.floor(base / 50) * 50 + 50 : Math.ceil(base / 50) * 50 - 50) : base + 50 * dir;
    setAltT(Math.max(0, Math.min(15000, next)));
  };
  const pending = altT !== null;

  const big = (id: CommandId, label: string, I: () => React.ReactElement, activePhase: number, sub: string, activeSub: string) => {
    const active = phase === activePhase;
    return (
      <button type="button" disabled={!allowed} className={`big-cmd${armed === id ? " armed" : active ? " active" : ""}`} onClick={() => tap(id)} onKeyDown={noRepeat}
        aria-label={`${label}. ${armed === id ? "Tap again to confirm" : "Two taps to send"}`}>
        <span className="bc-title"><I />{label}</span>
        <span className="bc-sub">{armed === id ? "Tap again to confirm" : active ? activeSub : sub}</span>
      </button>
    );
  };

  // ---- launch sequence (ground) ----
  type Step = { id: CommandId; n: number; label: string; done: boolean; enabled: boolean; hint: string; full: string; pre?: React.ReactNode };
  const steps: Step[] = [
    { id: "armWing", n: 1, label: "ARM", done: phase !== null && phase !== 0 && phase !== 20, enabled: phase === 0 && sim === 1,
      hint: "SIM switch → ARMED", full: "Wing enable (SIM safety switch) moves the autopilot to ARMED", pre: <Check ok={sim === null ? null : sim === 1} label="SIM" /> },
    { id: "motorsArm", n: 2, label: "MOTORS ARM", done: knobArm === 1, enabled: phase === 13 && knobArm !== 1 && sim === 1,
      hint: "Knob-box arm (SIM)", full: "Knob-box motors arm (SIM)" },
    { id: "takeoffReady", n: 3, label: "TAKE-OFF READY", done: phase === 9 || phase === 1, enabled: phase === 13 && knobArm === 1 && posOk === 1,
      hint: "Motors armed, aircraft still", full: "Needs motors armed, position fixed and the aircraft still",
      pre: <Check ok={posOk === null ? null : posOk === 1} label="position" /> },
    { id: "takeoff", n: 4, label: "TAKE-OFF", done: phase === 1, enabled: phase === 9 && sync === 1,
      // while TAKE-OFF READY, this is the current step, so the PDI's 30 s fall-back countdown shows here
      hint: phase === 9 ? (torLeft !== null ? `Take off within ${torLeft} s` : "Within 30 s, else back to ARMED") : "Vertical, then PDI mission",
      full: "Vertical take-off, then the PDI continues the mission. TAKE-OFF READY falls back to ARMED after 30 s.",
      pre: <Check ok={sync === null ? null : sync === 1} label="sync" /> },
  ];
  const current = steps.find((s) => !s.done)?.id;

  return (
    <section className="panel command" aria-label="Command">
      <div className="panel-head">
        <h2>COMMAND{st?.apAddress ? ` · AP ${st.apAddress}` : ""}</h2>
        <span className="mode-chip">{phase === null ? "—" : PHASES[phase] ?? phase}</span>
      </div>
      {!allowed && (
        <div className="cmd-blocked" title={st?.apAddress && st.pdiProfile ? "Add the address to commands.allowedApAddresses in config/bridge.config.json to enable" : undefined}>
          {!connected ? "Bridge offline: commands cannot be sent" :
            st?.apAddress ? (st.pdiProfile ? `Commands disabled for AP ${st.apAddress}` : "PDI not identified: commands blocked")
            : "No autopilot: commands unavailable"}
        </div>
      )}

      {onGround ? (
        <div className="launch">
          <div className="sec-title">LAUNCH SEQUENCE</div>
          {steps.map((s) => {
            const showHint = armed === s.id || s.id === current;
            return (
              <button key={s.id} type="button" className={`step-btn${s.done ? " done" : ""}${armed === s.id ? " armed" : ""}`} title={s.full}
                disabled={!allowed || !s.enabled} onClick={() => tap(s.id)} onKeyDown={noRepeat} aria-label={`Step ${s.n}: ${s.label}. ${armed === s.id ? "Tap again to confirm" : s.hint}`}>
                <span className="sb-n">{s.done ? "✓" : s.n}</span>
                <span className="sb-main">
                  <span className="sb-label">{s.label}</span>
                  {showHint && <span className="sb-hint">{armed === s.id ? "Tap again to confirm" : s.hint}</span>}
                </span>
                {s.pre}
              </button>
            );
          })}
          <div className="row gap">
            <button type="button" className="btn small-btn grow" disabled={!allowed || knobArm !== 1} onClick={() => sendCommand("motorsDisarm")}>Motors off</button>
            <button type="button" className="btn small-btn grow" disabled={!allowed || (phase !== 13 && phase !== 9)} onClick={() => sendCommand("disarmWing")}>Disarm</button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid2">
            {big("hold", "HOLD", Icon.hold, 4, "Loiter at present position", "Holding")}
            {big("rth", "RETURN HOME", Icon.home, 10, "Return to selected home", "Returning home")}
          </div>
          <button type="button" disabled={!allowed} className={`btn land-btn${armed === "land" ? " armed" : phase === 3 ? " on" : ""}`} onClick={() => tap("land")} onKeyDown={noRepeat}>
            {armed === "land" ? "LAND · tap again to confirm" : phase === 3 ? "LANDING" : "LAND (vertical)"}
          </button>
        </>
      )}

      <div className="cmd-row">
        <div className="cr-label">
          <div className="sec-title">SPEED · IAS</div>
          <div className="mono muted small">cmd {fmt(iasCmd, 1, "m/s")}{iasMode !== null && ![0, 1, 2].includes(iasMode) ? ` · ${IAS_MODE[iasMode] ?? iasMode}` : ""}</div>
        </div>
        <div className="seg3">
          {([["iasMin", "MIN", 1], ["iasCrs", "CRS", 0], ["iasMax", "MAX", 2]] as [CommandId, string, number][]).map(([id, l, m]) => (
            <button key={id} type="button" disabled={!allowed} className={`btn${iasMode === m ? " on" : ""}`} onClick={() => sendCommand(id)}>{l}</button>
          ))}
        </div>
      </div>

      {!onGround && <>
      <div className="cmd-row">
        <div className="cr-label">
          <div className="sec-title">ALT · AMSL</div>
          <div className="mono muted small">cmd {fmt(mslCmd, 0, "m")}</div>
        </div>
        <div className="stepper">
          <button type="button" className="btn sq" disabled={!allowed || onGround || mslCmd === null} onClick={() => stepAlt(-1)} aria-label="Decrease altitude by 50 m">−</button>
          <div className={`mono step-val${pending ? " pending" : ""}`}>{fmt(altT ?? mslCmd, 0, "m")}</div>
          <button type="button" className="btn sq" disabled={!allowed || onGround || mslCmd === null} onClick={() => stepAlt(1)} aria-label="Increase altitude by 50 m">+</button>
        </div>
      </div>
      <div className="row gap">
        <button type="button" className={`btn send${pending ? " ready" : ""}`} disabled={!pending || !allowed || onGround} onClick={() => { if (sendCommand("altSet", { value: altT! })) setAltT(null); }}>Send</button>
        <button type="button" className="btn" disabled={!pending} onClick={() => setAltT(null)}>Cancel</button>
      </div>
      </>}

      <div className="last-cmd">
        <div className="row between">
          <div className="sec-title">LAST COMMAND</div>
          <div className="mono">{cmd?.label ?? "—"}</div>
        </div>
        <div className="chips">
          {CHIPS.map(([n, ok], i) => (
            <span key={n} className="chip-wrap">
              {i > 0 && <span className="sep">›</span>}
              <span className={`step-chip${cmd && ok.includes(cmd.phase) ? " on" : ""}`}>{n}</span>
            </span>
          ))}
        </div>
        {cmd?.phase === "armed" && <div className="cmd-armed small">ARMED · tap the same button again within 4 s</div>}
        {cmd && BAD.includes(cmd.phase) && <div className="cmd-detail small">{cmd.phase.replace("-", " ").toUpperCase()}{cmd.detail ? ` · ${cmd.detail}` : ""}</div>}
        {cmd?.phase === "executed" && cmd.detail && <div className="muted small">{cmd.detail}</div>}
      </div>
    </section>
  );
}
