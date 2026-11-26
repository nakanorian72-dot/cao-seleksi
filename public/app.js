import { findStyled, containsStyled, evaluateVideos } from "./checks.js";

const $ = (id) => document.getElementById(id);
let config = null;
let configuredProfileImageUrl = "";
let currentProfile = null;
let currentUsername = "";

function showPage(index) {
  document.querySelectorAll(".page").forEach((page) => page.classList.toggle("active", Number(page.dataset.page) === index));
  $("stepCounter").textContent = `0${index + 1} / 04`;
  $("progressFill").style.width = `${(index + 1) * 25}%`;
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function setStatus(id, message = "", type = "") {
  const el = $(id);
  el.textContent = message;
  el.className = `status ${type}`;
}
function clean(value) { return String(value ?? "").trim(); }
function escapeText(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[char]);
}

/* ---------- Tombol salin ---------- */
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* lanjut ke cara cadangan */ }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
  document.body.appendChild(area);
  area.select();
  area.setSelectionRange(0, text.length);
  let ok = false;
  try { ok = document.execCommand("copy"); } catch { ok = false; }
  area.remove();
  return ok;
}
function renderCopyList(id, values) {
  const box = $(id);
  box.textContent = "";
  const list = Array.isArray(values) ? values.filter(Boolean) : [];
  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "copy-row";
    empty.innerHTML = '<span class="copy-text">Belum diatur admin</span>';
    box.appendChild(empty);
    return;
  }
  for (const value of list) {
    const row = document.createElement("div");
    row.className = "copy-row";
    const text = document.createElement("span");
    text.className = "copy-text";
    text.textContent = value;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "copy-btn";
    button.textContent = "Salin";
    button.setAttribute("aria-label", `Salin ${value}`);
    let timer;
    button.addEventListener("click", async () => {
      const ok = await copyText(value);
      clearTimeout(timer);
      button.classList.toggle("copied", ok);
      button.classList.toggle("failed", !ok);
      button.textContent = ok ? "Tersalin ✓" : "Gagal";
      timer = setTimeout(() => {
        button.classList.remove("copied", "failed");
        button.textContent = "Salin";
      }, 1600);
    });
    row.append(text, button);
    box.appendChild(row);
  }
}

/* ---------- Foto profil ---------- */
// Halaman 1: SELALU dari config.profileImageUrl (tanpa menunggu username).
function setupHomeAvatar() {
  const image = $("profileImage");
  const url = clean(configuredProfileImageUrl);
  image.hidden = true;
  $("profilePlaceholder").hidden = false;
  if (!url) return;
  image.onload = () => { image.hidden = false; $("profilePlaceholder").hidden = true; };
  image.onerror = () => { image.onerror = null; image.hidden = true; $("profilePlaceholder").hidden = false; };
  image.src = url;
}
// Halaman 2-4: dari foto profil TikTok user (API). Jika gagal dimuat, baru memakai foto config.
function apiAvatarOf(profile) {
  const a = profile?.avatar;
  if (typeof a === "string") return a;
  return a?.large || a?.larger || a?.medium || a?.thumb || profile?.avatarLarger || profile?.avatarMedium || profile?.avatarThumb || "";
}
function setTiktokAvatar(image, apiUrl) {
  const primary = clean(apiUrl);
  const fallback = clean(configuredProfileImageUrl);
  const first = primary || fallback;
  image.referrerPolicy = "no-referrer";
  image.onerror = null;
  if (!first) { image.removeAttribute("src"); return; }
  image.onerror = () => {
    image.onerror = null;
    if (fallback && first !== fallback) image.src = fallback;
    else image.removeAttribute("src");
  };
  image.src = first;
}
function renderProfile(profile) {
  const username = profile.username || profile.uniqueId || currentUsername;
  const nickname = clean(profile.nickname) || username;
  const avatarUrl = apiAvatarOf(profile);
  for (const [nameId, userId, imgId] of [
    ["smallNickname", "smallUsername", "smallAvatar"],
    ["verifyNickname", "verifyUsername", "verifyAvatar"],
    ["doneNickname", "doneUsername", "doneAvatar"]
  ]) {
    $(nameId).textContent = nickname;
    $(userId).textContent = `@${username}`;
    setTiktokAvatar($(imgId), avatarUrl);
  }
}

/* ---------- API ---------- */
async function readJsonResponse(response, label) {
  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    const preview = raw.replace(/\s+/g, " ").slice(0, 120);
    throw new Error(`${label}: server mengirim respons bukan JSON (HTTP ${response.status}). ${preview}`);
  }
  if (!response.ok) {
    throw new Error(data?.message || `${label}: permintaan gagal (HTTP ${response.status}).`);
  }
  return data;
}
async function getProfile(username) {
  const response = await fetch("/api/tiktok", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ username }),
    cache: "no-store"
  });
  const data = await readJsonResponse(response, "Pemeriksaan TikTok gagal");
  if (!data.status || !data.data?.profile) {
    throw new Error(data.message || "Akun tidak ditemukan atau API gagal mengambil data.");
  }
  return { ...data.data, serverTime: Number(data.serverTime) || Date.now() };
}
function validConfigList(list) {
  return Array.isArray(list) ? list.map(clean).filter((x) => x && !x.startsWith("ISI_") && !x.includes("HASHTAG_")) : [];
}
function withHash(tag) { return tag.startsWith("#") ? tag : `#${tag}`; }

/* ---------- Hasil verifikasi ---------- */
function paintChecks(rows) {
  $("verifyList").innerHTML = rows.map(({ label, ok, detail }) =>
    `<div class="verify-row"><div class="v-main"><span>${escapeText(label)}</span>${detail ? `<small>${escapeText(detail)}</small>` : ""}</div><b class="${ok ? "pass" : "fail"}">${ok ? "✓ Terpenuhi" : "✕ Belum terpenuhi"}</b></div>`
  ).join("");
}
function waitingRows() {
  return `
    <div class="verify-row"><span>CN pada nickname</span><b>Menunggu</b></div>
    <div class="verify-row"><span>Hashtag pada video terbaru</span><b>Menunggu</b></div>
    <div class="verify-row"><span>Bio TikTok</span><b>Menunggu</b></div>
    <div class="verify-row"><span>Minimal followers</span><b>Menunggu</b></div>`;
}
function evaluateAccount(data) {
  const cnList = validConfigList(config.requiredCN);
  const bioList = validConfigList(config.requiredBio);
  const tagList = validConfigList(config.requiredHashtags);
  const minFollowers = Number(config.minFollowers || 50);
  const minAge = Number(config.minVideoAgeMinutes ?? 60);

  const nickname = clean(data.profile.nickname);
  const bio = clean(data.profile.bio ?? data.profile.signature);
  const followers = Number(data.stats?.followers ?? data.stats?.followerCount ?? 0);

  const cnMatch = findStyled(nickname, cnList);
  const missingBio = bioList.filter((item) => !containsStyled(bio, item));
  const videos = data.videos ?? data.items ?? data.itemList ?? [];
  const tagResult = evaluateVideos(videos, {
    nowMs: data.serverTime,
    minAgeMinutes: minAge,
    requiredHashtags: tagList,
    latestCount: Number(config.latestVideosToCheck || 1)
  });

  return [
    {
      label: "CN pada nickname",
      ok: cnList.length > 0 && Boolean(cnMatch),
      detail: cnMatch ? `Cocok dengan CN: ${cnMatch}` : "Nickname belum memuat salah satu CN yang ditentukan."
    },
    {
      label: "Hashtag pada video terbaru",
      ok: tagResult.ok,
      detail: tagResult.detail
    },
    {
      label: "Bio TikTok",
      ok: bioList.length > 0 && missingBio.length === 0,
      detail: bioList.length === 0
        ? "Teks bio wajib belum diatur admin."
        : missingBio.length === 0
          ? "Bio memuat semua teks wajib."
          : `Bio belum memuat: ${missingBio.join(" · ")}`
    },
    {
      label: `Minimal followers (${minFollowers})`,
      ok: followers >= minFollowers,
      detail: `Followers saat ini: ${followers.toLocaleString("id-ID")}`
    }
  ];
}

/* ---------- Config ---------- */
async function loadConfig() {
  const response = await fetch("/api/config", {
    headers: { "Accept": "application/json" },
    cache: "no-store"
  });
  config = await readJsonResponse(response, "Konfigurasi web gagal dimuat");
  if (!config || typeof config !== "object") {
    throw new Error("Konfigurasi web tidak memiliki format yang benar.");
  }
  configuredProfileImageUrl = clean(config.profileImageUrl);
  setupHomeAvatar();
  renderCopyList("cnList", validConfigList(config.requiredCN));
  renderCopyList("hashtagList", validConfigList(config.requiredHashtags).map(withHash));
  renderCopyList("bioList", validConfigList(config.requiredBio));
  $("gen1Link").href = config.groups?.gen1 || "#";
  $("gen2Link").href = config.groups?.gen2 || "#";
  for (const id of ["gen1Link", "gen2Link"]) {
    const link = $(id);
    if (!/^https:\/\/chat\.whatsapp\.com\//i.test(link.href)) {
      link.removeAttribute("href");
      link.addEventListener("click", (event) => event.preventDefault());
      link.style.opacity = ".5";
    }
  }
}

/* ---------- Halaman 1: cek akun ---------- */
$("checkAccount").addEventListener("click", async () => {
  if (!config) { setStatus("statusOne", "Konfigurasi belum dimuat. Muat ulang halaman.", "error"); return; }
  const username = clean($("username").value).replace(/^@/, "");
  if (!/^[\w.]{2,24}$/.test(username)) {
    setStatus("statusOne", "Masukkan username TikTok yang valid.", "error");
    return;
  }
  const button = $("checkAccount");
  button.disabled = true;
  button.textContent = "Memeriksa akun...";
  setStatus("statusOne", "Mengambil data akun TikTok...");
  try {
    const data = await getProfile(username);
    const profile = data.profile;
    const followers = Number(data.stats?.followers ?? data.stats?.followerCount ?? 0);
    if (profile.privateAccount) throw new Error("Akun TikTok harus bersifat publik.");
    if (followers < Number(config.minFollowers || 50)) {
      throw new Error(`Followers belum memenuhi syarat. Minimal ${config.minFollowers || 50}, akun ini memiliki ${followers}.`);
    }
    currentUsername = username;
    currentProfile = data;
    renderProfile(profile);                       // mengisi halaman 2-4 dari profil TikTok
    $("profileCheck").style.display = "flex";     // halaman 1 tetap memakai foto dari config
    setStatus("statusOne", `Akun ditemukan · ${followers.toLocaleString("id-ID")} followers`, "success");
    setTimeout(() => showPage(1), 650);
  } catch (error) {
    $("profileCheck").style.display = "none";
    setStatus("statusOne", error.message, "error");
  } finally {
    button.disabled = false;
    button.innerHTML = 'Periksa akun <span>↗</span>';
  }
});
$("username").addEventListener("keydown", (event) => {
  if (event.key === "Enter") $("checkAccount").click();
});

/* ---------- Navigasi ---------- */
$("toVerify").addEventListener("click", () => {
  if (!currentProfile) return;
  $("verifyList").innerHTML = waitingRows();
  showPage(2);
  setStatus("statusThree", "Siap melakukan pemeriksaan terbaru.");
});
$("backOne").addEventListener("click", () => showPage(0));
$("backTwo").addEventListener("click", () => showPage(1));

/* ---------- Halaman 3: verifikasi ulang ---------- */
$("runVerify").addEventListener("click", async () => {
  if (!currentUsername) { showPage(0); return; }
  const button = $("runVerify");
  button.disabled = true;
  button.textContent = "Memeriksa data terbaru...";
  setStatus("statusThree", `Mengambil data terbaru @${currentUsername}...`);
  try {
    const data = await getProfile(currentUsername);   // ambil ulang memakai username awal
    currentProfile = data;
    renderProfile(data.profile);
    const rows = evaluateAccount(data);
    paintChecks(rows);
    if (rows.every((row) => row.ok)) {
      setStatus("statusThree", "Semua persyaratan terpenuhi. Mengalihkan ke pilihan generasi...", "success");
      setTimeout(() => showPage(3), 1100);
    } else {
      setStatus("statusThree", "Masih ada persyaratan yang belum terpenuhi. Perbaiki akun lalu verifikasi ulang.", "error");
    }
  } catch (error) {
    setStatus("statusThree", error.message, "error");
  } finally {
    button.disabled = false;
    button.innerHTML = 'Verifikasi sekarang <span>✓</span>';
  }
});

/* ---------- Halaman 4: ulang ---------- */
$("restart").addEventListener("click", () => {
  currentProfile = null;
  currentUsername = "";
  $("username").value = "";
  $("profileCheck").style.display = "none";
  for (const id of ["smallAvatar", "verifyAvatar", "doneAvatar"]) $(id).removeAttribute("src");
  $("verifyList").innerHTML = waitingRows();
  setStatus("statusOne", "");
  showPage(0);
});

loadConfig().catch((error) => {
  setStatus("statusOne", error.message, "error");
});
