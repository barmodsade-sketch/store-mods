# DESIGN.md - Barmods Tunnel Design System & Brief

Reading this as: aplikasi pusat kendali tunnel VPN, katalog layanan server, dan diagnostik jaringan untuk teknisi tunnel, pengguna seluler, dan pengelola VPS di Indonesia, dalam bahasa visual Refractive Liquid Glass dua tema (Obsidian Dark & Frosted Pearl Light), dial ENERGY 2 / RHYTHM 3 / MOTION 2.

## Owner Direction & Rule Overrides (R-37)

- **R-10 Override (Disetujui Pemilik Produk)**: Efek permukaan Liquid Glass diterapkan penuh sebagai identitas visual utama pada bilah navigasi, kartu modul kerja, dan dialog interaktif sesuai instruksi eksplisit pemilik ("ubah ui nya jadi liquid glas"). Hierarki kedalaman dijaga melalui tiga tingkat ketebalan kaca (`glass-shell`, `glass-panel`, `glass-inset`) agar bidang utama dan kontrol tetap terbedakan secara jelas.

## Design Brief (9 Fields)

1. **product**: Barmods Tunnel, panel web terpadu untuk manajemen akun tunnel (SSH, VLESS, VMESS, Trojan, Shadowsocks), pemesanan paket via WhatsApp dengan keranjang multi-item, studio konversi konfigurasi V2Ray/Clash/Sing-box beserta QR SVG lokal, cek kuota XL/Axis, pengunggah multi-cloud, pengunduh media, asisten teknis Groq, serta laboratorium diagnostik jaringan (IP/ASN, DNS, SSL/TLS, Subdomain CT, dan uji latensi HTTP).
2. **industry**: Infrastruktur Jaringan, Cloud VPS, dan Utilitas Telekomunikasi.
3. **audience**: Operator server VPN/tunnel Indonesia, pengguna OpenClash/v2rayNG/NekoBox di perangkat seluler maupun desktop, serta pelanggan paket masa aktif dan VPS.
4. **primary_objective**: Memungkinkan pengguna memesan paket, membuat atau mengonversi konfigurasi tunnel siap pakai (termasuk kode QR dan file YAML Clash), serta mendiagnosis kesehatan host/kuota dari satu antarmuka responsif tanpa berpindah aplikasi.
5. **user_outcome**: Pengguna memperoleh konfigurasi tunnel tervalidasi, hasil diagnostik jaringan terukur dalam milidetik, atau ringkasan pesanan WhatsApp terformat dalam hitungan detik di layar ponsel maupun desktop.
6. **information_architecture**: Tata letak ruang kerja berbasis bilah navigasi kiri (dan laci berlabel + bilah bawah cepat di layar seluler) dengan 8 ruang kerja terfokus: (1) Katalog & Keranjang Layanan, (2) Panel Deploy VPN & Vault Akun, (3) Config Studio (Parser URI, Clash YAML, Payload Builder, QR SVG), (4) Network Lab (IP Radar, DNS, SSL, Subdomain, Latency), (5) Cek Kuota XL/Axis, (6) Multi-Cloud Uploader, (7) Media & Web Studio, (8) Asisten Teknis AI, ditambah Palet Perintah (`Ctrl+K`) dan bar telemetri status server nyata di bagian atas.
7. **interactions**: Pencarian cepat `Ctrl+K`, keranjang belanja dengan kalkulasi harga otomatis ke WhatsApp, konversi instan link V2Ray ke YAML Clash/JSON Sing-box, pembuatan QR SVG tanpa koneksi eksternal, drag-and-drop unggah berkas dengan hitung hash SHA-256 lokal, serta kilau spekular kaca yang merespons posisi kursor (otomatis nonaktif saat `prefers-reduced-motion: reduce`).
8. **visual_identity**: Refractive Liquid Glass dengan dua tema fungsional penuh: *Obsidian Refraction* (gelap pekat `#060b16` untuk sesi teknis malam hari) dan *Frosted Pearl* (terang sejuk `#edf2f9` untuk keterbacaan siang hari di luar ruangan). Menggunakan filter pembiasan SVG `feDisplacementMap`, tepi pantulan Fresnel berlapis (`inset` box-shadow atas-kiri terang dan pantulan bawah dingin), serta kontras teks memenuhi standar WCAG AA (>= 4.5:1).
9. **technical_constraints**: Berjalan langsung di Node.js >= 18 (`node server.js`) maupun serverless (`/api/vpn`) tanpa ketergantungan paket eksternal agar bebas kerentanan rantai pasok dan kompatibel di penyimpanan Android/VPS/Linux/Windows/macOS. Tanpa skrip CDN pemblokir render di `<head>`, tanpa emoji pada salinan antarmuka, dan tanpa tanda pisah em/en.

## Three Dials (Liveliness Toolkit)

- **ENERGY: 2 (Balanced)**: Kaca cair refraktif memberi kedalaman optik nyata tanpa mengaburkan keterbacaan data teknis, log konfigurasi, dan angka harga.
- **RHYTHM: 3 (Varied)**: Setiap ruang kerja disusun mengikuti bentuk datanya sendiri (katalog asimetris dengan panel keranjang samping, editor dua kolom untuk Config Studio, matriks alat bertab untuk Network Lab, dan antarmuka percakapan untuk Asisten AI), bukan pengulangan kartu seragam.
- **MOTION: 2 (Transitions & Interactive Sheen)**: Transisi antar-panel cepat (`220ms cubic-bezier(0.22, 1, 0.36, 1)`) dan pantulan cahaya spekular mengikuti pointer untuk memperkuat sifat fisik lensa kaca, berhenti total ketika `prefers-reduced-motion: reduce` aktif.

## Written Rationale Per Decision (R-31)

- **Palet Warna (2 warna inti + 1 aksen)**: Basis netral *Deep Obsidian* (`#060b16`) / *Alabaster Pearl* (`#edf2f9`) dipadukan permukaan *Refractive Slate* dan satu aksen *glacier cyan* (`#0891b2` pada mode terang, `#22d3ee` pada mode gelap) agar indikator aktif dan tombol aksi utama langsung tertangkap mata tanpa polusi warna pelangi.
- **Tipografi**: *Plus Jakarta Sans* dipilih karena keterbacaan tinggi pada label antarmuka berbahasa Indonesia di ukuran kecil seluler, sedangkan *JetBrains Mono* dibatasi khusus untuk payload jaringan, alamat IP, UUID, dan potongan kode konfigurasi agar karakter serupa (`0`/`O`, `1`/`l`) mudah dibedakan.
- **Skala Radius Sudut (R-11)**: Tiga tingkat radius berbeda digunakan untuk membedakan fungsi elemen secara instan: `24px` untuk wadah panel kaca utama, `14px` untuk tombol dan bidang input, serta `8px` untuk label protokol dan blok kode kecil.
- **Bayangan & Tepi Fresnel (R-12)**: Bayangan luar hanya diterapkan pada wadah melayang (laci seluler, palet perintah `Ctrl+K`, dan kartu kaca utama) sementara elemen dalam menggunakan batas tipis `1px` dan `inset` highlight agar hierarki lapisan optik tetap tegas.
- **Ikon Vektor Kustom (R-04)**: Seluruh ikon digambar menggunakan jalur SVG inline yang relevan langsung dengan protokol jaringan, sertifikat kunci, gelombang sinyal, dan penyimpanan awan, tanpa emoji dekoratif dan tanpa pustaka ikon generik.
- **Tema Ganda Gelap & Terang (R-21, R-34)**: Operator jaringan sering bekerja malam hari di terminal gelap sekaligus mengecek kuota di ponsel saat siang terik, sehingga tombol pengalih tema instan disediakan di header dan diuji kontrasnya pada kedua mode.
