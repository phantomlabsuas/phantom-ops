import { copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { pipeline } from "node:stream";
import { defineConfig, type Connect, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// The UI talks to the bridge through /ws on the same origin (proxied to the bridge's WebSocket port).
const bridge = { "/ws": { target: "ws://127.0.0.1:8787", ws: true } };

// MapLibre 6 runs its tile work in a module worker. Served through Vite's transform pipeline the worker gets a
// "/@vite/client" import injected and fails to start, so it is copied to public/ and served as a plain static file.
function maplibreWorker(): Plugin {
  return {
    name: "maplibre-worker",
    buildStart() {
      mkdirSync("public/vendor", { recursive: true });
      copyFileSync("node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", "public/vendor/maplibre-gl-worker.mjs");
    },
  };
}

// Offline basemap: the folder `map.offlineDir` of the bridge config (absolute, or relative to app/) is served read-only
// at /offline/ with HTTP byte ranges, which PMTiles needs. It lives in the web server rather than the bridge so that
// `vite` and `vite preview` both serve it. /offline/index.json tells the UI which archive to use; the config and the
// folder are read on every request, so a new extract needs a page reload, not a restart.
export interface OfflineIndex { dir: string; file: string | null; files: string[]; sprite: boolean; hint: string }

const TYPES: Record<string, string> = { ".pmtiles": "application/octet-stream", ".json": "application/json", ".png": "image/png" };

function offlineTiles(): Plugin {
  let root = process.cwd();
  const index = (): OfflineIndex => {
    const none = (dir: string, hint: string): OfflineIndex => ({ dir, file: null, files: [], sprite: false, hint });
    let map: { offlineDir?: string; offlineFile?: string } | undefined;
    try {
      map = JSON.parse(readFileSync(process.env.PHOPS_CONFIG ?? join(root, "config/bridge.config.json"), "utf-8")).map;
    } catch (e) {
      return none("", `bridge config not readable: ${(e as Error).message}`);
    }
    if (!map?.offlineDir) return none("", "No offline folder configured: set map.offlineDir in config/bridge.config.json.");
    const dir = resolve(root, map.offlineDir);
    if (!existsSync(dir)) return none(dir, `Offline folder ${dir} does not exist.`);
    const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".pmtiles")).sort();
    const file = map.offlineFile ? (files.includes(map.offlineFile) ? map.offlineFile : null) : (files[0] ?? null);
    const hint = file ? "" : map.offlineFile ? `${map.offlineFile} (map.offlineFile) is not in ${dir}.` : `No .pmtiles file in ${dir}.`;
    return { dir, file, files, sprite: existsSync(join(dir, "sprites/v4/dark.json")), hint };
  };

  const serve: Connect.NextHandleFunction = (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    if (path === "/index.json") {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      return res.end(JSON.stringify(index()));
    }
    const { dir } = index();
    const file = dir ? resolve(dir, "." + path) : "";
    const rel = dir ? relative(dir, file) : "..";
    if (rel.startsWith("..") || isAbsolute(rel) || !existsSync(file) || !statSync(file).isFile()) { res.statusCode = 404; return res.end(); }

    const { size, mtimeMs } = statSync(file);
    res.setHeader("Content-Type", TYPES[extname(file).toLowerCase()] ?? "application/octet-stream");
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("ETag", `"${size.toString(16)}-${Math.floor(mtimeMs).toString(16)}"`);
    res.setHeader("Cache-Control", "no-cache");
    let start = 0, end = size - 1;
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
    if (req.headers.range) {
      if (range && range[1]) { start = Number(range[1]); if (range[2]) end = Math.min(Number(range[2]), size - 1); }
      else if (range && range[2]) start = Math.max(0, size - Number(range[2]));
      if (!range || start > end) { res.statusCode = 416; res.setHeader("Content-Range", `bytes */${size}`); return res.end(); }
      res.statusCode = 206;
      res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
    }
    res.setHeader("Content-Length", String(end - start + 1));
    if (req.method === "HEAD" || size === 0) return res.end();
    // pipeline() destroys the file stream when the client aborts (PMTiles cancels many range requests while panning)
    pipeline(createReadStream(file, { start, end }), res, () => { /* aborted or finished */ });
  };

  return {
    name: "offline-tiles",
    configResolved(c) { root = c.root; },
    configureServer(server) { server.middlewares.use("/offline", serve); },
    configurePreviewServer(server) { server.middlewares.use("/offline", serve); },
  };
}

export default defineConfig({
  plugins: [react(), maplibreWorker(), offlineTiles()],
  // strictPort: the bridge only accepts this origin, so fail loudly instead of silently moving to another port
  server: { host: "127.0.0.1", port: 5173, strictPort: true, proxy: bridge },
  preview: { host: "127.0.0.1", port: 5173, strictPort: true, proxy: bridge },
});
