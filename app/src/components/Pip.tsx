// Picture-in-picture: payload video from the ground video server (mediamtx), dockable to any corner,
// swappable with the map.
import { useStore, type Corner } from "../state/store.ts";
import { Icon } from "./icons.tsx";

const NEXT: Record<Corner, Corner> = { tl: "tr", tr: "br", br: "bl", bl: "tl" };

export function VideoView() {
  const st = useStore((s) => s.status);
  const url = st?.videoUrl ?? "";
  if (url && st?.videoReachable) return <iframe className="video-frame" src={url} title="Payload video" allow="autoplay" />;
  return (
    <div className="no-video">
      <div className="nv-title">NO VIDEO</div>
      <div className="nv-sub mono">{url ? `${url} not reachable` : "no video URL configured"}</div>
      <div className="nv-sub">Start mediamtx (pilotwindow_h264) or set video.url in config/bridge.config.json</div>
    </div>
  );
}

export function PipHeader({ label }: { label: string }) {
  const corner = useStore((s) => s.pipCorner);
  const set = useStore((s) => s.set);
  const swapped = useStore((s) => s.swapped);
  return (
    <div className="pip-head">
      <span className="rec" />
      <span className="grow">{label}</span>
      <button type="button" className="btn pip-btn" onClick={() => set({ swapped: !swapped })} aria-label="Swap picture-in-picture with main view"><Icon.swap />Swap</button>
      <button type="button" className="btn pip-btn" onClick={() => set({ pipCorner: NEXT[corner] })} aria-label="Move picture-in-picture to the next corner">
        <span className="dock">{(["tl", "tr", "bl", "br"] as Corner[]).map((c) => <span key={c} className={c === corner ? "on" : ""} />)}</span>Dock
      </button>
    </div>
  );
}
