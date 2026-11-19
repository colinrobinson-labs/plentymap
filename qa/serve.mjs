// Static server for the built site folder, with byte ranges (the map reads its tiles file in ranges).
// Usage: node qa/serve.mjs <dir> [port]
import { createServer } from "node:http";
import { stat, readFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { join, extname, normalize, resolve } from "node:path";
const root = resolve(process.argv[2] || "_site") + "/", port = +process.argv[3] || 4173;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".woff2": "font/woff2", ".pbf": "application/x-protobuf", ".pmtiles": "application/octet-stream", ".txt": "text/plain", ".xml": "application/xml" };
createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const f = normalize(join(root, p));
  if (!f.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    const s = await stat(f);
    if (s.isDirectory()) { res.writeHead(301, { Location: p + "/" }).end(); return; }
    const h = { "Content-Type": TYPES[extname(f)] || "application/octet-stream", "Accept-Ranges": "bytes", "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" };
    const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || "");
    if (m) {
      const a = +m[1], b = m[2] ? Math.min(+m[2], s.size - 1) : s.size - 1;
      res.writeHead(206, { ...h, "Content-Range": `bytes ${a}-${b}/${s.size}`, "Content-Length": b - a + 1 });
      createReadStream(f, { start: a, end: b }).pipe(res);
    } else if (req.method === "HEAD") { res.writeHead(200, { ...h, "Content-Length": s.size }).end(); }
    else { res.writeHead(200, { ...h, "Content-Length": s.size }); res.end(await readFile(f)); }
  } catch {
    // like GitHub Pages / Cloudflare Pages: unknown paths get the 404 page
    try { res.writeHead(404, { "Content-Type": TYPES[".html"] }); res.end(await readFile(join(root, "404.html"))); } catch { res.writeHead(404).end("not found"); }
  }
}).listen(port, () => console.log(`serving ${root} at http://localhost:${port}/`));
