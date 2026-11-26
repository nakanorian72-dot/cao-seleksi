// Fungsi murni untuk pemeriksaan syarat seleksi (tanpa DOM, bisa dites di Node).

// ---------- Teks bergaya (CN & bio) ----------
// Pencocokan sengaja KETAT: huruf tebal/fraktur/monospace Unicode dianggap
// karakter berbeda dari huruf biasa. Yang dinormalisasi hanya karakter tak terlihat,
// variation selector (mis. emoji 1️⃣) dan spasi ganda.
export function normalizeStyled(value) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[\u200B-\u200D\u2060\uFEFF\uFE0E\uFE0F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function containsStyled(text, needle) {
  const n = normalizeStyled(needle);
  return n !== "" && normalizeStyled(text).includes(n);
}

export function findStyled(text, candidates) {
  return (Array.isArray(candidates) ? candidates : []).find((item) => containsStyled(text, item));
}

// ---------- Hashtag ----------
export function normalizeTag(tag) {
  return String(tag ?? "").normalize("NFKC").trim().replace(/^#+/, "").toLowerCase();
}

export function captionHashtags(video) {
  const found = new Set();
  const texts = [video?.desc, video?.description, video?.title, video?.caption, video?.text];
  for (const text of texts) {
    if (typeof text !== "string") continue;
    for (const match of text.normalize("NFKC").matchAll(/#([\p{L}\p{N}_]+)/gu)) {
      found.add(match[1].toLowerCase());
    }
  }
  const lists = [video?.hashtags, video?.challenges, video?.textExtra, video?.cha_list, video?.hashtag_list];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const name = typeof item === "string"
        ? item
        : (item?.hashtagName ?? item?.hashtag_name ?? item?.cha_name ?? item?.name ?? item?.title);
      const tag = normalizeTag(name);
      if (tag) found.add(tag);
    }
  }
  return found;
}

// ---------- Info video: pin & waktu upload ----------
const TRUE_VALUES = new Set([true, 1, "1", "true"]);

export function isPinned(video) {
  const flags = [
    video?.isTop, video?.is_top, video?.isPinned, video?.is_pinned,
    video?.pinned, video?.isPinnedItem, video?.is_pinned_item, video?.pin
  ];
  return flags.some((flag) => TRUE_VALUES.has(flag));
}

export function videoId(video) {
  const direct = video?.id ?? video?.video_id ?? video?.videoId ?? video?.aweme_id ?? video?.awemeId;
  if (direct !== undefined && direct !== null && String(direct).trim()) return String(direct).trim();
  for (const value of [video?.url, video?.link, video?.share_url, video?.shareUrl, video?.video_url]) {
    const match = typeof value === "string" ? value.match(/\/video\/(\d{15,})/) : null;
    if (match) return match[1];
  }
  return "";
}

function toMs(raw) {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw === "number" || /^\d+(\.\d+)?$/.test(String(raw).trim())) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n < 1e11 ? n * 1000 : n; // detik -> milidetik
  }
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

const MIN_VALID_MS = Date.UTC(2016, 0, 1);

// Waktu upload: field waktu dari API; jika tidak ada, dibaca dari ID video TikTok
// (31 bit teratas ID video = detik Unix saat video dibuat).
export function uploadMs(video, nowMs = Date.now()) {
  const keys = [
    "createTime", "create_time", "createdAt", "created_at", "timestamp",
    "uploadTime", "upload_time", "publishTime", "publish_time", "postedAt", "posted_at", "time", "date"
  ];
  const sane = (ms) => (ms && ms >= MIN_VALID_MS && ms <= nowMs + 86400000 ? ms : null);
  for (const key of keys) {
    const ms = sane(toMs(video?.[key]));
    if (ms) return ms;
  }
  const id = videoId(video);
  if (/^\d{16,20}$/.test(id)) {
    try {
      const ms = sane(Number(BigInt(id) >> 32n) * 1000);
      if (ms) return ms;
    } catch { /* abaikan */ }
  }
  return null;
}

export function formatAgo(ms) {
  const minutes = Math.max(0, Math.floor(ms / 60000));
  if (minutes < 60) return `${minutes} menit`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} jam`;
  return `${Math.floor(hours / 24)} hari`;
}

// ---------- Evaluasi hashtag pada video terbaru ----------
// Video yang dinilai: BUKAN pin, waktu upload diketahui, dan sudah >= minAgeMinutes lalu.
// Diurutkan dari upload terbaru. Lulus jika salah satu dari `latestCount` video terbaru
// memuat SEMUA hashtag wajib (default: video terbaru saja).
export function evaluateVideos(videos, options) {
  const {
    nowMs = Date.now(),
    minAgeMinutes = 60,
    requiredHashtags = [],
    latestCount = 1
  } = options || {};

  const required = [...new Set((requiredHashtags || []).map(normalizeTag).filter(Boolean))];
  const list = Array.isArray(videos) ? videos : [];
  const stats = { total: list.length, pinned: 0, tooNew: 0, unknownTime: 0, eligible: 0 };

  if (required.length === 0) {
    return { ok: false, detail: "Hashtag wajib belum diatur admin.", stats };
  }
  if (list.length === 0) {
    return { ok: false, detail: "API tidak mengembalikan video untuk akun ini.", stats };
  }

  const minAgeMs = Math.max(0, Number(minAgeMinutes) || 0) * 60000;
  const eligible = [];
  for (const video of list) {
    if (isPinned(video)) { stats.pinned += 1; continue; }
    const ms = uploadMs(video, nowMs);
    if (!ms) { stats.unknownTime += 1; continue; }
    if (nowMs - ms < minAgeMs) { stats.tooNew += 1; continue; }
    eligible.push({ video, ms, tags: captionHashtags(video) });
  }
  stats.eligible = eligible.length;
  eligible.sort((a, b) => b.ms - a.ms);

  if (eligible.length === 0) {
    const parts = [`dari ${stats.total} video: ${stats.pinned} di-pin`, `${stats.tooNew} kurang dari ${minAgeMinutes} menit`];
    if (stats.unknownTime) parts.push(`${stats.unknownTime} tanpa data waktu`);
    return {
      ok: false,
      detail: `Belum ada video non-pin yang diunggah minimal ${minAgeMinutes} menit lalu (${parts.join(", ")}).`,
      stats
    };
  }

  const candidates = eligible.slice(0, Math.max(1, Number(latestCount) || 1));
  const missingOf = (entry) => required.filter((tag) => !entry.tags.has(tag));
  const winner = candidates.find((entry) => missingOf(entry).length === 0);
  if (winner) {
    return {
      ok: true,
      detail: `Video terbaru (diunggah ${formatAgo(nowMs - winner.ms)} lalu) memuat semua hashtag.`,
      stats
    };
  }
  const latest = candidates[0];
  const missing = missingOf(latest).map((tag) => `#${tag}`).join(", ");
  return {
    ok: false,
    detail: `Video terbaru (diunggah ${formatAgo(nowMs - latest.ms)} lalu) belum memuat: ${missing}.`,
    stats
  };
}
