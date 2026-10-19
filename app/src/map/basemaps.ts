// Online basemaps. Free tile providers change without notice. In October 2026 Esri's Akamai edge for the legacy host
// (server.arcgisonline.com) started answering 403 to this office's public IP (other UAE addresses still get tiles; Esri
// has not retired it), and CARTO began serving an "API key required" image for every keyless tile. That left both
// online basemaps blank. So each online basemap lists candidate providers. At startup each one is probed in order (real
// tiles, CORS, not one placeholder image for every tile) and the first that passes is used. While running, MapView
// marks a provider failed when its tiles keep failing, and the next candidate or another basemap takes over.
//
// Licensing: keyless use of Esri imagery outside Esri apps is a grey area under the Esri Master License Agreement; the
// documented path is an ArcGIS Location Platform API key (free tier 2M tiles a month). Put it in app/.env.local as
// VITE_ARCGIS_API_KEY=... and the keyed source is tried first. No online imagery may be cached for offline use.
import type { LayerSpecification, SourceSpecification, StyleSpecification } from "maplibre-gl";
import { namedFlavor } from "@protomaps/basemaps";

export type OnlineBasemap = "satellite" | "dark";

/** `degraded`: a short note shown on the map while this provider is in use (older or coarser than the first choice). */
export interface RasterProvider {
  kind: "raster"; id: string; name: string; host: string;
  tiles: string[]; tileSize: number; maxzoom: number; attribution: string;
  paint?: Record<string, unknown>; degraded?: string;
}
export interface StyleProvider { kind: "style"; id: string; name: string; host: string; styleUrl: string; degraded?: string }
export type Provider = RasterProvider | StyleProvider;

/** A probe's answer. ok: the provider in use and why earlier candidates were passed over. failed: every reason;
 *  whether every candidate was simply unreachable (no HTTP answer at all), which points at our own connection; and
 *  (set by the store) whether the basemap worked earlier this session, so MapLibre may still hold some of its tiles. */
export type BasemapVerdict =
  | { state: "ok"; provider: Provider; style?: StyleSpecification; skipped: string[]; at: number }
  | { state: "failed"; detail: string; network: boolean; at: number; cached?: boolean };
/** idle: not probed yet (OFFLINE in use, so no internet requests). checking: a probe is running; `prev` is the verdict
 *  still in force meanwhile. */
export type BasemapHealth = { state: "idle" } | { state: "checking"; prev?: BasemapVerdict } | BasemapVerdict;
/** The verdict in force: the last one while a new probe runs; none before the first answer. */
export const verdictOf = (h: BasemapHealth): BasemapVerdict | undefined => (h.state === "ok" || h.state === "failed" ? h : h.state === "checking" ? h.prev : undefined);
/** A provider blamed for failing while in use: skipped by probes until `until`. */
export interface Blame { why: string; until: number; count: number }

// Imagery is dimmed for night operations; every raster provider gets the same treatment.
const NIGHT = { "raster-brightness-max": 0.62, "raster-saturation": -0.3, "raster-contrast": 0.08 };
const ESRI_ATTR = "Powered by Esri · Esri, Vantor, Earthstar Geographics, and the GIS User Community";
const ESRI = { kind: "raster", tileSize: 256, maxzoom: 19, attribution: ESRI_ATTR, paint: NIGHT } as const;
const ARCGIS_KEY = (import.meta.env.VITE_ARCGIS_API_KEY as string | undefined)?.trim();

export const PROVIDERS: Record<OnlineBasemap, Provider[]> = {
  satellite: [
    // Licensed path, only when a key is configured (see above).
    ...(ARCGIS_KEY ? [{ ...ESRI, id: "esri-key", name: "Esri World Imagery (API key)", host: "ibasemaps-api.arcgis.com",
      tiles: [`https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=${encodeURIComponent(ARCGIS_KEY)}`] }] : []),
    // World Imagery Wayback, release 2026-09-24 (id 63116): Esri's supported archive of World Imagery, served from
    // CloudFront. Newer release ids are listed in https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json
    { ...ESRI, id: "esri-wayback", name: "Esri World Imagery (Wayback 2026-09-24)", host: "wayback.maptiles.arcgis.com",
      tiles: ["https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/63116/{z}/{y}/{x}"] },
    // The host the app used until October 2026 (blocked for this office's IP since then, fine elsewhere).
    { ...ESRI, id: "esri-legacy", name: "Esri World Imagery", host: "server.arcgisonline.com",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"] },
    // World Imagery (Clarity): deprecated, retires March 2028, imagery can be years older. Fallback only.
    { ...ESRI, id: "esri-clarity", name: "Esri World Imagery (Clarity, deprecated)", host: "clarity.maptiles.arcgis.com", degraded: "Esri Clarity, imagery may be years old",
      tiles: ["https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"] },
    // Last resort: 10 m Sentinel-2 mosaic, 2016 edition (CC BY 4.0, fine for company use). Too coarse near the airfield.
    { kind: "raster", id: "eox-s2", name: "Sentinel-2 cloudless 2016 (EOX, 10 m)", host: "tiles.maps.eox.at", tileSize: 256, maxzoom: 15, degraded: "Sentinel-2 2016, 10 m",
      tiles: ["https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg"],
      attribution: "EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2016 & 2017)", paint: NIGHT },
  ],
  dark: [
    // OpenFreeMap: OpenStreetMap vector tiles, no key, commercial use allowed. Its text layers also label the imagery.
    { kind: "style", id: "openfreemap-dark", name: "OpenFreeMap dark (OpenStreetMap)", host: "tiles.openfreemap.org", styleUrl: "https://tiles.openfreemap.org/styles/dark" },
  ],
};

// ---- probing ----------------------------------------------------------------------------------------------------
const TIMEOUT_MS = 8000;
// Two z5 land tiles (Arabian Gulf, central Europe): real imagery differs; a placeholder image does not.
const PROBE_TILES: [number, number, number][] = [[5, 20, 13], [5, 16, 11]];
const tileUrl = (t: string, [z, x, y]: [number, number, number]) => t.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));

/** `network`: no HTTP answer at all (unreachable, CORS-blocked, timed out), as opposed to an answer that was wrong. */
class ProbeError extends Error {
  constructor(message: string, readonly network: boolean) { super(message); }
}

/** One request. The timeout also covers reading the body, so a response that stalls after its headers cannot hang a probe. */
async function get<T>(url: string, read: (r: Response) => Promise<T>): Promise<T> {
  const host = new URL(url).host;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    let r: Response;
    try {
      r = await fetch(url, { mode: "cors", signal: ac.signal, cache: "no-cache" });
    } catch (e) {
      // a CORS rejection and a network failure look the same from here: the browser hides the response
      throw new ProbeError(ac.signal.aborted ? `no answer from ${host} in ${TIMEOUT_MS / 1000} s` : `${host} blocked or unreachable (${(e as Error).message})`, true);
    }
    if (!r.ok) throw new ProbeError(`HTTP ${r.status} from ${host}`, false);
    try {
      return await read(r);
    } catch (e) {
      if (e instanceof ProbeError) throw e;
      if (ac.signal.aborted || e instanceof TypeError) throw new ProbeError(`${host} stopped sending (${ac.signal.aborted ? `over ${TIMEOUT_MS / 1000} s` : (e as Error).message})`, true);
      throw new ProbeError(`${host} sent an unreadable answer (${(e as Error).message})`, false);
    }
  } finally { clearTimeout(timer); }
}

async function probeRaster(p: RasterProvider): Promise<void> {
  const bodies: Uint8Array[] = [];
  for (const t of PROBE_TILES) {
    bodies.push(await get(tileUrl(p.tiles[0], t), async (r) => {
      const type = r.headers.get("content-type") ?? "";
      if (!type.startsWith("image/")) throw new ProbeError(`${p.host} answered ${type || "no content type"}, not an image`, false);
      return new Uint8Array(await r.arrayBuffer());
    }));
  }
  const [a, b] = bodies;
  if (a.length === b.length && a.every((v, i) => v === b[i])) throw new ProbeError(`${p.host} returns the same placeholder image for every tile (API key required?)`, false);
}

async function probeStyle(p: StyleProvider): Promise<StyleSpecification> {
  const style = await get(p.styleUrl, (r) => r.json() as Promise<StyleSpecification>);
  if (!Array.isArray(style?.layers) || !style.sources) throw new ProbeError(`${p.host} did not return a map style`, false);
  // one vector tile through the style's TileJSON, so a style that loads but has no tiles is caught too
  const vec = Object.values(style.sources).find((s) => s.type === "vector" && "url" in s && s.url) as { url: string } | undefined;
  if (vec) {
    const tiles = (await get(vec.url, (r) => r.json() as Promise<{ tiles?: string[] }>)).tiles;
    if (!tiles?.length) throw new ProbeError(`${new URL(vec.url).host} lists no tiles`, false);
    await get(tileUrl(tiles[0], [0, 0, 0]), (r) => r.arrayBuffer());
  }
  return style;
}

/** The first candidate that serves real tiles, or why none did (the first candidate's reason leads). Candidates blamed
 *  for failing while in use are skipped until their blame expires. */
export async function probeBasemap(b: OnlineBasemap, blamed: ReadonlyMap<string, Blame> = new Map()): Promise<BasemapVerdict> {
  const reasons: string[] = [];
  let probed = 0, unreachable = 0;
  for (const p of PROVIDERS[b]) {
    const blame = blamed.get(p.id);
    if (blame && blame.until > Date.now()) { reasons.push(`${p.name}: ${blame.why}`); continue; }
    probed++;
    try {
      const style = p.kind === "style" ? await probeStyle(p) : (await probeRaster(p), undefined);
      return { state: "ok", provider: p, style, skipped: reasons, at: Date.now() };
    } catch (e) {
      reasons.push(`${p.name}: ${(e as Error).message}`);
      if (e instanceof ProbeError && e.network) unreachable++;
    }
  }
  return { state: "failed", detail: reasons.join(" · "), network: probed > 0 && unreachable === probed, at: Date.now() };
}

// ---- adding a style provider's layers to the app's map -------------------------------------------------------------
export const DARK_PREFIX = "dark-"; // every layer and source id of the dark basemap starts with this

// OpenFreeMap's dark style is nearly black (roads #181818 on #0c0c0c, labels mid-grey), too faint for a ground station.
// Its OpenMapTiles layers are repainted with the Protomaps dark palette the offline map uses, so both dark maps look the
// same. Layers not listed keep their colours.
const F = namedFlavor("dark");
const RAIL = "#3a3a3a";
const line = (c: string) => ({ "line-color": c });
const fill = (c: string) => ({ "fill-color": c });
const text = (c: string, halo: string) => ({ "text-color": c, "text-halo-color": halo });
const OMT_DARK: Record<string, Record<string, string>> = {
  background: { "background-color": F.earth },
  water: fill(F.water), waterway: line(F.water),
  landcover_ice_shelf: fill(F.glacier), landcover_glacier: fill(F.glacier),
  landuse_residential: fill(F.landcover?.urban_area ?? F.industrial),
  landcover_wood: fill(F.wood_a), landuse_park: fill(F.park_a), building: fill(F.buildings),
  "aeroway-area": fill(F.aerodrome), "aeroway-runway": line(F.runway), "aeroway-taxiway": line(F.runway), "aeroway-runway-casing": line(F.major_casing_early),
  road_area_pier: fill(F.pier), road_pier: line(F.pier),
  highway_path: line(F.other), highway_minor: line(F.minor_a),
  highway_major_casing: line(F.major_casing_early), highway_major_inner: line(F.major), highway_major_subtle: line(F.major),
  highway_motorway_casing: line(F.highway_casing_early), highway_motorway_inner: line(F.highway), highway_motorway_subtle: line(F.highway),
  railway: line(RAIL), railway_transit: line(RAIL), railway_minor: line(RAIL),
  railway_dashline: line(F.earth), railway_transit_dashline: line(F.earth), railway_minor_dashline: line(F.earth),
  boundary_state: line(F.boundaries), "boundary_country_z0-4": line(F.boundaries), "boundary_country_z5-": line(F.boundaries),
  water_name: text(F.ocean_label, F.earth),
  highway_name_other: text(F.roads_label_minor, F.roads_label_minor_halo), highway_name_motorway: text(F.roads_label_major, F.roads_label_major_halo),
  place_other: text(F.subplace_label, F.subplace_label_halo), place_suburb: text(F.subplace_label, F.subplace_label_halo), place_village: text(F.subplace_label, F.subplace_label_halo),
  place_town: text(F.city_label, F.city_label_halo), place_city: text(F.city_label, F.city_label_halo), place_city_large: text(F.city_label, F.city_label_halo),
  place_state: text(F.state_label, F.state_label_halo),
  place_country_other: text(F.country_label, F.city_label_halo), place_country_minor: text(F.country_label, F.city_label_halo), place_country_major: text(F.country_label, F.city_label_halo),
};

/** Label paint over the satellite imagery: light text on a dark halo, readable on any ground. */
export const ON_IMAGERY = { "text-color": "#E4E8EC", "text-halo-color": "rgba(8, 10, 12, 0.9)", "text-halo-width": 1.5 } as const;

/** The provider's sources and layers, renamed with DARK_PREFIX and repainted (OMT_DARK). Icon-only symbol layers
 *  (one-way arrows) are dropped: the map has one sprite sheet. `label` marks the text layers that are also drawn over
 *  the satellite imagery. */
export function importStyle(style: StyleSpecification): { sources: [string, SourceSpecification][]; layers: (LayerSpecification & { label: boolean })[] } {
  const sources = Object.entries(style.sources).map(([id, s]) => [DARK_PREFIX + id, s] as [string, SourceSpecification]);
  const layers = style.layers
    .filter((l) => !(l.type === "symbol" && !l.layout?.["text-field"]))
    .map((l) => ({
      ...l, id: DARK_PREFIX + l.id,
      ...("source" in l && l.source ? { source: DARK_PREFIX + l.source } : {}),
      ...(OMT_DARK[l.id] ? { paint: { ...("paint" in l ? l.paint : {}), ...OMT_DARK[l.id] } } : {}),
      label: l.type === "symbol",
    })) as (LayerSpecification & { label: boolean })[];
  return { sources, layers };
}

// ---- label size follows the UI scale ----------------------------------------------------------------------------
type Expr = unknown;
/** text-size multiplied by k. Handles numbers, zoom functions ({stops}) and top-level interpolate / step expressions
 *  (whose zoom input may not be wrapped); anything else is wrapped in ["*", k, …]. */
export function scaleTextSize(v: Expr, k: number): Expr {
  const num = (x: Expr) => (typeof x === "number" ? Math.round(x * k * 100) / 100 : ["*", k, x]);
  if (v === undefined || v === null) return 16 * k;   // the style-spec default
  if (typeof v === "number") return num(v);
  if (Array.isArray(v)) {
    const [op] = v;
    if (op === "interpolate" || op === "interpolate-hcl" || op === "interpolate-lab")
      return v.map((x, i) => (i >= 4 && i % 2 === 0 ? num(x) : x));
    if (op === "step") return v.map((x, i) => (i >= 2 && i % 2 === 0 ? num(x) : x));
    return ["*", k, v];
  }
  if (typeof v === "object" && v && "stops" in v) {
    const f = v as { stops: [unknown, unknown][] };
    return { ...f, stops: f.stops.map(([z, s]) => [z, typeof s === "number" ? Math.round(s * k * 100) / 100 : s]) };
  }
  return v;
}
