const API_BASE = "https://api.theresav.eu/api/stalk";

function unwrap(payload) {
  let value = payload;
  for (let i = 0; i < 3; i++) {
    if (!value || typeof value !== "object") break;
    if (value.status === false) {
      throw new Error(value.message || value.error || "API TikTok gagal mengambil data.");
    }
    if (value.data && typeof value.data === "object") value = value.data;
    else break;
  }
  return value;
}

async function requestTikTok(path, username, apiKey, params = {}) {
  const url = new URL(`${API_BASE}/${path}`);
  url.searchParams.set("username", username);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "x-apikey": apiKey,
      "Accept": "application/json",
      "User-Agent": "CreatorAnimeOne/1.0"
    },
    signal: AbortSignal.timeout(55000)
  });

  const raw = await response.text();
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error(`API TikTok (${path}) mengirim respons bukan JSON (HTTP ${response.status}).`);
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error("API Key ditolak. Periksa TIKTOK_API_KEY atau kuota API.");
  }
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || `API TikTok gagal (HTTP ${response.status}).`);
  }
  return unwrap(payload);
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeVideo(video = {}) {
  const id = video.id || video.video_id || video.aweme_id || null;
  const desc = video.title || video.description || video.desc || video.caption || "";
  const created = video.created_timestamp ?? video.createTime ?? video.create_time ?? video.timestamp ?? null;
  const stats = video.stats || {};
  return {
    ...video,
    id,
    video_id: id,
    desc,
    description: desc,
    title: desc,
    createTime: numberOrNull(created),
    created_timestamp: numberOrNull(created),
    pinned: Boolean(video.pinned ?? video.isPinned ?? video.is_pinned ?? false),
    views: numberOrNull(video.views ?? stats.play_count ?? video.playCount),
    stats: {
      ...stats,
      play_count: numberOrNull(stats.play_count ?? video.views ?? video.playCount) || 0,
      digg_count: numberOrNull(stats.digg_count) || 0,
      comment_count: numberOrNull(stats.comment_count) || 0,
      share_count: numberOrNull(stats.share_count) || 0
    }
  };
}

export async function getTikTokSelectionData(username, apiKey) {
  // Dua scraper digunakan sesuai fungsinya:
  // tiktok-posts untuk profil/bio dan daftar video embed;
  // cekvt untuk video terbaru yang sudah diurutkan menurut waktu upload,
  // beserta statistik detail hasil pengambilan halaman video.
  const [postsResult, latestResult] = await Promise.allSettled([
    requestTikTok("tiktok-posts", username, apiKey),
    requestTikTok("cekvt", username, apiKey, { count: 8, detail: "true", skip_pinned: "false" })
  ]);

  const posts = postsResult.status === "fulfilled" ? postsResult.value : null;
  const latest = latestResult.status === "fulfilled" ? latestResult.value : null;

  if (!posts && !latest) {
    const reason = latestResult.reason || postsResult.reason;
    throw new Error(reason?.message || "Kedua scraper TikTok gagal mengambil data.");
  }

  const user = posts?.user || {};
  const profileStats = latest?.profile_stats || {};
  const profile = {
    username: user.username || latest?.username || username,
    uniqueId: user.username || latest?.username || username,
    nickname: user.nickname || latest?.nickname || "",
    avatar: user.avatar || latest?.avatar || "",
    bio: user.bio || latest?.bio || "",
    signature: user.bio || latest?.bio || "",
    verified: Boolean(user.verified ?? latest?.verified),
    privateAccount: Boolean(user.private ?? latest?.private),
    followerCount: numberOrNull(user.followers ?? profileStats.followers) || 0,
    followingCount: numberOrNull(user.following ?? profileStats.following) || 0,
    heartCount: numberOrNull(user.likes ?? profileStats.likes) || 0
  };

  // cekvt menyediakan created_timestamp, pin, caption, dan statistik detail.
  // Jika endpoint detail tidak tersedia, gunakan videoList dari endpoint posts.
  const detailedVideos = Array.isArray(latest?.videos) ? latest.videos : [];
  const postVideos = Array.isArray(posts?.videos) ? posts.videos : [];
  const sourceVideos = detailedVideos.length ? detailedVideos : postVideos;
  const videos = sourceVideos.map(normalizeVideo);

  if (!videos.length && !profile.nickname && !profile.bio) {
    throw new Error("Akun tidak ditemukan, privat, atau tidak memiliki data profil yang dapat dibaca.");
  }

  return {
    status: true,
    data: {
      profile,
      stats: {
        followers: profile.followerCount,
        following: profile.followingCount,
        likes: profile.heartCount
      },
      videos,
      totalVideos: posts?.total ?? latest?.total_video_terbaca ?? videos.length,
      latest: latest?.latest ? normalizeVideo(latest.latest) : (videos[0] || null),
      source: [
        posts ? "tiktok-posts" : null,
        latest ? "cekvt" : null
      ].filter(Boolean).join(" + ")
    },
    serverTime: Date.now()
  };
}
  
