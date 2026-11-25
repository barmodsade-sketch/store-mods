# Barmods Tunnel v2.0 (Liquid Glass Edition)

Pusat kendali web untuk manajemen akun tunnel VPN (`SSH`, `VLESS`, `VMess`, `Trojan`, `Shadowsocks`), katalog pemesanan via WhatsApp dengan keranjang multi-item, studio konversi konfigurasi `Clash / Mihomo YAML` dan `Sing-box JSON` beserta kode QR SVG lokal, pemeriksaan kuota XL/Axis, pengunggah paralel 6 cloud, studio media, asisten teknis AI multi-giliran, serta laboratorium diagnostik jaringan.

## Panduan Upload ke GitHub & Deploy di Vercel

Proyek ini telah disesuaikan khusus agar langsung lolos build dan berjalan mulus di **Vercel** (termasuk paket gratis *Hobby*):

1. **Upload ke Repositori GitHub**:
   - Pastikan Anda mengunggah **isi di dalam folder `barmods-tunnel-main`** ke root repositori GitHub Anda (sehingga `index.html`, `package.json`, `vercel.json`, folder `api/`, `lib/`, `assets/`, `scripts/`, dan `tests/` berada langsung di halaman utama repo, bukan terbungkus satu folder lagi).
   - Tips jika memakai HP/Browser: buka `https://github.dev/username/nama-repo` (ganti `.com` menjadi `.dev`) agar bisa menarik dan mengunggah seluruh folder sekaligus dalam satu commit tanpa perlu membuat subfolder satu per satu.
   - Jangan pernah mengunggah berkas `.env` ke GitHub publik.

2. **Import & Deploy di Vercel**:
   - Buka Dashboard Vercel -> **Add New Project** -> pilih repositori GitHub Anda.
   - Biarkan pengaturan *Build Command* (`npm run build`) dan *Output Directory* (`dist`) mengikuti konfigurasi otomatis dari `vercel.json` (`scripts/build.js` akan memvalidasi kode dan menyusun berkas publik ke `dist/`, sedangkan `api/vpn.js` menjadi satu-satunya Serverless Function).
   - Buka bagian **Environment Variables** di Vercel, lalu tambahkan variabel yang Anda gunakan:
     - `VPS_DOMAIN` (contoh: `sg1.domain-anda.my.id`)
     - `VPS_AUTH` (kunci otorisasi agent VPS port `5888`)
     - `ADMIN_PIN` (PIN rahasia untuk fitur Deploy VPN)
     - `GROQ_API_KEY` (opsional, untuk fitur Asisten Teknis AI)
     - `BOTCAHX_APIKEY` (opsional, untuk YouTube/SSWeb/IQC; fitur Pinterest, TikTok, Config Studio, dan Network Lab tetap aktif tanpa key ini)
     - `KMSP_AUTH` dan `KMSP_API_KEY` (opsional, sebagai mesin cadangan cek kuota XL/Axis jika mesin utama sedang sibuk)
   - Klik **Deploy**.

## Cara Menjalankan Lokal / VPS (Node.js >= 18)

```bash
node server.js
```

Aplikasi aktif di `http://localhost:3000`. Untuk menjalankan pemeriksaan dan pengujian otomatis:

```bash
npm run lint
npm test
```
