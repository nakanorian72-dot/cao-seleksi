import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG } from "./config.js";
import { scrapeTikTok, ScrapeError } from "./lib/tiktok-scrape.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const PORT = Number(process.env.PORT || 3000);
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function send(res, status, data, type = "application/json; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store"
  });
  res.end(typeof data === "string" || Buffer.isBuffer(data) ? data : JSON.stringify(data));
}

async function readBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 2048) throw new Error("Permintaan terlalu besar.");
  }
  return body;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/api/config") {
      return send(res, 200, {
        minFollowers: CONFIG.minFollowers,
        minVideoAgeMinutes: CONFIG.minVideoAgeMinutes,
        latestVideosToCheck: CONFIG.latestVideosToCheck,
        profileImageUrl: CONFIG.profileImageUrl || "",
        requiredCN: CONFIG.requiredCN,
        requiredHashtags: CONFIG.requiredHashtags,
        requiredBio: CONFIG.requiredBio,
        groups: CONFIG.groups
      });
    }

    if (req.method === "POST" && url.pathname === "/api/tiktok") {
      let body;
      try { body = JSON.parse(await readBody(req)); }
      catch { return send(res, 400, { status: false, message: "Format permintaan tidak valid. Kirim JSON berisi username." }); }
      const data = await scrapeTikTok(String(body?.username || ""));
      return send(res, 200, { status: true, data, serverTime: Date.now() });
    }

    if (req.method !== "GET") return send(res, 405, { message: "Method tidak diizinkan." });

    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/") pathname = "/index.html";
    const filePath = path.resolve(PUBLIC_DIR, "." + pathname);
    if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== path.join(PUBLIC_DIR, "index.html")) {
      return send(res, 403, "Forbidden", "text/plain; charset=utf-8");
    }

    try {
      const content = await readFile(filePath);
      return send(res, 200, content, MIME[path.extname(filePath)] || "application/octet-stream");
    } catch {
      return send(res, 404, "File tidak ditemukan.", "text/plain; charset=utf-8");
    }
  } catch (error) {
    const status = error instanceof ScrapeError ? error.status : 500;
    return send(res, status, { status: false, message: error.message || "Terjadi kesalahan server." });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`CREATOR ANIME ONE berjalan di http://localhost:${PORT}`);
});
