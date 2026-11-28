// Scrape TikTok tanpa API key & tanpa dependency npm (Node >= 18).
// Sumber: https://www.tiktok.com/embed/@<user> -> state FRONTITY_CONNECT_STATE
// berisi userInfo (nickname, bio, followers) + videoList (id, desc, playCount).
// Bentuk output sama dengan yang dibaca frontend: { status, data: { profile, stats, videos } }.

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";

export class ScrapeError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = "ScrapeError";
    this.status = status;
  }
}

// Waktu upload TikTok disimpan di 32 bit teratas video ID.
function timestampFromId(id) {
  try {
    const t = Number(BigInt(String(id)) >> 32n);
    return t > 1000000000 && t < 4000000000 ? t : null;
  } catch { return null; }
}

function extractHashtags(text) {
  const seen = new Set();
  const out = [];
  for (const m of String(text || "").matchAll(/#[\p{L}\p{N}_]+/gu)) {
    const key = m[0].toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m[0]);
  }
  return out;
}

// Video sematan (pin, maks 3) ditaruh TikTok di awal daftar, sisanya urut terbaru -> terlama.
// Deretan kronologis = suffix terpanjang yang timestamp-nya menurun; sisa di depannya = pin.
function markPinned(videos) {
  const ts = videos.map((v) => timestampFromId(v.id) || 0);
  let firstChrono = videos.length ? videos.length - 1 : 0;
  while (firstChrono > 0 && ts[firstChrono - 1] > ts[firstChrono]) firstChrono--;
  return videos.map((v, i) => ({ v, ts: ts[i], pinned: i < firstChrono }));
}

async function fetchEmbedState(username) {
  let res;
  try {
    res = await fetch(`https://www.tiktok.com/embed/@${encodeURIComponent(username)}`, {
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.tiktok.com/"
      },
      signal: AbortSignal.timeout(20000)
    });
  } catch (e) {
    if (e?.name === "TimeoutError") throw new ScrapeError("TikTok terlalu lama merespons. Coba lagi.", 504);
    throw new ScrapeError(`Gagal menghubungi TikTok: ${e.message}`);
  }
  if (res.status === 404 || res.status === 400) throw new ScrapeError(`Akun @${username} tidak ditemukan.`, 404);
  if (!res.ok) throw new ScrapeError(`TikTok membalas status ${res.status}.`);

  const html = await res.text();
  const m = html.match(/<script id="FRONTITY_CONNECT_STATE"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new ScrapeError("Struktur halaman TikTok berubah, data tidak bisa dibaca.");

  let state;
  try { state = JSON.parse(m[1]); }
  catch { throw new ScrapeError("Data TikTok tidak bisa di-parse."); }

  const bucket = state?.source?.data || {};
  const key = Object.keys(bucket).find((k) => k.toLowerCase() === `/embed/@${username}`.toLowerCase())
    || Object.keys(bucket).find((k) => k.startsWith("/embed/"));
  const node = key ? bucket[key] : null;
  if (!node?.userInfo?.uniqueId) throw new ScrapeError(`Akun @${username} tidak ditemukan atau disembunyikan.`, 404);
  return node;
}

export async function scrapeTikTok(rawUsername) {
  const username = String(rawUsername || "").trim().replace(/^@+/, "");
  if (!/^[\w.]{2,24}$/.test(username)) throw new ScrapeError("Username TikTok tidak valid.", 400);

  const node = await fetchEmbedState(username);
  const u = node.userInfo;
  const list = Array.isArray(node.videoList) ? node.videoList : [];

  const videos = markPinned(list).map(({ v, ts, pinned }) => {
    const desc = v.desc || "";
    return {
      id: v.id || null,
      desc,
      hashtags: extractHashtags(desc),
      createTime: ts || null,
      pinned,
      url: v.id ? `https://www.tiktok.com/@${u.uniqueId}/video/${v.id}` : null,
      cover: v.coverUrl || null,
      play: v.playAddr || null,
      playCount: v.playCount ?? null,
      private: !!v.privateItem
    };
  });

  return {
    profile: {
      username: u.uniqueId,
      nickname: u.nickname || "",
      bio: u.signature || "",
      avatar: u.avatarThumbUrl || "",
      verified: !!u.verified,
      privateAccount: !!u.privateAccount
    },
    stats: {
      followers: Number(u.followerCount) || 0,
      following: Number(u.followingCount) || 0,
      likes: Number(u.heartCount) || 0
    },
    videos
  };
                       }
