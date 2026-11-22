# Panduan Instalasi & Optimasi Beelink T4 Pro (4GB/64GB) — Lubuntu 26.04 Touchscreen Kiosk

Panduan ini disusun khusus untuk menjalankan **Dashboard Monitoring & Kiosk Hybrid Program Studi Teknik Informatika UNISSULA** (7 Slide termasuk **Slide 7: Jadwal Mata Kuliah**) pada **Beelink T4 Pro Mini PC** (Intel Celeron N3350, RAM 4GB, eMMC 64GB) dengan sistem operasi **Lubuntu 26.04 LTS** dan **layar touchscreen**.

---

## 1. Alokasi Sumber Daya & Optimasi Hardware (4GB RAM / 64GB eMMC)

| Komponen | Estimasi RAM | Strategi Optimasi |
| --- | --- | --- |
| Lubuntu 26.04 (LXQt Desktop) | ~400 MB | *Lightweight desktop*, tanpa efek komposit berat, *idleness watcher* dinonaktifkan |
| PostgreSQL Lokal | ~80–120 MB | Profil khusus 4GB (`shared_buffers=256MB`, `effective_cache_size=1GB`, `max_connections=40`) |
| Next.js Standalone (`node server.js`) | ~110–150 MB | *Pre-compiled* di PC pengembang (`output: "standalone"`), batas heap `--max-old-space-size=512` |
| Chromium Touchscreen Kiosk | ~350–450 MB | Akselerasi GPU Intel (`--enable-gpu-rasterization --enable-zero-copy`), cache dipindah ke RAM `/tmp` untuk mengawetkan eMMC 64GB |
| **Total Terpakai** | **~1.0 – 1.2 GB** | **Tersisa ~2.8 GB RAM bebas** untuk interaksi sentuh tanpa *stutter* |

> **Kenapa tidak build di Mini PC?** CPU Intel Celeron N3350 adalah prosesor hemat daya 6W (dual-core). Dengan skema *Pre-compiled Standalone Bundle*, seluruh kompilasi Next.js/TypeScript dilakukan cepat di laptop pengembang (~15 detik), sedangkan T4 Pro hanya menjalankan runtime `node server.js` yang langsung menyala dalam < 1 detik.

---

## 2. Persiapan Awal Lubuntu 26.04 di Beelink T4 Pro

1. Instal **Lubuntu 26.04 LTS (64-bit)** di eMMC 64GB dengan **Auto-login** aktif untuk user lokal (misalnya `lab`).
2. Hubungkan Mini PC ke WiFi/LAN laboratorium dan aktifkan layanan SSH agar pembaruan berikutnya bisa lewat jaringan:
   ```bash
   sudo apt update && sudo apt install -y openssh-server
   sudo systemctl enable --now ssh
   ```
3. Pastikan jam sistem menggunakan zona waktu **WIB (`Asia/Jakarta`)**:
   ```bash
   sudo timedatectl set-timezone Asia/Jakarta
   ```

---

## 3. Instalasi Pertama Kali (Via Flashdisk USB)

### Langkah A — Di PC/Laptop Pengembang (Windows)
Jalankan skrip pengemas *standalone bundle* (ganti `E:` dengan huruf drive flashdisk USB Anda):
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\prepare-t4pro-bundle.ps1 -TargetDrive "E:"
```
Skrip ini akan mem-*build* Next.js `standalone`, menormalisasi `setup-lubuntu.sh` ke format Linux (`LF`), dan menyalinnya ke `E:\t4pro-dashboard`.

### Langkah B — Di Beelink T4 Pro (Lubuntu 26.04)
1. Colokkan flashdisk USB ke Beelink T4 Pro, buka terminal di folder `t4pro-dashboard`, lalu jalankan:
   ```bash
   sudo bash setup-lubuntu.sh
   ```
2. Skrip otomatis akan:
   - Mengatur hostname mDNS `lab-informatika.local`.
   - Memasang PostgreSQL (tuned 4GB), Node.js 20 LTS, driver VA-API GPU Intel, dan Chromium.
   - Memasang paket standalone ke `/opt/dashboard-mahasiswa` serta modul native Linux x86_64 (`@node-rs/argon2` dan `sharp`).
   - Menjalankan seluruh migrasi SQL termasuk tabel `course_schedules` dan mengisi **5 jadwal kuliah dummy awal**.
   - Mengaktifkan service `dashboard-mahasiswa.service` dan autostart **Chromium Touchscreen Kiosk**.
3. Setelah selesai, restart perangkat:
   ```bash
   sudo reboot
   ```

---

## 4. Cara Kerja Mode Kiosk Sentuh Hybrid

- **Mode Tayang Otomatis (Idle Signage)**: Saat tidak ada sentuhan, layar otomatis berganti melalui 7 slide setiap 15 detik (`Ringkasan` → `Lulusan` → `Dosen` → `Publikasi` → `Pengumuman` → `Kotak Saran` → `Jadwal`).
- **Mode Interaktif Sentuh**: Begitu mahasiswa menyentuh layar:
  - Rotasi slide otomatis terjeda (*Mode Interaktif*).
  - Mahasiswa dapat mengetuk tab slide di bagian atas untuk langsung membuka **7. Jadwal** atau **5. Pengumuman**.
  - Di **Slide 7 (Jadwal Kuliah)**, tersedia tombol sentuh cepat ($\ge 44\text{ px}$) untuk memilih **Hari Ini**, **Senin–Sabtu**, serta filter **Ruangan (R106–R308)** dengan status *real-time* (**Sedang Berlangsung**, **Akan Datang**, **Selesai**).
  - Di **Slide 5 (Pengumuman)**, ketuk tombol **"Ketuk untuk baca lengkap"** untuk membuka jendela baca teks penuh.
- **Reset Otomatis 45 Detik**: Jika layar ditinggal tanpa sentuhan selama 45 detik, modal otomatis tertutup, filter kembali ke *Hari Ini / Semua Ruangan*, dan layar kembali memutar rotasi mulai dari Slide 1 (*Ringkasan*).

---

## 5. Pengelolaan Jadwal & Update Lewat WiFi

- **Panel Admin (dari laptop/HP di WiFi yang sama)**:
  - URL Utama: `http://lab-informatika.local:3000/admin`
  - Kelola Jadwal Mata Kuliah: `http://lab-informatika.local:3000/admin/jadwal`
  - Catatan: Data baru yang dibuat oleh `EDITOR` tersimpan sebagai **Draf**; akun `ADMIN` atau `SUPER_ADMIN` dapat memublikasikan jadwal agar langsung muncul di Slide 7 (sinkronisasi latar belakang setiap 60 detik).
- **Update Kode via WiFi (1-Klik dari Windows)**:
  - Klik 2x file [`UPDATE-T4PRO-WIFI.bat`](../UPDATE-T4PRO-WIFI.bat), lalu masukkan hostname (`lab-informatika.local`) dan username Lubuntu Anda.

---

## 6. Kalibrasi Touchscreen & Troubleshooting Lubuntu

- **Cek perangkat touchscreen terbaca di X11**:
  ```bash
  xinput list
  ```
- **Memetakan touchscreen ke output HDMI tertentu (jika layar ganda)**:
  ```bash
  xinput map-to-output "<NAMA_DEVICE_TOUCHSCREEN>" HDMI-1
  ```
- **Cek status layanan & log server**:
  ```bash
  sudo systemctl status dashboard-mahasiswa.service
  journalctl -u dashboard-mahasiswa.service -n 50 --no-pager
  ```
- **Cek penggunaan RAM aktual di T4 Pro**:
  ```bash
  free -h
  ```
