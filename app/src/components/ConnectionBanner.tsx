import { useStore } from "../state/store.ts";

/** Full-width banner when the bridge or the autopilot is not reporting. Values on screen are then stale. */
export function ConnectionBanner() {
  const connected = useStore((s) => s.connected);
  const st = useStore((s) => s.status);
  let msg = "";
  if (!connected) msg = "BRIDGE OFFLINE · start it with npm run dev (reconnecting…)";
  else if (st && !st.socketOpen) msg = `NOT CONNECTED TO VERONTE LINK · ${st.socketError || "multicast socket not open"}`;
  else if (st && st.apAddress === null) msg = "WAITING FOR AUTOPILOT · no telemetry on 225.200.1.0:51017 (is Veronte Link running?)";
  else if (st && !st.apAlive) msg = `AUTOPILOT ${st.apAddress} NO REPORT · values on screen are stale`;
  else if (st && st.unknownHashes.length && !st.pdiProfile) msg = `TELEMETRY LAYOUT UNKNOWN · hash ${st.unknownHashes.join(", ")} not in any PDI profile`;
  if (!msg) return null;
  return <div className="conn-banner" role="status">{msg}</div>;
}
