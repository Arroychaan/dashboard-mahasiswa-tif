# Dashboard Monitoring Laboratorium Informatika — UNISSULA

Aplikasi ini memiliki **2 bagian utama**:
1. **Layar Publik / TV Laboratorium (`http://localhost:3000/`)**: Menampilkan statistik lulusan, profil dosen, dan publikasi ilmiah secara otomatis bergantian (*slideshow*) tanpa perlu login.
2. **Panel Admin (`http://localhost:3000/admin`)**: Halaman khusus pengelola laboratorium untuk menambah, mengedit, dan menerbitkan (*publish*) data lulusan, dosen, publikasi, serta mengelola akun pengguna.

Panduan di bawah ini ditulis langkah demi langkah agar siapa pun—termasuk yang baru pertama kali menjalankan proyek web—bisa langsung menjalankannya dari awal sampai berhasil.

---

## Daftar Isi
1. [Apa Saja yang Perlu Disiapkan (Diinstal) di Komputer?](#1-apa-saja-yang-perlu-disiapkan-diinstal-di-komputer)
2. [Langkah 1: Mengatur File Konfigurasi (`.env`)](#2-langkah-1-mengatur-file-konfigurasi-env)
3. [Langkah 2: Menginstal Paket Aplikasi](#3-langkah-2-menginstal-paket-aplikasi)
4. [Langkah 3: Menyalakan Database PostgreSQL](#4-langkah-3-menyalakan-database-postgresql)
5. [Langkah 4: Membuat Tabel Database (Migrasi)](#5-langkah-4-membuat-tabel-database-migrasi)
6. [Langkah 5: Membuat Akun Super Admin Pertama](#6-langkah-5-membuat-akun-super-admin-pertama)
7. [Langkah 6: Menjalankan Aplikasi](#7-langkah-6-menjalankan-aplikasi)
8. [Cara Menggunakan Aplikasi Pertama Kali](#8-cara-menggunakan-aplikasi-pertama-kali)
9. [Tanya Jawab / Mengatasi Masalah Umum (Troubleshooting)](#9-tanya-jawab--mengatasi-masalah-umum-troubleshooting)

---

## 1. Apa Saja yang Perlu Disiapkan (Diinstal) di Komputer?

Sebelum mulai, pastikan 3 aplikasi gratis ini sudah terpasang di komputer Anda:

### A. Node.js (Versi 20 atau lebih baru)
- **Fungsi**: Mesin untuk menjalankan kode aplikasi ini.
- **Cara pasang**: Unduh dari [https://nodejs.org](https://nodejs.org) (pilih versi **LTS**), lalu instal seperti biasa (*Next -> Next -> Finish*).
- **Cara cek sudah terpasang**: Buka **PowerShell** atau **Command Prompt (CMD)**, ketik:
  ```powershell
  node -v
  ```
  Jika muncul tulisan seperti `v20.x.x` atau `v22.x.x`, berarti sudah siap.

### B. pnpm (Pengelola Paket)
- **Fungsi**: Alat untuk mengunduh komponen pendukung aplikasi ini.
- **Cara pasang**: Buka PowerShell/CMD, lalu ketik perintah ini dan tekan Enter:
  ```powershell
  corepack enable
  ```
  *(Jika perintah di atas gagal, ketik: `npm install -g pnpm`)*
- **Cara cek**: Ketik `pnpm -v`. Jika muncul angka versi (misal `9.15.4`), berarti sudah siap.

### C. Docker Desktop (atau PostgreSQL biasa)
- **Fungsi**: Menyediakan tempat penyimpanan data (**Database PostgreSQL**) secara otomatis tanpa perlu repot mengatur database manual.
- **Cara pasang**: Unduh dari [https://www.docker.com/products/docker-desktop/](https://www.docker.com/products/docker-desktop/), instal, lalu **buka aplikasi Docker Desktop** sampai status di pojok kiri bawahnya bertuliskan **"Engine running"** (warna hijau).
- **Alternatif tanpa Docker**: Jika komputer Anda sudah punya **PostgreSQL** sendiri (misalnya lewat Laragon, pgAdmin, atau installer PostgreSQL), Anda **tidak wajib** memakai Docker.

### D. Aplikasi Authenticator di HP (Untuk Login Super Admin)
- Karena akun **Super Admin** memiliki akses penuh, sistem mewajibkan kode keamanan 6 angka (*Two-Factor Authentication / 2FA*) dari HP.
- Unduh salah satu aplikasi gratis ini di Play Store / App Store HP Anda:
  - **Google Authenticator**, **Microsoft Authenticator**, atau **Aegis Authenticator**.

---

## 2. Langkah 1: Mengatur File Konfigurasi (`.env`)

Aplikasi membutuhkan satu file rahasia bernama `.env` untuk tahu alamat database dan kunci keamanan.

1. Buka folder proyek `dashboard-data-mahasiswa` ini di **VS Code** atau **File Explorer**.
2. Cari file bernama `.env.example`.
3. **Salin (Copy)** file `.env.example` tersebut, lalu ubah nama hasil salinannya menjadi **`.env`** *(jika sudah ada file `.env` di folder Anda, cukup buka file `.env` tersebut)*.
4. Pastikan isi di dalam file `.env` terlihat seperti ini untuk penggunaan di komputer sendiri (*localhost*):

```dotenv
# 1. Alamat koneksi ke database PostgreSQL
DATABASE_URL="postgresql://postgres:password@localhost:5432/dashboard_lab_if_unissula"

# 2. Kunci rahasia keamanan (minimal 32 karakter bebas, jangan disebarkan)
AUTH_SECRET="kunci-rahasia-laboratorium-informatika-unissula-2026-aman"

# 3. Alamat website saat dijalankan di komputer lokal
AUTH_URL="http://localhost:3000"

# 4. Pengaturan nama & password database untuk Docker
POSTGRES_USER="postgres"
POSTGRES_PASSWORD="password"
POSTGRES_DB="dashboard_lab_if_unissula"
```
5. Simpan (*Save* / `Ctrl + S`) file `.env`.

---

## 3. Langkah 2: Menginstal Paket Aplikasi

Buka terminal (**PowerShell** atau terminal di dalam VS Code dengan menekan `` Ctrl + ` ``) di dalam folder proyek `d:\Achmad Roychan\Proyek\dashboard-data-mahasiswa`, lalu jalankan:

```powershell
pnpm install
```
Tunggu beberapa saat sampai proses unduh selesai. *(Anda cukup melakukan ini satu kali saja di awal).*

---

## 4. Langkah 3: Menyalakan Database PostgreSQL

Pilih **Cara A (Pakai Docker - Paling Mudah)** atau **Cara B (Pakai PostgreSQL Sendiri)**:

### Cara A: Menggunakan Docker Desktop (Direkomendasikan)
1. Pastikan aplikasi **Docker Desktop** sudah dibuka dan menyala.
2. Di terminal folder proyek, ketik perintah ini:
   ```powershell
   docker compose up -d
   ```
3. Selesai! Docker akan otomatis menyiapkan dan menyalakan database PostgreSQL di latar belakang.

### Cara B: Jika Tidak Pakai Docker (Pakai PostgreSQL Lokal / pgAdmin)
1. Nyalakan layanan PostgreSQL di komputer Anda.
2. Buat database kosong baru bernama `dashboard_lab_if_unissula`.
3. Sesuaikan baris `DATABASE_URL` di dalam file `.env` dengan *username* dan *password* PostgreSQL milik Anda.

---

## 5. Langkah 4: Membuat Tabel Database (Migrasi)

Setelah database menyala, kita perlu mengisi database kosong tadi dengan struktur tabel (tabel mahasiswa lulusan, dosen, publikasi, dan admin). Ketik perintah ini di terminal:

```powershell
pnpm db:migrate
```
Jika berhasil, akan muncul keterangan bahwa migrasi selesai dijalankan.

---

## 6. Langkah 5: Membuat Akun Super Admin Pertama

Demi keamanan, aplikasi ini **tidak memiliki akun admin bawaan**. Anda yang membuat akun Super Admin pertama kali lewat terminal.

Ketik perintah berikut di terminal (Anda bebas mengganti nama, email, dan password minimal 12 karakter):

```powershell
$env:BOOTSTRAP_SUPER_ADMIN_NAME="Kepala Lab Informatika"
$env:BOOTSTRAP_SUPER_ADMIN_EMAIL="admin@unissula.ac.id"
$env:BOOTSTRAP_SUPER_ADMIN_PASSWORD="PasswordLabUnissula2026!"
pnpm admin:bootstrap
```

### ⚠️ Sangat Penting — Jangan Lewatkan Saat Perintah di Atas Selesai:
Di layar terminal akan muncul informasi seperti ini:
1. **`TOTP Secret (Base32)`**: Contohnya `JBSWY3DPEHPK3PXP...`
2. **8 Kode Pemulihan (`Recovery Codes`)**: Contohnya `ABCD-1234-EFGH`

**Apa yang harus Anda lakukan?**
1. Buka aplikasi **Google Authenticator** di HP Anda.
2. Tekan tombol **`+` (Tambah)** -> Pilih **Masukkan kunci penyiapan (*Enter a setup key*)**.
3. Isi Nama Akun: `Lab IF UNISSULA`, lalu masukkan kode **`TOTP Secret (Base32)`** dari layar terminal tadi, dan tekan **Simpan**.
4. Sekarang di HP Anda akan muncul **6 angka yang berganti setiap 30 detik**. Angka itulah yang dipakai setiap kali login sebagai Super Admin.
5. **Simpan/Foto 8 Kode Pemulihan (`Recovery Codes`)** di tempat aman (berguna jika suatu saat HP Anda hilang/ganti).

---

## 7. Langkah 6: Menjalankan Aplikasi

Sekarang semuanya sudah siap! Untuk menyalakan website, ketik perintah ini di terminal:

```powershell
pnpm dev
```

Tunggu beberapa detik sampai muncul tulisan:
`✓ Ready in ...`
`Local: http://localhost:3000`

Buka browser (Chrome / Edge / Firefox), lalu kunjungi:
- **Halaman Layar Publik / TV**: [http://localhost:3000](http://localhost:3000)
- **Halaman Login Admin**: [http://localhost:3000/admin/login](http://localhost:3000/admin/login)

---

## 8. Cara Menggunakan Aplikasi Pertama Kali

Saat pertama kali dibuka, halaman publik (`http://localhost:3000`) akan menampilkan pesan **"Belum Ada Data"** dan angka `0`. Itu **normal** karena Anda belum memasukkan data apa pun.

Untuk mengisi data agar tampil di layar publik:
1. Buka [http://localhost:3000/admin/login](http://localhost:3000/admin/login).
2. Masukkan:
   - **Email**: `admin@unissula.ac.id` *(sesuai yang Anda buat di Langkah 5)*
   - **Password**: `PasswordLabUnissula2026!`
   - **Kode TOTP MFA (6 Digit)**: Lihat 6 angka yang sedang tampil di aplikasi Google Authenticator di HP Anda.
3. Klik **Masuk ke Panel Admin**.
4. Di menu sebelah kiri, Anda bisa mengelola:
   - **Mahasiswa Lulusan (`/admin/mahasiswa`)**: Tambah nama lulusan, tahun masuk, dan tahun lulus.
   - **Data Dosen (`/admin/dosen`)**: Tambah profil dosen beserta foto, NIDN, NIP, keahlian, dan riwayat pendidikan.
   - **Publikasi Ilmiah (`/admin/publikasi`)**: Tambah jurnal/artikel ilmiah dan pilih siapa saja dosen penulisnya.
   - **Pengguna & Audit (`/admin/pengguna`)**: Buat akun untuk staf lain (peran `ADMIN` atau `EDITOR` tidak wajib pakai kode HP MFA saat login).
5. **PENTING — Status Draf vs Terbit (Published)**:
   - Setiap data yang baru dibuat awalnya berstatus **Draf (`DRAFT`)** supaya bisa dicek dulu dan **belum tampil** di layar TV publik.
   - Klik tombol **"Terbitkan" (`Publish`)** pada baris data tersebut agar langsung tampil di layar publik (`http://localhost:3000`).

---

## 9. Tanya Jawab / Mengatasi Masalah Umum (Troubleshooting)

| Masalah yang Muncul | Penyebab & Solusi |
| --- | --- |
| **Muncul error `ECONNREFUSED 127.0.0.1:5432` saat `pnpm db:migrate` atau `pnpm dev`** | Database PostgreSQL belum menyala. Buka aplikasi **Docker Desktop**, tunggu sampai hijau, lalu ketik `docker compose up -d` di terminal. |
| **Gagal login Super Admin karena kode 6 angka MFA ditolak** | Pastikan jam di komputer dan jam di HP Anda sudah diatur **Otomatis (*Automatic Date & Time*)**, karena kode 6 angka Google Authenticator bergantung pada kecocokan waktu detik. Jika masih terkendala, klik **"Gunakan Kode Pemulihan"** di halaman login dan masukkan salah satu dari 8 kode pemulihan. |
| **Data sudah ditambah di Admin, tapi belum muncul di halaman depan (`http://localhost:3000`)** | Pastikan status data tersebut sudah diubah dari **Draf (`DRAFT`)** menjadi **Terbit (`PUBLISHED`)** di tabel Admin. Layar publik hanya menampilkan data yang sudah diterbitkan. |
| **Bagaimana cara mematikan aplikasi setelah selesai?** | Tekan `Ctrl + C` di terminal tempat `pnpm dev` berjalan. Jika ingin mematikan database Docker juga, ketik `docker compose stop` (data Anda tetap tersimpan aman). |
| **Bagaimana cara menjalankan untuk server produksi / komputer TV Lab permanen?** | Lihat panduan lengkap di [`docs/DEPLOYMENT_GUIDE.md`](docs/DEPLOYMENT_GUIDE.md), [`docs/KIOSK_DISPLAY_GUIDE.md`](docs/KIOSK_DISPLAY_GUIDE.md), dan [`docs/OPERATIONS_GUIDE.md`](docs/OPERATIONS_GUIDE.md). |
