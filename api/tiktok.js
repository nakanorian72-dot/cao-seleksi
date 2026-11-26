const API_URL = "https://api.theresav.eu/api/stalk/tiktok";

function send(res, status, payload) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.end(JSON.stringify(payload));
}

function readUsername(req) {
  // Vercel biasanya sudah mem-parse JSON body menjadi object.
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); }
    catch { throw new Error("Format permintaan tidak valid. Kirim JSON berisi username."); }
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
    // trim() menghapus spasi/enter yang sering ikut tertempel saat copy-paste key.
    const apiKey = String(process.env.TIKTOK_API_KEY || "").trim();
    if (!apiKey) {
      return send(res, 500, {
        status: false,
        message: "API Key belum diatur. Tambahkan TIKTOK_API_KEY pada Environment Variables Vercel."
      });
    }

    const username = readUsername(req);
    if (!/^[\w.]{2,24}$/.test(username)) {
      return send(res, 400, { status: false, message: "Username TikTok tidak valid." });
    }

    const endpoint = new URL(API_URL);
    endpoint.searchParams.set("username", username);

    const upstream = await fetch(endpoint, {
      method: "GET",
      headers: { "x-apikey": apiKey, "Accept": "application/json" },
      signal: AbortSignal.timeout(25000)
    });

    const raw = await upstream.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      const preview = raw.replace(/\s+/g, " ").slice(0, 140);
      return send(res, 502, {
        status: false,
        message: `Layanan API TikTok mengembalikan respons bukan JSON (HTTP ${upstream.status}). ${preview || "Respons kosong."}`
      });
    }

    if (upstream.status === 401 || upstream.status === 403) {
      return send(res, 502, {
        status: false,
        message: "API Key ditolak oleh layanan TikTok (HTTP " + upstream.status + "). Periksa kembali nilai TIKTOK_API_KEY atau masa aktif/kuota key."
      });
    }

    if (!upstream.ok) {
      const message = data?.message || data?.error || `Layanan API TikTok gagal (HTTP ${upstream.status}).`;
      return send(res, 502, { status: false, message: String(message) });
    }

    // serverTime dipakai frontend untuk menghitung umur video (tidak bergantung jam HP user).
    const payload = data && typeof data === "object" && !Array.isArray(data)
      ? { ...data, serverTime: Date.now() }
      : data;
    return send(res, 200, payload);
  } catch (error) {
    const message = error?.name === "TimeoutError"
      ? "API TikTok terlalu lama merespons. Coba lagi."
      : error?.message || "Terjadi kesalahan saat menghubungi API TikTok.";
    return send(res, 500, { status: false, message });
  }
}
