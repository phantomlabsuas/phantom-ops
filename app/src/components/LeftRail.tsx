import { useStore, type Menu } from "../state/store.ts";
import { Icon } from "./icons.tsx";

const ITEMS: [Menu, string, () => React.ReactElement][] = [
  ["fly", "Fly", Icon.fly],
  ["plan", "Plan", Icon.plan],
  ["payload", "Payload", Icon.payload],
  ["check", "Checklists", Icon.check],
  ["sys", "Systems · live variables", Icon.sys],
  ["log", "Event log", Icon.log],
];

export function LeftRail() {
  const menu = useStore((s) => s.menu);
  const set = useStore((s) => s.set);
  const go = (m: Menu) => set({ menu: menu === m || m === "fly" ? "fly" : m });
  const btn = (m: Menu, label: string, I: () => React.ReactElement) => (
    <button key={m} type="button" className={`rail-btn${menu === m ? " on" : ""}`} onClick={() => go(m)} aria-label={label} title={label}>
      <I />
    </button>
  );
  return (
    <nav className="rail" aria-label="Workspaces">
      {ITEMS.map(([m, l, I]) => btn(m, l, I))}
      <div className="grow" />
      {btn("hand", "Shift handover", Icon.hand)}
      {btn("settings", "Display settings", Icon.settings)}
    </nav>
  );
}
