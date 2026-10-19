// Audible alerts: L4 repeats until acknowledged; L3 chimes once at onset. Browsers only allow sound after a user
// gesture, so the audio context starts on the first pointer press or key press; until then the top bar shows
// "AUDIO OFF" (useAudioState) so the operator knows alarms would be silent.
import { useEffect, useRef, useSyncExternalStore } from "react";
import { useStore } from "../state/store.ts";

let ctx: AudioContext | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

const unlock = () => {
  try {
    if (!ctx) { ctx = new AudioContext(); ctx.onstatechange = notify; }
    if (ctx.state === "suspended") void ctx.resume().then(notify, notify);
    notify();
  } catch { /* no audio device */ }
};
window.addEventListener("pointerdown", unlock);
window.addEventListener("keydown", unlock);

/** true when alarm audio can play. */
export function useAudioState(): boolean {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => ctx?.state === "running");
}

function tone(freq: number, start: number, dur: number) {
  if (!ctx || ctx.state !== "running") return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = "square"; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + start); o.stop(ctx.currentTime + start + dur + 0.05);
}

export function useAudioAlerts() {
  const active = useStore((s) => s.alerts.active);
  const seen = useRef(new Set<string>());
  useEffect(() => {
    if (!useStore.getState().connected) return;   // frozen state while the bridge is offline: no new chimes
    const live = active.filter((a) => !a.inhibited);
    for (const a of live) {
      if (!seen.current.has(a.id) && a.level === 3) { tone(880, 0, 0.18); tone(660, 0.22, 0.25); }
      seen.current.add(a.id);
    }
    for (const id of [...seen.current]) if (!live.some((a) => a.id === id)) seen.current.delete(id);
  }, [active]);
  useEffect(() => {
    const i = setInterval(() => {
      const s = useStore.getState();
      if (!s.connected) return;                    // the offline banner replaces a stale L4 tone
      const l4 = s.alerts.active.some((a) => a.level === 4 && !a.inhibited && !a.acked);
      if (l4) { tone(988, 0, 0.15); tone(988, 0.25, 0.15); tone(988, 0.5, 0.15); }
    }, 1500);
    return () => clearInterval(i);
  }, []);
}
