// EDIT BAGIAN INI SAJA UNTUK MENGATUR SYARAT SELEKSI DAN LINK GRUP.
// Jangan letakkan API Key di file ini. API Key disimpan di .env.
export const CONFIG = {
  // SATU TEMPAT untuk mengatur foto profil yang ditampilkan pada seluruh halaman.
  // Isi URL gambar langsung (https://...). Kosongkan "" untuk memakai foto profil dari API TikTok.
  profileImageUrl: "https://i.ibb.co/xKFZnbMY/Picture1.jpg",

  minFollowers: 50,

  // Hashtag hanya diperiksa pada video yang BUKAN pin/sematan dan sudah diunggah
  // minimal sekian menit yang lalu (dihitung dari waktu upload).
  minVideoAgeMinutes: 60,

  // Jumlah video terbaru (yang memenuhi syarat di atas) yang diperiksa.
  // 1 = hanya video terbaru yang harus memuat SEMUA hashtag wajib.
  latestVideosToCheck: 1,

  // CN diperiksa pada nickname TikTok (bukan username).
  // Masukkan beberapa pilihan CN jika semuanya diperbolehkan.
  requiredCN: [
    "𝖋𝖙 𝐂𝐀𝐎᭄",
    "𝐂𝐀𝐎",
    "𝑪𝑨𝑶࿐"
  ],

  // Hashtag wajib. Tulis dengan atau tanpa tanda #.
  requiredHashtags: [
    "#creatoranimeone",
    "#caofams"
  ],

  // Teks/kata wajib yang harus ada di bio TikTok.
  requiredBio: [
    "𝐂𝐀𝐎 𝐅𝐀𝐌𝐒",
    "𝐂.𝐀.𝐎1️⃣"
  ],

  // Ganti dengan tautan undangan grup WhatsApp.
  groups: {
    gen1: "https://chat.whatsapp.com/CeeTarnEwJP4cBwvXlzwMI?s=cl&p=a&iam=2",
    gen2: "https://chat.whatsapp.com/KEW2xWBUU3P3LJHwxGvYTX?s=cl&p=a&iam=2"
  }
};
