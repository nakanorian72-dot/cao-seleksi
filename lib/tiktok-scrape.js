// Scrape TikTok tanpa API key & tanpa dependency npm (Node >= 18).
// Berlapis, supaya tetap jalan walau salah satu sumber diblokir TikTok:
//   1. Halaman embed  /embed/@user   -> profil + daftar video (+caption/hashtag)
//   2. Halaman profil /@user         -> profil (nickname, bio, followers) + ID video
//   3. oEmbed per video              -> caption/hashtag, dipakai jika daftar video dari embed kosong
// Output: { profile, stats, videos, source } — dibaca langsung oleh frontend.

const UA_DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";
const PAGE_TIMEOUT = 6000;   // Vercel Hobby membatasi fungsi ~10 detik, jadi semua dibuat paralel & singkat.
const OEMBED_TIMEOUT = 5000;
const MAX_VIDEOS = 8;

export class ScrapeError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = "ScrapeError";
    this.status = status;
  }
}

/* ─── Util ───────────────────────────────────────────────────────────────── */

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

// Video sematan (pin, maks 3) ada di awal daftar, sisanya urut terbaru -> terlama.
function markPinned(items) {
  const ts = items.map((v) => timestampFromId(v.id) || 0);
  let firstChrono = items.length ? items.length - 1 : 0;
  while (firstChrono > 0 && ts[firstChrono - 1] > ts[firstChrono]) firstChrono--;
  return items.map((v, i) => ({ ...v, ts: ts[i], pinned: i < firstChrono }));
}

async function getText(url, { timeout = PAGE_TIMEOUT, accept = "text/html,application/xhtml+xml" } = {}) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA_DESKTOP,
      "Accept": accept,
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://www.tiktok.com/"
    },
    redirect: "follow",
    signal: AbortSignal.timeout(timeout)
  });
  return { status: res.status, text: await res.text() };
}

function blockedHint(html) {
  return /captcha|verify to continue|just a moment|cf-chl|access denied|px-captcha|waf/i.test(html || "");
}

function scriptJson(html, idPattern) {
  const re = new RegExp(`<script[^>]*id="${idPattern}"[^>]*>([\\s\\S]*?)<\\/script>`, "i");
  const m = html.match(re);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

/* ─── Sumber 1: halaman embed ────────────────────────────────────────────── */

async function fromEmbed(username) {
  const { status, text } = await getText(`https://www.tiktok.com/embed/@${encodeURIComponent(username)}`);
  const info = { name: "embed", status, blocked: blockedHint(text), notFound: status === 404 || status === 400 };
  if (status !== 200) return { info };

  const state = scriptJson(text, "[^\"]*FRONTITY_CONNECT_STATE[^\"]*");
  if (!state) return { info };

  const bucket = state?.source?.data || {};
  const key = Object.keys(bucket).find((k) => k.toLowerCase() === `/embed/@${username}`.toLowerCase())
    || Object.keys(bucket).find((k) => k.startsWith("/embed/"));
  const node = key ? bucket[key] : null;
  const u = node?.userInfo;
  if (!u?.uniqueId) return { info: { ...info, notFound: true } };

  return {
    info: { ...info, ok: true },
    user: {
      username: u.uniqueId,
      nickname: u.nickname || "",
      bio: u.signature || "",
      avatar: u.avatarThumbUrl || "",
      verified: !!u.verified,
      privateAccount: !!u.privateAccount,
      followers: Number(u.followerCount) || 0,
      following: Number(u.followingCount) || 0,
      likes: Number(u.heartCount) || 0
    },
    videos: (Array.isArray(node.videoList) ? node.videoList : []).map((v) => ({
      id: v.id, desc: v.desc || "", cover: v.coverUrl || null, play: v.playAddr || null,
      playCount: v.playCount ?? null, private: !!v.privateItem
    }))
  };
}

/* ─── Sumber 2: halaman profil ───────────────────────────────────────────── */

async function fromProfilePage(username) {
  const { status, text } = await getText(`https://www.tiktok.com/@${encodeURIComponent(username)}`);
  const info = { name: "profil", status, blocked: blockedHint(text), notFound: status === 404 };
  if (status !== 200) return { info };

  // ID video yang tampil di HTML (urutan kemunculan = urutan profil, pin di depan).
  const ids = [...new Set([...text.matchAll(/\/video\/(\d{15,20})/g)].map((m) => m[1]))];

  const data = scriptJson(text, "__UNIVERSAL_DATA_FOR_REHYDRATION__");
  const detail = data?.__DEFAULT_SCOPE__?.["webapp.user-detail"] ?? data?.DEFAULT_SCOPE?.["webapp.user-detail"];
  const u = detail?.userInfo?.user;
  const st = detail?.userInfo?.stats || detail?.userInfo?.statsV2 || {};
  if (!u?.uniqueId) {
    const gone = detail && Number(detail.statusCode) && Number(detail.statusCode) !== 0;
    return { info: { ...info, notFound: !!gone }, ids };
  }

  return {
    info: { ...info, ok: true },
    ids,
    user: {
      username: u.uniqueId,
      nickname: u.nickname || "",
      bio: u.signature || "",
      avatar: u.avatarLarger || u.avatarMedium || u.avatarThumb || "",
      verified: !!u.verified,
      privateAccount: !!u.privateAccount,
      followers: Number(st.followerCount) || 0,
      following: Number(st.followingCount) || 0,
      likes: Number(st.heartCount) || 0
    }
  };
}

/* ─── Sumber 3: oEmbed per video (caption + hashtag) ─────────────────────── */

async function oembedCaption(username, id) {
  try {
    const url = `https://www.tiktok.com/oembed?url=${encodeURIComponent(`https://www.tiktok.com/@${username}/video/${id}`)}`;
    const { status, text } = await getText(url, { timeout: OEMBED_TIMEOUT, accept: "application/json" });
    if (status !== 200) return null;
    const j = JSON.parse(text);
    return { desc: String(j.title || ""), cover: j.thumbnail_url || null };
  } catch { return null; }
}

/* ─── Gabungan ───────────────────────────────────────────────────────────── */

export async function scrapeTikTok(rawUsername) {
  const username = String(rawUsername || "").trim().replace(/^@+/, "");
  if (!/^[\w.]{2,24}$/.test(username)) throw new ScrapeError("Username TikTok tidak valid.", 400);

  const settled = await Promise.allSettled([fromEmbed(username), fromProfilePage(username)]);
  const embed = settled[0].status === "fulfilled" ? settled[0].value : { info: { name: "embed", error: settled[0].reason?.message } };
  const prof  = settled[1].status === "fulfilled" ? settled[1].value : { info: { name: "profil", error: settled[1].reason?.message } };

  const user = embed.user || prof.user;
  if (!user) {
    console.error("[tiktok-scrape] gagal:", JSON.stringify({ username, embed: embed.info, profil: prof.info }));
    if (embed.info.notFound || prof.info.notFound) throw new ScrapeError(`Akun @${username} tidak ditemukan.`, 404);
    const blocked = embed.info.blocked || prof.info.blocked || [embed.info.status, prof.info.status].some((s) => s === 403 || s === 429);
    if (blocked) throw new ScrapeError("TikTok memblokir server (anti-bot/captcha). Coba lagi beberapa saat.", 502);
    if (embed.info.error || prof.info.error) throw new ScrapeError(`Gagal menghubungi TikTok: ${embed.info.error || prof.info.error}`, 502);
    throw new ScrapeError(`TikTok mengirim halaman tak terduga (embed HTTP ${embed.info.status}, profil HTTP ${prof.info.status}).`, 502);
  }

  // Daftar video: embed dulu; kalau kosong, pakai ID dari halaman profil + oEmbed.
  let videos = [];
  let source = embed.user ? "embed" : "profil";
  if (embed.videos?.length) {
    videos = markPinned(embed.videos).map((v) => ({ ...v, hashtags: extractHashtags(v.desc) }));
  } else if (prof.ids?.length) {
    const marked = markPinned(prof.ids.slice(0, 24).map((id) => ({ id })));
    // Hanya video non-pin terbaru yang perlu caption; pin tetap disertakan agar ditandai.
    const byNewest = [...marked].sort((a, b) => b.ts - a.ts).slice(0, MAX_VIDEOS);
    const caps = await Promise.all(byNewest.map((v) => oembedCaption(username, v.id)));
    videos = byNewest.map((v, i) => ({
      id: v.id,
      desc: caps[i]?.desc || "",
      cover: caps[i]?.cover || null,
      play: null,
      playCount: null,
      private: false,
      ts: v.ts,
      pinned: v.pinned,
      hashtags: extractHashtags(caps[i]?.desc || "")
    }));
    source += "+oembed";
  }

  const out = videos.map((v) => ({
    id: v.id || null,
    desc: v.desc,
    hashtags: v.hashtags,
    createTime: v.ts || timestampFromId(v.id),
    pinned: !!v.pinned,
    url: v.id ? `https://www.tiktok.com/@${user.username}/video/${v.id}` : null,
    cover: v.cover,
    play: v.play,
    playCount: v.playCount,
    private: !!v.private
  }));

  return {
    profile: {
      username: user.username,
      nickname: user.nickname,
      bio: user.bio,
      avatar: user.avatar,
      verified: user.verified,
      privateAccount: user.privateAccount
    },
    stats: { followers: user.followers, following: user.following, likes: user.likes },
    videos: out,
    source
  };
      }
