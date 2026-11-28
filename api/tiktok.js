import { scrapeTikTok, ScrapeError } from "../lib/tiktok-scrape.js";

function send(res, status, payload) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.end(JSON.stringify(payload));
}

function readUsername(req) {
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); }
    catch { throw new ScrapeError("Format permintaan tidak valid. Kirim JSON berisi username.", 400); }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) body = {};
  return String(body.username || "").trim().replace(/^@/, "");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { status: false, message: "Method tidak diizinkan." });
  }
  try {
    const data = await scrapeTikTok(readUsername(req));
    // serverTime dipakai frontend untuk menghitung umur video (tidak bergantung jam HP user).
    return send(res, 200, { status: true, data, serverTime: Date.now() });
  } catch (error) {
    const status = error instanceof ScrapeError ? error.status : 500;
    return send(res, status, { status: false, message: error?.message || "Terjadi kesalahan saat mengambil data TikTok." });
  }
}
