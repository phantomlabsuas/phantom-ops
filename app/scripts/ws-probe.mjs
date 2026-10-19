// Dev helper: connect to the bridge WebSocket for a few seconds and print what arrives.
// Usage: node scripts/ws-probe.mjs [seconds]
import WebSocket from "ws";

const secs = Number(process.argv[2] ?? 5);
const ws = new WebSocket("ws://127.0.0.1:8787");
let n = 0;
const keys = new Set();
const last = {};
ws.on("error", (e) => { console.error("ws error:", e.message); process.exit(1); });
ws.on("message", (raw) => {
  const m = JSON.parse(raw);
  if (m.type === "hello") { last.hello = Object.keys(m.vars).length; last.status = m.status; last.alerts = m.alerts; }
  if (m.type === "vars") { n++; for (const [k, v] of Object.entries(m.vars)) { keys.add(k); last[k] = v.v; } }
  if (m.type === "status") last.status = m.status;
  if (m.type === "alerts") last.alerts = m.alerts;
  if (m.type === "command") console.log("command", JSON.stringify(m.command));
});
setTimeout(() => {
  console.log("hello vars", last.hello, "| var messages", n, "| distinct vars", keys.size);
  console.log("status", JSON.stringify(last.status));
  for (const k of ["R501", "R500", "R503", "R504", "R3", "U1", "R3499", "R3502", "B1213", "R3173", "R3174", "R209", "U1002", "B2199"]) console.log(" ", k, last[k]);
  const a = last.alerts;
  if (a) {
    console.log(`alerts: ${a.active.length} active, ${a.noData} without data, ${a.historyCount} activations`);
    for (const x of a.active) console.log(`  L${x.level}${x.inhibited ? " (inhibited: " + x.inhibitReason + ")" : ""} ${x.segment} ${x.text} [${x.var ?? ""}]`);
  }
  process.exit(0);
}, secs * 1000);
