import { createRoot } from "react-dom/client";
import "@fontsource/ibm-plex-sans-condensed/400.css";
import "@fontsource/ibm-plex-sans-condensed/600.css";
import "@fontsource/ibm-plex-sans-condensed/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "maplibre-gl/dist/maplibre-gl.css";
import "./styles.css";
import { App } from "./App.tsx";
import { connectBridge } from "./state/store.ts";

connectBridge();
createRoot(document.getElementById("root")!).render(<App />);
