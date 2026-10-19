// Offline basemap: one .pmtiles archive from the folder map.offlineDir (bridge config), served by the web server at
// /offline/ (vite.config.ts) and read by MapLibre through the pmtiles:// protocol. A raster archive becomes one raster
// layer; a vector archive in the Protomaps schema gets the Protomaps dark style. Labels are drawn in the browser from
// the bundled IBM Plex fonts (Latin) and system fonts (other scripts), so no glyph server is needed.
import { addProtocol, type FontFacesSpecification, type LayerSpecification, type SourceSpecification } from "maplibre-gl";
import { PMTiles, Protocol, TileType } from "pmtiles";
import { layers, namedFlavor } from "@protomaps/basemaps";
import plex400 from "@fontsource/ibm-plex-sans-condensed/files/ibm-plex-sans-condensed-latin-400-normal.woff2?url";
import plex400x from "@fontsource/ibm-plex-sans-condensed/files/ibm-plex-sans-condensed-latin-ext-400-normal.woff2?url";
import plex500 from "@fontsource/ibm-plex-sans-condensed/files/ibm-plex-sans-condensed-latin-500-normal.woff2?url";
import plex500x from "@fontsource/ibm-plex-sans-condensed/files/ibm-plex-sans-condensed-latin-ext-500-normal.woff2?url";
import plexIt from "@fontsource/ibm-plex-sans-condensed/files/ibm-plex-sans-condensed-latin-400-italic.woff2?url";
import plexItx from "@fontsource/ibm-plex-sans-condensed/files/ibm-plex-sans-condensed-latin-ext-400-italic.woff2?url";

export type OfflineMap =
  | { state: "loading" }
  | { state: "none"; hint: string }
  | {
      state: "ready"; file: string; url: string; kind: "raster" | "vector";
      bounds: [number, number, number, number]; minZoom: number; maxZoom: number; sprite: boolean;
    };
type Ready = Extract<OfflineMap, { state: "ready" }>;

export const OFFLINE_SOURCE = "offline";
export const OFFLINE_PREFIX = "offline-"; // every offline layer id starts with this

const protocol = new Protocol({ metadata: true }); // metadata: the archive's attribution reaches the map
addProtocol("pmtiles", protocol.tile);

const abs = (path: string) => new URL(path, location.href).href;

export async function loadOfflineMap(): Promise<OfflineMap> {
  let idx: { file: string | null; sprite: boolean; hint: string };
  try {
    const r = await fetch("/offline/index.json", { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    idx = await r.json();
  } catch (e) {
    return { state: "none", hint: `The web server does not serve /offline/ (${(e as Error).message}).` };
  }
  if (!idx.file) return { state: "none", hint: idx.hint };
  const url = abs(`/offline/${encodeURIComponent(idx.file)}`);
  try {
    const p = new PMTiles(url);
    const h = await p.getHeader();
    const kind = h.tileType === TileType.Mvt ? "vector"
      : [TileType.Png, TileType.Jpeg, TileType.Webp, TileType.Avif].includes(h.tileType) ? "raster" : null;
    if (!kind) return { state: "none", hint: `${idx.file}: tile type ${TileType[h.tileType]} is not supported (raster or MVT only).` };
    protocol.add(p);
    return {
      state: "ready", file: idx.file, url, kind, sprite: idx.sprite,
      bounds: [h.minLon, h.minLat, h.maxLon, h.maxLat], minZoom: h.minZoom, maxZoom: h.maxZoom,
    };
  } catch (e) {
    return { state: "none", hint: `${idx.file} cannot be read: ${(e as Error).message}` };
  }
}

// The Protomaps style names Noto Sans; draw its Latin labels in the UI's typeface instead.
const latin = ["U+0000-00FF", "U+0131", "U+0152-0153", "U+02BB-02BC", "U+02C6", "U+02DA", "U+02DC", "U+2000-206F", "U+20AC", "U+2122", "U+2212"];
const latinExt = ["U+0100-02AF", "U+1E00-1EFF", "U+2C60-2C7F", "U+A720-A7FF"];
const face = (a: string, b: string) => [{ url: abs(a), "unicode-range": latin }, { url: abs(b), "unicode-range": latinExt }];
export const FONT_FACES: FontFacesSpecification = {
  "Noto Sans Regular": face(plex400, plex400x),
  "Noto Sans Medium": face(plex500, plex500x),
  "Noto Sans Italic": face(plexIt, plexItx),
};

export const spriteUrl = () => abs("/offline/sprites/v4/dark");

export function offlineStyle(m: Ready): { source: SourceSpecification; layers: LayerSpecification[] } {
  const url = `pmtiles://${m.url}`;
  if (m.kind === "raster") {
    return {
      source: { type: "raster", url, tileSize: 256 },
      // dimmed for night operations, like the online imagery
      layers: [{ id: `${OFFLINE_PREFIX}raster`, type: "raster", source: OFFLINE_SOURCE, paint: { "raster-brightness-max": 0.62, "raster-saturation": -0.3, "raster-contrast": 0.08 } }],
    };
  }
  return {
    source: { type: "vector", url },
    layers: layers(OFFLINE_SOURCE, namedFlavor("dark"), { lang: "en" }).map((l) => ({ ...l, id: OFFLINE_PREFIX + l.id })),
  };
}
