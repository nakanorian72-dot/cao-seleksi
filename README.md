# CREATOR ANIME ONE

Website seleksi TikTok 4 halaman. Project menggunakan Node.js 20 dan tidak membutuhkan dependency npm tambahan.

## 1. Pengaturan sebelum dijalankan

### API Key
Untuk lokal, salin `.env.example` menjadi `.env`, lalu isi:

```env
TIKTOK_API_KEY=API_KEY_KAMU
PORT=3000
```

Jangan upload `.env` ke GitHub. File tersebut sudah dimasukkan ke `.gitignore`.

### Persyaratan seleksi dan link grup
Edit `config.js`:
- `profileImageUrl`: URL foto profil yang digunakan bersama pada semua halaman yang menampilkan profil (halaman 1–4). Cukup ubah URL di bagian ini; jangan mengubah URL foto satu per satu di HTML/JavaScript. Isi URL gambar langsung, atau kosongkan `""` agar memakai foto profil dari API TikTok.
- `minFollowers`: minimal followers (default 50).
- `requiredCN`: CN yang diperbolehkan; CN dicocokkan pada nickname TikTok.
- `requiredHashtags`: semua hashtag ini wajib ditemukan pada caption video yang dikembalikan API.
- `requiredBio`: semua teks ini wajib ditemukan pada bio.
- `groups.gen1` dan `groups.gen2`: link undangan grup WhatsApp.

## 2. Menjalankan di komputer / GitHub Codespaces

1. Upload seluruh isi folder project ini ke repository GitHub.
2. Buka repository, pilih **Code → Codespaces → Create codespace**.
3. Pada terminal Codespaces, jalankan:

```bash
cp .env.example .env
```

4. Edit `.env`, isi `TIKTOK_API_KEY`.
5. Jalankan:

```bash
npm start
```

6. Buka tab **Ports**, lalu buka port `3000` (ubah visibility sesuai kebutuhan).

## 3. Deploy ke Vercel

Project ini sudah menyediakan Vercel Serverless Functions pada folder `api/`:
- `api/config.js` melayani `GET /api/config`.
- `api/tiktok.js` melayani `POST /api/tiktok`.
- `vercel.json` mengarahkan halaman dari folder `public/` dan endpoint API ke fungsi yang sesuai.

Langkah deploy:
1. Upload seluruh isi folder project (termasuk folder `api/`, `public/`, `config.js`, dan `vercel.json`) ke repository GitHub.
2. Import repository tersebut di Vercel. Atur **Root Directory** ke folder yang berisi `vercel.json`.
3. Pada **Project Settings → Environment Variables**, tambahkan `TIKTOK_API_KEY` dengan API key layanan TikTok yang digunakan.
4. Deploy atau lakukan **Redeploy** setelah menambahkan environment variable.
5. Uji `https://NAMA-PROJECT.vercel.app/api/config`. Respons yang benar berupa JSON konfigurasi, bukan halaman HTML/404.
6. Uji pemeriksaan TikTok dari halaman utama.

Jangan mengatur `TIKTOK_API_KEY` di `config.js` atau `public/`. Simpan hanya di Environment Variables Vercel. Jika API pihak ketiga mengembalikan HTML/teks, website sekarang menampilkan pesan error yang menjelaskan status respons, bukan gagal dengan pesan parsing JSON yang membingungkan.

## 4. Menjadikan website online dari repository GitHub (Render)

GitHub Pages hanya menyajikan file statis dan tidak dapat menjalankan `server.js` atau menyimpan API Key secara rahasia. Karena website ini membutuhkan backend untuk menyembunyikan API Key, gunakan Render sebagai host aplikasi dan GitHub sebagai repository sumber.

1. Push seluruh project ke repository GitHub.
2. Masuk ke Render dan pilih **New → Blueprint**.
3. Hubungkan repository GitHub yang berisi project ini.
4. Render akan membaca `render.yaml` dan membuat layanan web.
5. Pada Environment, isi `TIKTOK_API_KEY` dengan API Key milikmu.
6. Deploy. Buka URL `.onrender.com` yang diberikan Render.

Render free service dapat tidur setelah tidak aktif dan memerlukan waktu untuk bangun kembali. Ketersediaan paket gratis dapat berubah mengikuti kebijakan Render.

## 5. GitHub Actions

Workflow `.github/workflows/node-check.yml` memeriksa sintaks JavaScript setiap kali ada push atau pull request. Workflow ini bukan hosting website.

## Catatan
- API Key hanya disimpan di environment variable server, bukan di frontend atau repository.
- Akun TikTok harus publik.
- Verifikasi ulang mengambil data terbaru dari API.
- Hashtag hanya diperiksa pada video yang BUKAN pin/sematan dan sudah diunggah minimal `minVideoAgeMinutes` (default 60 menit) yang lalu, dihitung dari waktu upload (field waktu API, atau ID video jika field waktu tidak ada). Video terbaru yang memenuhi syarat itu harus memuat semua hashtag wajib (`latestVideosToCheck`). Jika API hanya mengembalikan sedikit video, hanya video tersebut yang bisa dinilai.
- CN dan bio dicocokkan KETAT: huruf tebal/khusus Unicode berbeda dari huruf biasa. Gunakan tombol Salin lalu tempel apa adanya.
- Foto profil halaman 1 diambil dari `profileImageUrl` di `config.js`; halaman 2-4 memakai foto profil TikTok user.
- API pihak ketiga dapat mengubah endpoint, autentikasi, batas penggunaan, atau format respons.
