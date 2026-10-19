// Full-bleed map: MapLibre GL with keyless online basemaps (satellite imagery, dark vector map; basemaps.ts) or a local offline extract,
// the own aircraft from live telemetry (R501/R500 lat/lon, R3 heading), its track, an engine-out glide ring, and the
// route planned in Phantom OPS (click to add waypoints, drag to move; drawn only, not uploaded to the autopilot in v0).
// Updates bypass React rendering: the map subscribes to the store directly.
import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { Map as MlMap, Marker, ScaleControl, setWorkerUrl, type GeoJSONSource, type LayerSpecification, type RasterTileSource, type StyleSpecification } from "maplibre-gl";
import type { Feature, FeatureCollection } from "geojson";
import { addWaypoint, basemapUsable, chooseBasemap, connectionDown, markBasemapFailed, moveWaypoint, shownBasemap, unreachable, useStore, type Basemap, type Waypoint } from "../state/store.ts";
import { bearingDeg, distanceM, fmtBrg, fmtDist } from "./geo.ts";
import { RAD, GLIDE_RATIO, isFresh, useNum, fmt } from "../state/signals.ts";
import { FONT_FACES, OFFLINE_PREFIX, OFFLINE_SOURCE, offlineStyle, spriteUrl, type OfflineMap } from "./offline.ts";
import { DARK_PREFIX, ON_IMAGERY, importStyle, scaleTextSize, verdictOf, type BasemapVerdict, type OnlineBasemap } from "./basemaps.ts";

// The basemaps are added once their providers are known (basemaps.ts, offline.ts); the background shows meanwhile.
const STYLE: StyleSpecification = {
  version: 8,
  "font-faces": FONT_FACES,
  sources: {},
  layers: [{ id: "bg", type: "background", paint: { "background-color": "#0B0E11" } }],
};

// MapLibre 6 looks for its worker next to its own module, which Vite moves; serve it as a static file (vite.config.ts).
setWorkerUrl(new URL("/vendor/maplibre-gl-worker.mjs", location.href).href);

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };
const BASEMAPS: { id: Basemap; label: string }[] = [{ id: "satellite", label: "SAT" }, { id: "dark", label: "DARK" }, { id: "offline", label: "OFFLINE" }];
const LABEL: Record<Basemap, string> = { satellite: "SAT", dark: "DARK", offline: "OFFLINE" };

// Basemap layers sit under the own-ship overlays in this order: satellite, dark (whose text layers also label the
// imagery), offline. Only one basemap is visible at a time.
const SAT = "sat";
// map.getStyle() is undefined while the WebGL context is lost and for a frame after it is restored: helpers check it.
const firstLayer = (map: MlMap, test: (id: string) => boolean) => map.getStyle()?.layers.find((l) => test(l.id))?.id;

// Map labels follow the UI scale like the rest of the screen: each symbol layer's own text-size is kept and multiplied.
const labelBase = new WeakMap<MlMap, Map<string, unknown>>();
function registerLabels(map: MlMap, layers: LayerSpecification[]) {
  const base = labelBase.get(map) ?? new Map<string, unknown>();
  labelBase.set(map, base);
  for (const l of layers) if (l.type === "symbol" && l.layout?.["text-field"]) base.set(l.id, l.layout["text-size"]);
  scaleLabels(map, layers.map((l) => l.id));
}
function scaleLabels(map: MlMap, only?: string[]) {
  const base = labelBase.get(map);
  if (!base || !map.getStyle()) return;
  const k = remPx() / 16;
  for (const [id, size] of base) {
    if (only && !only.includes(id)) continue;
    if (map.getLayer(id)) map.setLayoutProperty(id, "text-size", scaleTextSize(size, k) as number);
  }
}
/** Removes the layers (and their label entries) whose id starts with `prefix`, then the matching sources. */
function removeGroup(map: MlMap, prefix: string, sources: string[] = []) {
  const st = map.getStyle();
  if (!st) return;
  for (const l of st.layers) if (l.id.startsWith(prefix)) { map.removeLayer(l.id); labelBase.get(map)?.delete(l.id); }
  for (const id of [...Object.keys(st.sources).filter((id) => id.startsWith(prefix)), ...sources]) if (map.getSource(id)) map.removeSource(id);
}

// What each map has installed: provider id and the verdict time it came from.
type Installed = { id: string; at: number };
const satInstalled = new WeakMap<MlMap, Installed>();
const darkInstalled = new WeakMap<MlMap, Installed>();
const installedProvider = (map: MlMap, b: OnlineBasemap) => (b === "satellite" ? satInstalled : darkInstalled).get(map)?.id;

/** Installs the verdict's satellite provider. A new verdict for the provider already installed reloads it only when
 *  its tiles have failed since (`reload`): MapLibre keeps errored tiles otherwise. Returns true when anything changed. */
function ensureSatellite(map: MlMap, v: BasemapVerdict | undefined, reload: boolean): boolean {
  if (v?.state !== "ok" || v.provider.kind !== "raster" || !map.getStyle()) return false;
  const p = v.provider, cur = satInstalled.get(map);
  if (cur?.id === p.id) {
    if (cur.at === v.at || !reload) return false;
    (map.getSource(SAT) as RasterTileSource | undefined)?.setTiles(p.tiles);   // reloads every tile, errored ones too
    satInstalled.set(map, { id: p.id, at: v.at });
    return true;
  }
  if (map.getLayer(SAT)) map.removeLayer(SAT);
  if (map.getSource(SAT)) map.removeSource(SAT);
  satInstalled.set(map, { id: p.id, at: v.at });
  map.addSource(SAT, { type: "raster", tiles: p.tiles, tileSize: p.tileSize, maxzoom: p.maxzoom, attribution: p.attribution });
  map.addLayer({ id: SAT, type: "raster", source: SAT, layout: { visibility: "none" }, paint: p.paint ?? {} } as LayerSpecification,
    firstLayer(map, (id) => id.startsWith(DARK_PREFIX) || id.startsWith(OFFLINE_PREFIX) || id === "trail"));
  return true;
}

const darkLabels = new WeakMap<MlMap, Map<string, Record<string, unknown>>>();   // label layer → its dark-map text paint
const labelMode = new WeakMap<MlMap, "dark" | "imagery">();
/** Dark-map label colours, or light-on-halo ones while the labels sit on the satellite imagery. */
function setLabelPaint(map: MlMap, mode: "dark" | "imagery") {
  const labels = darkLabels.get(map);
  if (!labels || labelMode.get(map) === mode) return;
  labelMode.set(map, mode);
  for (const [id, own] of labels) {
    if (!map.getLayer(id)) continue;
    for (const k of Object.keys(ON_IMAGERY) as (keyof typeof ON_IMAGERY)[])
      map.setPaintProperty(id, k, (mode === "imagery" ? ON_IMAGERY[k] : own[k]) as string | number | undefined);
  }
}
/** Installs the verdict's dark-map provider; same reload rule as ensureSatellite (a reload re-adds the sources, which
 *  also fetches the TileJSON again). Returns true when anything changed. */
function ensureDark(map: MlMap, v: BasemapVerdict | undefined, reload: boolean): boolean {
  if (v?.state !== "ok" || v.provider.kind !== "style" || !v.style || !map.getStyle()) return false;
  const cur = darkInstalled.get(map);
  if (cur?.id === v.provider.id && (cur.at === v.at || !reload)) return false;
  removeGroup(map, DARK_PREFIX);
  darkInstalled.set(map, { id: v.provider.id, at: v.at });
  const { sources, layers } = importStyle(v.style);
  const before = firstLayer(map, (id) => id.startsWith(OFFLINE_PREFIX) || id === "trail");
  for (const [id, src] of sources) map.addSource(id, src);
  const labels = new Map<string, Record<string, unknown>>();
  const added: LayerSpecification[] = [];
  for (const { label, ...l } of layers) {
    const layer = { ...l, layout: { ...l.layout, visibility: "none" } } as LayerSpecification;
    map.addLayer(layer, before);
    added.push(layer);
    if (label && layer.type === "symbol") {
      const p = (layer.paint ?? {}) as Record<string, unknown>;
      labels.set(layer.id, Object.fromEntries(Object.keys(ON_IMAGERY).map((k) => [k, p[k]])));
    }
  }
  darkLabels.set(map, labels);
  labelMode.delete(map);
  registerLabels(map, added);
  return true;
}

// Adds the offline archive's source and layers (hidden) below the own-ship overlays, plus a dashed outline of its extent.
// A rescan that finds a different archive replaces them.
const offlineUrl = new WeakMap<MlMap, string>();
function addOffline(map: MlMap, m: OfflineMap) {
  if (m.state !== "ready" || offlineUrl.get(map) === m.url || !map.getStyle()) return;
  removeGroup(map, OFFLINE_PREFIX, [OFFLINE_SOURCE]);
  offlineUrl.set(map, m.url);
  const { source, layers } = offlineStyle(m);
  const before = map.getLayer("trail") ? "trail" : undefined;
  map.addSource(OFFLINE_SOURCE, source);
  for (const l of layers) map.addLayer({ ...l, layout: { ...l.layout, visibility: "none" } } as typeof l, before);
  registerLabels(map, layers);
  if (m.kind === "vector" && m.sprite) map.setSprite(spriteUrl());
  const [w, s, e, n] = m.bounds;
  if (e - w < 359) {
    map.addSource(`${OFFLINE_PREFIX}extent`, { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[w, s], [e, s], [e, n], [w, n], [w, s]] } } });
    map.addLayer({ id: `${OFFLINE_PREFIX}extent`, type: "line", source: `${OFFLINE_PREFIX}extent`, layout: { visibility: "none" }, paint: { "line-color": "#8A949E", "line-width": remPx() / 16, "line-dasharray": [2, 3] } }, before);
  }
}

/** The compact attribution opens expanded when a source with attribution arrives; fold it to its (i) button so it
 *  does not cover the map. "Powered by Esri" stays visible on its own label (MapView). */
const collapseAttribution = (map: MlMap) => map.getContainer().querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");

function circle(lon: number, lat: number, radiusM: number, n = 96): Feature {
  const coords: [number, number][] = [];
  const dLat = radiusM / 111320, dLon = radiusM / (111320 * Math.cos(lat / RAD));
  for (let i = 0; i <= n; i++) { const a = (i / n) * 2 * Math.PI; coords.push([lon + dLon * Math.sin(a), lat + dLat * Math.cos(a)]); }
  return { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } };
}

function waypointElement(n: number) {
  const el = document.createElement("div");
  el.className = "wp-marker";
  el.textContent = String(n);
  return el;
}

function legElement() {
  const el = document.createElement("div");
  el.className = "leg-label";
  return el;
}

/** Route line through the waypoints, and a dashed lead line from the aircraft to the first waypoint. */
function routeData(route: Waypoint[], ac: [number, number] | null): { line: FeatureCollection; lead: FeatureCollection } {
  const line: FeatureCollection = route.length >= 2
    ? { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: route.map((w) => [w.lon, w.lat]) } }] }
    : EMPTY;
  const lead: FeatureCollection = route.length >= 1 && ac
    ? { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [ac, [route[0].lon, route[0].lat]] } }] }
    : EMPTY;
  return { line, lead };
}

// Overlay line widths in CSS px at 16 px/rem; scaled with the root font size so they keep their weight on large screens.
const LINE_W: Record<string, number> = { trail: 2, glide: 1.25, "route-lead": 2, route: 3, [`${OFFLINE_PREFIX}extent`]: 1 };
const remPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

/** Keeps the camera centre (follow, recentre) in the map area the panels leave free. The map in the PiP has no panels
 *  over it, and padding never takes more than the map's size minus 4 rem. */
function layoutPadding(container: HTMLElement) {
  if (container.closest(".pip")) return { top: 0, bottom: 0, left: 0, right: 0 };
  const w = (sel: string, dim: "width" | "height") => (document.querySelector(sel) as HTMLElement | null)?.getBoundingClientRect()[dim] ?? 0;
  const rem = remPx(), { width, height } = container.getBoundingClientRect();
  const fit = (a: number, b: number, size: number) => { const k = Math.min(1, Math.max(0, size - 4 * rem) / Math.max(1, a + b)); return [a * k, b * k]; };
  const [left, right] = fit(w(".rail", "width"), w(".right", "width") + rem, width);
  const [top, bottom] = fit(w(".topbar", "height"), w(".health", "height"), height);
  return { top, bottom, left, right };
}
/** setPadding is a jumpTo, which stops a running follow or zoom animation: only call it when the padding changes. */
function syncPadding(map: MlMap) {
  const p = layoutPadding(map.getContainer()), c = map.getPadding();
  if ((["top", "bottom", "left", "right"] as const).some((k) => Math.abs(p[k] - (c[k] ?? 0)) > 0.5)) map.setPadding(p);
}
/** A position worth centring on: finite, on the globe, and not the 0,0 an autopilot reports before its first fix. */
const validPos = (lat: number, lon: number) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(Math.abs(lat) < 1e-6 && Math.abs(lon) < 1e-6);

function aircraftElement() {
  const el = document.createElement("div");
  el.className = "ac-marker";
  el.innerHTML = `<svg viewBox="0 0 60 72" aria-hidden="true"><path d="M30 0 L60 72 L30 56 L0 72 Z" /></svg>`;
  return el;
}

/** A map failure (no WebGL2, a MapLibre exception) shows a notice in the map area instead of unmounting the whole UI. */
class MapBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: unknown) { return { error: e instanceof Error ? e.message : String(e) }; }
  componentDidCatch(e: unknown) { console.error("Map failed:", e); }
  render() {
    return this.state.error ? <MapFatal reason={this.state.error} onRetry={() => { this.setState({ error: null }); this.props.onRetry(); }} /> : this.props.children;
  }
}
const MapFatal = ({ reason, onRetry }: { reason: string; onRetry: () => void }) => (
  <div className="map-wrap"><div className="map-fatal" role="alert">MAP UNAVAILABLE<span>{reason}</span>
    <button type="button" className="btn" onClick={onRetry}>Retry map</button></div></div>
);

export function MapView() {
  const [attempt, setAttempt] = useState(0);   // a new attempt remounts the map from scratch
  const retry = () => setAttempt((n) => n + 1);
  return <MapBoundary onRetry={retry}><MapViewInner key={attempt} onRetry={retry} /></MapBoundary>;
}

function MapViewInner({ onRetry }: { onRetry: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const styleReady = useRef(false); // style loaded once; isStyleLoaded() also turns false while tiles load
  const follow = useStore((s) => s.follow);
  const basemap = useStore((s) => s.basemap);
  const offline = useStore((s) => s.offline);
  const online = useStore((s) => s.online);
  const shown = shownBasemap(basemap, offline, online);
  const set = useStore((s) => s.set);
  const hasFix = useStore((s) => s.track.length > 0);
  const windAz = useNum("R3303"), windSpd = useNum("R2813");
  const addingWp = useStore((s) => s.addingWaypoints);
  const [fatal, setFatal] = useState<string | null>(null);
  const [contextLost, setContextLost] = useState(false);
  const [outsideOffline, setOutsideOffline] = useState<"area" | "zoom" | null>(null);
  const lost = useRef(false);                       // WebGL context lost: the style is gone until it is restored
  const applyRef = useRef<() => void>(() => {});    // latest basemap apply(), re-run once a restored style has loaded
  const rescaleRef = useRef<() => void>(() => {});
  // per basemap: tile errors in a row (reset by a loaded tile), and errors since the provider was (re)installed
  const fails = useRef<Record<OnlineBasemap, number>>({ satellite: 0, dark: 0 });
  const errorsSince = useRef<Record<OnlineBasemap, number>>({ satellite: 0, dark: 0 });
  const fitted = useRef<string | null>(null);       // offline file the view was last fitted to

  useEffect(() => {
    let map: MlMap;
    try {
      map = new MlMap({
        container: box.current!, style: STYLE, center: [0, 20], zoom: 1.6,
        attributionControl: { compact: true }, maxPitch: 0, dragRotate: false,
      });
    } catch (e) {
      // typically WebGL2 unavailable: hardware acceleration off, a remote-desktop session, a GPU blocklist
      setFatal((e as Error).message || String(e));
      return;
    }
    mapRef.current = map;
    let restoreT = 0;
    map.on("webglcontextlost", () => { lost.current = true; setContextLost(true); window.clearTimeout(restoreT); });
    map.on("webglcontextrestored", () => {
      // MapLibre rebuilds the style from a snapshot taken at the loss, one frame later, with fresh sources: forget the
      // old errors and re-apply what changed meanwhile once that style has loaded
      errorsSince.current = { satellite: 0, dark: 0 };
      fails.current = { satellite: 0, dark: 0 };
      map.once("style.load", () => { window.clearTimeout(restoreT); lost.current = false; setContextLost(false); applyRef.current(); rescaleRef.current(); });
      // a second loss before that snapshot loaded leaves MapLibre without a style: offer Retry instead of a silent blank
      restoreT = window.setTimeout(() => { if (!map.getStyle()) setFatal("The graphics context came back without the map style."); }, 5000);
    });
    if (import.meta.env.DEV) (window as unknown as { __map: MlMap }).__map = map; // dev inspection only
    // scale bar and overlay line widths follow the root font size (window size and UI-scale setting)
    let rem = remPx();
    let scaleCtl = new ScaleControl({ unit: "metric", maxWidth: Math.round(8 * rem) });
    map.addControl(scaleCtl, "bottom-right");
    const rescaleLayers = () => {
      if (!styleReady.current || !map.getStyle()) return;
      for (const [id, px] of Object.entries(LINE_W)) if (map.getLayer(id)) map.setPaintProperty(id, "line-width", px * rem / 16);
      scaleLabels(map);
    };
    rescaleRef.current = rescaleLayers;
    const applyRem = () => {
      const r = remPx();
      syncPadding(map);
      if (r === rem) return;
      rem = r;
      map.removeControl(scaleCtl);
      scaleCtl = new ScaleControl({ unit: "metric", maxWidth: Math.round(8 * rem) });
      map.addControl(scaleCtl, "bottom-right");
      rescaleLayers();
    };
    map.touchZoomRotate.disableRotation();   // north-up only: there is no compass to reset a rotation
    map.keyboard.disableRotation();
    const marker = new Marker({ element: aircraftElement(), rotationAlignment: "map" });
    let markerOn = false;
    let centred = false;

    map.on("load", () => {
      styleReady.current = true;
      // compact attribution starts expanded (and re-expands on its first resize); collapse it so it does not cover
      // the map. The (i) button still opens it.
      collapseAttribution(map); map.once("resize", () => setTimeout(() => collapseAttribution(map), 0));
      map.addSource("trail", { type: "geojson", data: EMPTY });
      map.addSource("glide", { type: "geojson", data: EMPTY });
      const k = rem / 16;
      map.addLayer({ id: "trail", type: "line", source: "trail", paint: { "line-color": "#5CC8FF", "line-width": LINE_W.trail * k, "line-opacity": 0.55 } });
      map.addLayer({ id: "glide", type: "line", source: "glide", paint: { "line-color": "#E4E8EC", "line-width": LINE_W.glide * k, "line-dasharray": [6, 4], "line-opacity": 0.8 } });
      map.addSource("route", { type: "geojson", data: EMPTY });
      map.addSource("route-lead", { type: "geojson", data: EMPTY });
      map.addLayer({ id: "route-lead", type: "line", source: "route-lead", paint: { "line-color": "#E05BE8", "line-width": LINE_W["route-lead"] * k, "line-dasharray": [3, 3], "line-opacity": 0.6 } });
      map.addLayer({ id: "route", type: "line", source: "route", paint: { "line-color": "#E05BE8", "line-width": LINE_W.route * k } });
      syncRoute();
      addOffline(map, useStore.getState().offline);
      syncPadding(map);
    });
    map.on("dragstart", () => useStore.getState().set({ follow: false }));

    // A provider whose tiles keep failing (blocked, 401/403, rate-limited, server errors) is reported so the next
    // candidate or another basemap takes over. Missing tiles (404) are normal at the edge of coverage and do not count;
    // neither do errors while the browser itself is offline. A source that cannot load at all (its TileJSON failed) is
    // reported at once: MapLibre would not try it again.
    const FAIL_LIMIT = 6;
    const basemapOf = (sid: unknown): OnlineBasemap | null => (sid === SAT ? "satellite" : typeof sid === "string" && sid.startsWith(DARK_PREFIX) ? "dark" : null);
    map.on("error", (e) => {
      const b = basemapOf((e as { sourceId?: unknown }).sourceId);
      if (!b) { console.error(e.error); return; }   // a listener replaces MapLibre's own console report
      const err = e.error as { status?: number; url?: string };
      if (err.status === 404) return;
      errorsSince.current[b]++;   // these tiles need a reload: on the next verdict, when the browser is back online, or a Recheck
      const h = useStore.getState().online[b];
      if (h.state !== "ok" || installedProvider(map, b) !== h.provider.id) return;   // a probe is deciding, or a replaced provider
      if (!err.status && !navigator.onLine) return;                                  // our own connection is down: blame nobody
      const sourceLevel = !(e as { tile?: unknown }).tile;
      if (!sourceLevel && ++fails.current[b] < FAIL_LIMIT) return;
      fails.current[b] = 0;
      let host = "tiles";
      try { if (err.url) host = new URL(err.url).host; } catch { /* keep */ }
      const status = err.status ?? 0;
      markBasemapFailed(b, h.provider.id, status ? `HTTP ${status} from ${host}` : `${host} blocked or unreachable${sourceLevel ? " (tile index)" : ""}`, status >= 400);
    });
    map.on("sourcedata", (e) => { if (e.tile) { const b = basemapOf(e.sourceId); if (b) fails.current[b] = 0; } });
    // MapLibre never retries a failed tile that stays in view (nor a failed TileJSON). When the browser comes back
    // online, reinstall each basemap that had failures and still has an ok verdict; a failed one gets a new verdict from
    // the store's re-probe instead, which reloads it the same way.
    let onlineT = 0;
    const reloadFailed = () => {
      if (lost.current || !map.getStyle()) return;
      const on = useStore.getState().online;
      for (const b of ["satellite", "dark"] as const) {
        const v = verdictOf(on[b]);
        if (!errorsSince.current[b] || v?.state !== "ok" || installedProvider(map, b) !== v.provider.id) continue;
        (b === "satellite" ? satInstalled : darkInstalled).delete(map);
      }
      applyRef.current();
    };
    const onOnline = () => { window.clearTimeout(onlineT); onlineT = window.setTimeout(reloadFailed, 1500); };   // let DNS and routes settle
    window.addEventListener("online", onOnline);
    map.on("click", (e) => { if (useStore.getState().addingWaypoints) addWaypoint(e.lngLat.lat, e.lngLat.lng); });

    // ---- route: waypoint markers (draggable), leg labels, lines ----
    const wpMarkers = new Map<string, Marker>();
    const legMarkers: Marker[] = [];
    const acPos = (): [number, number] | null => {
      const { vars, now } = useStore.getState();
      const la = vars.R501, lo = vars.R500;
      return la && lo && typeof la.v === "number" && typeof lo.v === "number" && isFresh(la, now) ? [lo.v * RAD, la.v * RAD] : null;
    };
    const syncLines = () => {
      if (!styleReady.current) return;
      const { route } = useStore.getState();
      const { line, lead } = routeData(route, acPos());
      (map.getSource("route") as GeoJSONSource | undefined)?.setData(line);
      (map.getSource("route-lead") as GeoJSONSource | undefined)?.setData(lead);
    };
    function syncRoute() {
      const { route, selectedWp } = useStore.getState();
      for (const [id, m] of wpMarkers) if (!route.some((w) => w.id === id)) { m.remove(); wpMarkers.delete(id); }
      route.forEach((w, i) => {
        let m = wpMarkers.get(w.id);
        if (!m) {
          const mk = new Marker({ element: waypointElement(i + 1), draggable: true }).setLngLat([w.lon, w.lat]).addTo(map);
          mk.on("dragend", () => { const p = mk.getLngLat(); moveWaypoint(w.id, p.lat, p.lng); });
          mk.getElement().addEventListener("click", (ev) => { ev.stopPropagation(); useStore.getState().set({ selectedWp: w.id }); });
          wpMarkers.set(w.id, mk);
          m = mk;
        } else m.setLngLat([w.lon, w.lat]);
        const el = m.getElement();
        el.textContent = String(i + 1);
        el.classList.toggle("selected", w.id === selectedWp);
        el.title = `WP ${i + 1} · ${w.lat.toFixed(5)}, ${w.lon.toFixed(5)} · ${w.alt} m AMSL`;
      });
      legMarkers.splice(0).forEach((m) => m.remove());
      for (let i = 1; i < route.length; i++) {
        const a = route[i - 1], b = route[i];
        const el = legElement();
        el.textContent = `${fmtDist(distanceM(a.lat, a.lon, b.lat, b.lon))} · ${fmtBrg(bearingDeg(a.lat, a.lon, b.lat, b.lon))}`;
        legMarkers.push(new Marker({ element: el }).setLngLat([(a.lon + b.lon) / 2, (a.lat + b.lat) / 2]).addTo(map));
      }
      syncLines();
    }
    const unsubRoute = useStore.subscribe((st, prev) => {
      if (st.route !== prev.route || st.selectedWp !== prev.selectedWp) syncRoute();
      // the UI-scale setting changes the root font size without resizing the map box
      if (st.scale !== prev.scale) requestAnimationFrame(applyRem);
      if (st.addingWaypoints !== prev.addingWaypoints) map.getCanvas().style.cursor = st.addingWaypoints ? "crosshair" : "";
    });
    // An offline vector style without its sprite sheet: draw POIs without icons instead of warning for each one.
    map.setMissingStyleImageResolver((id) => { if (!map.hasImage(id)) map.addImage(id, { width: 1, height: 1, data: new Uint8Array(4) }); });

    const update = () => {
      const { vars, track, now, follow } = useStore.getState();
      const la = vars.R501, lo = vars.R500;
      if (!la || !lo || typeof la.v !== "number" || typeof lo.v !== "number") return;
      const lat = la.v * RAD, lon = lo.v * RAD;
      if (!validPos(lat, lon)) return;
      const hdg = vars.R3 && typeof vars.R3.v === "number" ? vars.R3.v * RAD : 0;
      marker.setLngLat([lon, lat]).setRotation(hdg);
      const posFresh = isFresh(la, now) && isFresh(lo, now);
      marker.getElement().classList.toggle("stale", !posFresh);
      if (!markerOn) { marker.addTo(map); markerOn = true; }
      if (!centred) { if (!posFresh) return; map.jumpTo({ center: [lon, lat], zoom: 15 }); centred = true; }
      // follow without fighting the operator: skip while the camera is moving (wheel / button zoom, pinch)
      else if (follow && !map.isMoving()) map.easeTo({ center: [lon, lat], duration: 450, essential: true });
      if (styleReady.current) {   // isStyleLoaded() is false while any tile loads, which would freeze the overlays
        (map.getSource("trail") as GeoJSONSource | undefined)?.setData(track.length >= 2
          ? { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: track } } : EMPTY);
        const aglS = vars.R504;
        const agl = aglS && typeof aglS.v === "number" && isFresh(aglS, now) ? aglS.v : null;
        const phase = useStore.getState().status?.phase;
        const airborne = posFresh && agl !== null && agl > 20 && phase != null && ![0, 9, 13, 20].includes(phase);
        (map.getSource("glide") as GeoJSONSource | undefined)?.setData(airborne ? circle(lon, lat, agl! * GLIDE_RATIO) : EMPTY);
        syncLines();
      }
    };
    const iv = window.setInterval(update, 500);
    const ro = new ResizeObserver(() => { map.resize(); applyRem(); });
    ro.observe(box.current!);
    return () => {
      unsubRoute(); window.clearInterval(iv); ro.disconnect(); window.removeEventListener("online", onOnline); window.clearTimeout(onlineT); window.clearTimeout(restoreT);
      map.remove(); mapRef.current = null; styleReady.current = false;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (lost.current || !map.getStyle()) return;   // re-run from 'webglcontextrestored'
      const sat = verdictOf(online.satellite), dark = verdictOf(online.dark);
      const changed = (b: OnlineBasemap, did: boolean) => { if (did) { fails.current[b] = 0; errorsSince.current[b] = 0; } return did; };
      const a = changed("satellite", ensureSatellite(map, sat, errorsSince.current.satellite > 0));
      const d = changed("dark", ensureDark(map, dark, errorsSince.current.dark > 0));
      if (a || d) { setTimeout(() => collapseAttribution(map), 0); map.once("idle", () => collapseAttribution(map)); }
      addOffline(map, offline);
      // a basemap's layers are drawn while its verdict is ok, or while our own connection is down (the tiles already
      // loaded stay useful); a provider that failed by itself is hidden and gets no more tile requests
      const satOk = sat?.state === "ok" || unreachable(online.satellite), darkOk = dark?.state === "ok" || unreachable(online.dark);
      const vis = (on: boolean) => (on ? "visible" : "none");
      const labels = darkLabels.get(map);
      setLabelPaint(map, shown === "satellite" ? "imagery" : "dark");
      if (map.getLayer(SAT)) map.setLayoutProperty(SAT, "visibility", vis(shown === "satellite" && satOk));
      for (const l of map.getStyle()?.layers ?? []) {
        if (l.id.startsWith(DARK_PREFIX)) map.setLayoutProperty(l.id, "visibility", vis(darkOk && (shown === "dark" || (shown === "satellite" && !!labels?.has(l.id)))));
        else if (l.id.startsWith(OFFLINE_PREFIX)) map.setLayoutProperty(l.id, "visibility", vis(shown === "offline"));
      }
      // no aircraft position yet: show the area the extract covers, once per file (not on every basemap change)
      if (shown === "offline" && offline.state === "ready" && fitted.current !== offline.url) {
        if (useStore.getState().track.length === 0) map.fitBounds(offline.bounds, { padding: Math.round(2.5 * remPx()), duration: 0 });
        fitted.current = offline.url;
      }
    };
    applyRef.current = apply;
    if (styleReady.current) apply(); else map.once("load", apply);
    return () => { map.off("load", apply); };
  }, [shown, offline, online.satellite, online.dark]);

  // Offline extract: say so when the view does not overlap the area it covers (the map would be plain grey).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || shown !== "offline" || offline.state !== "ready") { setOutsideOffline(null); return; }
    const [w, s, e, n] = offline.bounds;
    const check = () => {
      const b = map.getBounds();
      setOutsideOffline(b.getEast() < w || b.getWest() > e || b.getNorth() < s || b.getSouth() > n ? "area" : map.getZoom() < offline.minZoom - 0.5 ? "zoom" : null);
    };
    check();
    map.on("moveend", check);
    return () => { map.off("moveend", check); };
  }, [shown, offline]);

  const recenter = () => {
    const { vars } = useStore.getState();
    const la = vars.R501?.v, lo = vars.R500?.v;
    if (typeof la === "number" && typeof lo === "number") mapRef.current?.easeTo({ center: [lo * RAD, la * RAD], duration: 400 });
    set({ follow: true });
  };

  if (fatal) return <MapFatal reason={fatal} onRetry={onRetry} />;
  const satVerdict = verdictOf(online.satellite);
  return (
    <div className="map-wrap">
      <div ref={box} className="map" />
      <div className="map-tools">
        <button type="button" className={`btn map-btn${follow ? " on" : ""}`} onClick={recenter} disabled={!hasFix} title="Centre on aircraft and follow">
          {follow ? "FOLLOWING" : "FOLLOW"}
        </button>
        <button type="button" className="btn map-btn zoom" onClick={() => mapRef.current?.zoomIn()} aria-label="Zoom in">+</button>
        <button type="button" className="btn map-btn zoom" onClick={() => mapRef.current?.zoomOut()} aria-label="Zoom out">−</button>
        <div className="mt-seg" role="group" aria-label="Basemap">
          {BASEMAPS.map((b) => {
            const h = b.id === "offline" ? null : online[b.id];
            const v = h ? verdictOf(h) : undefined;
            const off = h ? false : offline.state !== "ready";   // a failed online basemap stays clickable: choosing it checks it again
            const failed = v?.state === "failed";
            const title = h ? (v?.state === "ok" ? `Online: ${v.provider.name} (${v.provider.host})` : failed ? `Unavailable: ${v.detail}. Click to check again.`
                : h.state === "idle" ? "Online provider not checked yet (OFFLINE in use): choose to check and use it" : "Checking the online provider…")
              : offline.state === "ready" ? `Offline: ${offline.file}` : offline.state === "none" ? `Offline unavailable: ${offline.hint}` : "Looking for offline tiles";
            return (
              <button key={b.id} type="button" className={`btn map-btn${shown === b.id ? " on" : ""}${failed ? " failed" : ""}`} disabled={off} title={title} onClick={() => chooseBasemap(b.id)}>
                {b.label}
              </button>
            );
          })}
        </div>
        <button type="button" className={`btn map-btn wp-tool${addingWp ? " on-wp" : ""}`} onClick={() => set(addingWp ? { addingWaypoints: false } : { addingWaypoints: true, menu: "plan" })}
          title="Click on the map to add waypoints">{addingWp ? "CLICK MAP · DONE" : "+ WAYPOINT"}</button>
        <div className="wind" title="Wind (R3303 azimuth, R2813 speed)">
          <svg viewBox="0 0 24 24" style={{ transform: `rotate(${windAz === null ? 0 : windAz * RAD + 180}deg)`, opacity: windAz === null ? 0.3 : 1 }} aria-hidden="true">
            <path d="M12 3 L12 21 M12 21 L7 15 M12 21 L17 15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="mono">{fmt(windSpd, 1, "m/s")}</span>
        </div>
        <BasemapNotice chosen={basemap} shown={shown} outsideOffline={outsideOffline} contextLost={contextLost} />
      </div>
      {!hasFix && <div className="map-wait">Waiting for aircraft position…</div>}
      {shown === "satellite" && satVerdict?.state === "ok" && satVerdict.provider.id.startsWith("esri") && <div className="esri-credit">Powered by Esri</div>}
    </div>
  );
}

/** navigator.onLine, kept current. */
function useBrowserOnline() {
  const [on, setOn] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOn(true), down = () => setOn(false);
    window.addEventListener("online", up); window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);
  return on;
}

/** Says when the map is not showing the chosen basemap, or no basemap at all, or a lesser provider or area, and why
 *  (details in the tooltip). It sits on its own row under the map tools. */
function BasemapNotice({ chosen, shown, outsideOffline, contextLost }: { chosen: Basemap; shown: Basemap; outsideOffline: "area" | "zoom" | null; contextLost: boolean }) {
  const offline = useStore((s) => s.offline);
  const online = useStore((s) => s.online);
  const browserOnline = useBrowserOnline();
  const why = (b: Basemap) => {
    if (b === "offline") return offline.state === "none" ? offline.hint : "";
    const v = verdictOf(online[b]);
    return v?.state === "failed" ? v.detail : "";
  };
  const ready = offline.state === "ready";
  const area = ready ? `${offline.file} covers ${offline.bounds.map((v) => v.toFixed(2)).join(", ")} (W, S, E, N), zoom ${offline.minZoom}–${offline.maxZoom}` : "";
  const outside = ready && shown === "offline" && outsideOffline
    ? (outsideOffline === "area" ? "outside its area" : `zoom in to ${offline.minZoom} or closer`) : "";
  const v = shown === "offline" ? undefined : verdictOf(online[shown]);
  const degraded = v?.state === "ok" && v.provider.degraded ? ` (${v.provider.degraded})` : "";
  const offlineHint = ready && shown !== "offline" ? " · OFFLINE map available" : "";
  let text: string | null = null, detail = "";
  if (contextLost) { text = "MAP PAUSED · graphics context lost, restoring…"; detail = "The browser dropped the map's WebGL context (GPU reset or memory pressure). MapLibre restores it automatically."; }
  else if (!browserOnline && shown !== "offline") { text = `NO NETWORK · new map tiles cannot load${offlineHint}`; detail = "The computer reports no network connection. Tiles already loaded stay on the map; the rest load again when it is back."; }
  else if (shown !== "offline" && connectionDown(shown, online)) {
    const sv = verdictOf(online[shown]);
    text = `CONNECTION LOST · ${sv?.state === "failed" && sv.cached ? `${LABEL[shown]} shows only tiles already loaded` : "no map tiles could be loaded"}${offlineHint}`;
    detail = (["satellite", "dark"] as const).map(why).filter(Boolean).join("\n");
  }
  else if (shown === "offline" && offline.state === "loading") text = "Looking for the offline map…";
  else if (!basemapUsable(shown, offline, online)) {
    text = "NO BASEMAP · online providers and offline file unavailable";
    detail = (["satellite", "dark", "offline"] as const).map(why).filter(Boolean).join("\n");
  } else if (shown !== chosen) {
    text = `${chosen !== "offline" && connectionDown(chosen, online) ? "CONNECTION LOST" : `${LABEL[chosen]} unavailable`} · showing ${LABEL[shown]}${degraded}${outside ? ` · ${outside}` : ""}`;
    detail = [why(chosen), v?.state === "ok" ? v.skipped.join("\n") : "", outside ? area : ""].filter(Boolean).join("\n");
  } else if (shown !== "offline" && !v) text = `Loading ${LABEL[shown]} map…`;
  else if (degraded && v?.state === "ok") { text = `${LABEL[shown]}: ${v.provider.degraded} (fallback)`; detail = v.skipped.join("\n"); }
  else if (outside) { text = outsideOffline === "area" ? "Outside the offline map area" : `Offline map: ${outside}`; detail = area; }
  if (!text) return null;
  return <div className="mt-notice"><div className="map-notice" role="status" title={detail || undefined}>{text}</div></div>;
}
