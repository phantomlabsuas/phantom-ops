import { useEffect } from "react";
import { useStore } from "./state/store.ts";
import { TopBar } from "./components/TopBar.tsx";
import { LeftRail } from "./components/LeftRail.tsx";
import { Drawer } from "./components/Drawer.tsx";
import { AlertsPanel } from "./components/AlertsPanel.tsx";
import { CommandPanel } from "./components/CommandPanel.tsx";
import { HealthStrip } from "./components/HealthStrip.tsx";
import { EngineWindow, FuelWindow } from "./components/SystemWindows.tsx";
import { VideoView, PipHeader } from "./components/Pip.tsx";
import { MapView } from "./map/MapView.tsx";
import { ConnectionBanner } from "./components/ConnectionBanner.tsx";
import { useAudioAlerts } from "./components/audio.ts";

/** UI scale: the root font size follows the viewport (styles.css); --ui-scale multiplies it. */
function useUiScale() {
  const scale = useStore((s) => s.scale);
  useEffect(() => {
    document.documentElement.style.setProperty("--ui-scale", String(scale === "auto" ? 1 : scale));
  }, [scale]);
}

export function App() {
  useUiScale();
  useAudioAlerts();
  const swapped = useStore((s) => s.swapped);
  const corner = useStore((s) => s.pipCorner);
  const drawerOpen = useStore((s) => s.menu !== "fly");
  const pip = `layer pip pip-${corner}`;
  return (
    <div className={`app${drawerOpen ? " drawer-open" : ""}`}>
      <div className={swapped ? pip : "layer main"}>
        <MapView />
        {swapped && <PipHeader label="MAP" />}
      </div>
      <div className={swapped ? "layer main video-main" : pip}>
        <VideoView />
        {!swapped && <PipHeader label="PAYLOAD VIDEO" />}
      </div>
      <TopBar />
      <LeftRail />
      <Drawer />
      <aside className="right" aria-label="Alerts and commands">
        <AlertsPanel />
        <CommandPanel />
      </aside>
      <EngineWindow />
      <FuelWindow />
      <HealthStrip />
      <ConnectionBanner />
    </div>
  );
}
