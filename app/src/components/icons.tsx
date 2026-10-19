// Icons from the Fly-view mockup (24×24 unless noted). Stroke uses currentColor.
const P = (d: string, extra?: { linecap?: boolean }) => (
  <svg viewBox="0 0 24 24" className="ico" aria-hidden="true">
    <path d={d} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap={extra?.linecap ? "round" : undefined} />
  </svg>
);

export const Icon = {
  logo: () => P("M12 2 L21 12 L12 22 L3 12 Z M12 7 L16 12 L12 17 L8 12 Z"),
  fly: () => P("M12 3 L19 20 L12 16 L5 20 Z"),
  plan: () => P("M5 19 L10 9 L15 14 L19 5 M5 19 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0 M19 5 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0"),
  payload: () => P("M4 7 H15 V17 H4 Z M15 10 L20 7 V17 L15 14"),
  check: () => P("M4 6 L6 8 L9 4 M4 13 L6 15 L9 11 M12 6 H20 M12 13 H20 M12 19 H20 M5 19 H8", { linecap: true }),
  sys: () => P("M4 18 A8 8 0 1 1 20 18 M12 18 L16 10", { linecap: true }),
  log: () => P("M12 4 A8 8 0 1 1 4 12 M12 8 V12 L15 14 M4 12 L4 6 M4 12 L9 12", { linecap: true }),
  hand: () => P("M4 9 H18 L14 5 M20 15 H6 L10 19", { linecap: true }),
  settings: () => P("M12 8.5 A3.5 3.5 0 1 0 12 15.5 A3.5 3.5 0 1 0 12 8.5 Z M12 2 V5 M12 19 V22 M2 12 H5 M19 12 H22 M4.9 4.9 L7 7 M17 17 L19.1 19.1 M4.9 19.1 L7 17 M17 7 L19.1 4.9", { linecap: true }),
  close: () => (
    <svg viewBox="0 0 12 12" className="ico-s" aria-hidden="true"><path d="M2 2 L10 10 M10 2 L2 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
  ),
  hold: () => (
    <svg viewBox="0 0 16 16" className="ico-s" aria-hidden="true"><path d="M5 3 V13 M11 3 V13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
  ),
  home: () => (
    <svg viewBox="0 0 16 16" className="ico-s" aria-hidden="true"><path d="M8 2 L2 7 H4 V14 H12 V7 H14 Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>
  ),
  swap: () => (
    <svg viewBox="0 0 16 16" className="ico-s" aria-hidden="true"><path d="M2 5 H13 L10 2 M14 11 H3 L6 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  lock: () => (
    <svg viewBox="0 0 16 16" className="ico-s" aria-hidden="true"><path d="M4 7 V5 a4 4 0 0 1 8 0 V7 M3 7 H13 V14 H3 Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
  ),
  chevUp: () => (<svg viewBox="0 0 10 6" className="chev" aria-hidden="true"><path d="M1 5 L5 1 L9 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>),
  chevDown: () => (<svg viewBox="0 0 10 6" className="chev" aria-hidden="true"><path d="M1 1 L5 5 L9 1" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>),
};

/** Alert level symbol: L4 octagon, L3 triangle, L2 diamond, L1 circle (CLAUDE.md alert model). */
export function LevelIcon({ level, hollow }: { level: number; hollow?: boolean }) {
  const color = level >= 3 ? "var(--red)" : level === 2 ? "var(--amber)" : "var(--white)";
  const fill = hollow ? "none" : color;
  const common = { fill, stroke: color, strokeWidth: 1.5 };
  return (
    <svg viewBox="0 0 14 14" className="lvl" aria-hidden="true">
      {level === 4 && <path d="M4.5 1 H9.5 L13 4.5 V9.5 L9.5 13 H4.5 L1 9.5 V4.5 Z" {...common} />}
      {level === 3 && <path d="M7 1.2 L13 12.5 H1 Z" {...common} strokeLinejoin="round" />}
      {level === 2 && <path d="M7 1 L13 7 L7 13 L1 7 Z" {...common} />}
      {level === 1 && <circle cx="7" cy="7" r="5.5" fill="none" stroke={color} strokeWidth="1.5" />}
    </svg>
  );
}
