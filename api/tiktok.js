import { getTikTokSelectionData } from "../lib/tiktok.js";

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
    catch { throw new Error("Format permintaan tidak valid. Kirim JSON berisi username."); }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) body = {};
  return String(body.username || body.user || "").trim().replace(/^@+/, "");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { status: false, message: "Method tidak diizinkan." });
  }

  try {
    const apiKey = String(process.env.TIKTOK_API_KEY || "").trim();
    if (!apiKey) {
      return send(res, 500, {
        status: false,
        message: "API Key belum diatur. Tambahkan TIKTOK_API_KEY pada Environment Variables Vercel."
      });
    }

    const username = readUsername(req);
    if (!/^[A-Za-z0-9._]{2,24}$/.test(username)) {
      return send(res, 400, { status: false, message: "Username TikTok tidak valid." });
    }

    const result = await getTikTokSelectionData(username, apiKey);
    return send(res, 200, result);
  } catch (error) {
    const timeout = error?.name === "TimeoutError" || error?.name === "AbortError";
    return send(res, timeout ? 504 : 502, {
      status: false,
      message: timeout ? "API TikTok terlalu lama merespons. Coba lagi." : (error?.message || "Gagal mengambil data TikTok.")
    });
  }
}
