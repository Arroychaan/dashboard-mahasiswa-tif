# Design Document: Slide 5 (Pengumuman & Berita Acara) dan Slide 6 (Kotak Saran & Sumbangan)

**Date:** 2026-11-17  
**Status:** In Review  
**Target:** Penambahan 2 Slide Baru pada Public Dashboard & Pengelolaan Admin  

---

## 1. Intent & Context

Berdasarkan kebutuhan Program Studi Teknik Informatika UNISSULA, layar publik TV digital signage di prodi perlu memuat informasi tambahan yang interaktif dan dinamis:
1. **Pengumuman & Berita Acara Akademik (Slide 5)**: Menampilkan agenda kegiatan, berita acara sidang/akademik, dan pengumuman resmi yang dapat ditambah dan diubah secara fleksibel oleh staf admin.
2. **Kotak Saran & Sumbangan (Slide 6)**: Menampilkan media interaksi bagi mahasiswa dan pengunjung untuk memberikan kritik, saran, masukan, maupun sumbangan prodi hanya dengan memindai satu kode QR (`contoh.png`) melalui ponsel pintar. Gambar kode QR ini juga harus dapat diperbarui oleh admin sewaktu-waktu.

Saat ini layar publik memiliki 4 *scene* (`OVERVIEW`, `GRADUATES`, `LECTURERS`, `PUBLICATIONS`). Penambahan ini akan memperluas rotasi menjadi 6 *scene*.

---

## 2. Goals, Non-Goals & Anti-Goals

### 2.1 Goals
1. **Slide 5 — Pengumuman & Berita Acara**:
   - Skema database baru `announcements` untuk menyimpan pengumuman dan berita acara dengan kolom: `id`, `title`, `category` (`PENGUMUMAN` | `BERITA_ACARA`), `content`, `eventDate`, `isPublished`, `createdAt`, `updatedAt`.
   - Halaman admin baru di `/admin/pengumuman` dengan alur CRUD lengkap, pencarian, filter kategori, dan mekanisme persetujuan Draf vs Terbit (*Published*).
   - *Scene* publik `AnnouncementsScene` pada layar TV yang otomatis membagi halaman (*fair round-robin pagination*) jika pengumuman lebih dari 3-4 item, dan dikunci satu layar penuh tanpa *scroll*.
2. **Slide 6 — Kotak Saran & Sumbangan**:
   - *Scene* publik `FeedbackQrScene` berorientasi *digital signage* yang menampilkan kode QR berukuran besar, tajam, dan mudah dipindai dari jarak pandang TV, dengan judul resmi **"Kotak Saran & Sumbangan"** dan panduan ringkas.
   - Menggunakan `public/contoh.png` sebagai QR bawaan (*fallback*).
   - Pengaturan admin untuk mengganti gambar QR dan teks keterangan/URL tujuan diintegrasikan ke menu `/admin/pengaturan` melalui tabel `system_settings` dan endpoint upload gambar aman (`/api/admin/feedback-qr`).
3. **Ekstensi Rotasi Slideshow**:
   - Memperbarui `design-tokens.ts` dan `slideshow-engine.ts` dari 4 *scene* menjadi 6 *scene*:
     1. `OVERVIEW` (Ringkasan)
     2. `GRADUATES` (Lulusan)
     3. `LECTURERS` (Dosen)
     4. `PUBLICATIONS` (Publikasi)
     5. `ANNOUNCEMENTS` (Pengumuman & Berita Acara)
     6. `FEEDBACK_QR` (Kotak Saran & Sumbangan)
   - Memastikan seluruh *scene* patuh pada aturan **satu layar penuh tanpa scroll** (`100vh` di monitor TV).

### 2.2 Non-Goals
- Tidak membuat sistem pengisian formulir saran langsung di TV (TV murni *read-only signage*; pengisian saran dilakukan di HP masing-masing setelah memindai QR).
- Tidak membebani Raspberry Pi 3B dengan animasi berat; tampilan QR dan pengumuman menggunakan layout solid dan kontras tinggi.

### 2.3 Anti-Goals
- Tidak membuat menu admin menjadi terlalu banyak/berantakan untuk sekadar pengaturan satu gambar QR.
- Tidak memperbolehkan teks meluap (*overflow*) ke bawah yang memicu *scrollbar* di layar TV.

---

## 3. Approaches Considered

### Pendekatan 1: Terintegrasi & Efisien (Dipilih)
- **Pengumuman**: Tabel database `announcements` + halaman admin `/admin/pengumuman`.
- **Kotak Saran**: Pengaturan gambar QR dan URL/keterangan disimpan di tabel `system_settings` dan dikelola di halaman `/admin/pengaturan`.
- **Alasan Pemilihan**: Sangat rapi, mematuhi prinsip arsitektur yang sudah ada (`system_settings` sudah dipakai untuk tema display), dan tidak memenuhi bilah navigasi admin dengan menu baru yang hanya berisi satu upload foto.

### Pendekatan 2: Pemisahan Menu Penuh (Ditolak)
- Membuat tabel `feedback_channels` tersendiri dan menu navigasi `/admin/kotak-saran`.
- **Alasan Penolakan**: Menu admin menjadi redundan untuk fungsionalitas yang jarang diubah.

---

## 4. Technical Architecture & Implementation Details

### 4.1 Skema Database (`src/server/db/schema.ts`)
1. Enum baru `announcementCategoryEnum`: `'PENGUMUMAN'`, `'BERITA_ACARA'`.
2. Tabel `announcements`:
   - `id`: `uuid` (Primary Key, default `gen_random_uuid()`)
   - `title`: `varchar(255)` (Not Null)
   - `category`: `announcementCategoryEnum` (Not Null, default `'PENGUMUMAN'`)
   - `content`: `text` (Not Null)
   - `eventDate`: `timestamp with time zone` (Not Null)
   - `isPublished`: `boolean` (Not Null, default `false`)
   - `createdAt`: `timestamp with time zone` (default `now()`)
   - `updatedAt`: `timestamp with time zone` (default `now()`)
3. Pengaturan QR di `system_settings`:
   - Kunci: `feedback_qr_path` (default `"/contoh.png"`), `feedback_title` (default `"Kotak Saran & Sumbangan"`), `feedback_description` (default `"Pindai kode QR untuk menyampaikan aspirasi, saran perbaikan, atau sumbangan bagi Program Studi Teknik Informatika UNISSULA."`).

### 4.2 API Routers (`src/server/api/routers/`)
1. **`announcements.ts`**:
   - `list`: Mengambil daftar pengumuman untuk admin (dengan pencarian, filter kategori & status, paginasi).
   - `create`: Menambah pengumuman baru (akses: `EDITOR`, `ADMIN`, `SUPER_ADMIN`).
   - `update`: Mengubah pengumuman (akses: `EDITOR`, `ADMIN`, `SUPER_ADMIN`).
   - `setPublished`: Mengubah status Draf/Terbit (akses: `ADMIN`, `SUPER_ADMIN`).
   - `delete`: Menghapus pengumuman (akses: `ADMIN`, `SUPER_ADMIN`).
2. **`publicDashboard.ts`**:
   - Prosedur baru `announcements`: Mengambil seluruh pengumuman terpublikasi (`isPublished = true`) diurutkan dari tanggal terbaru.
   - Prosedur baru `feedbackQr`: Mengambil konfigurasi QR aktif untuk Slide 6.
3. **`systemSettings.ts`**:
   - Mutasi `updateFeedbackQr`: Memperbarui path foto QR dan deskripsi (akses: `ADMIN`, `SUPER_ADMIN`).
4. **Endpoint Upload QR (`src/app/api/admin/feedback-qr/route.ts`)**:
   - Endpoint aman dengan verifikasi magic-bytes gambar (PNG/JPEG/WebP), sanitasi via `sharp`, dan disimpan di `/public/uploads/qr/`.

### 4.3 Tampilan Publik (`src/components/public/`)
1. **`AnnouncementsScene.tsx` (Slide 5)**:
   - Menampilkan kartu-kartu pengumuman & berita acara (maksimal 3-4 kartu per layar agar proporsional dan mudah dibaca dari jarak jauh).
   - Badge penanda kategori: Biru untuk **Pengumuman**, Hijau/Teal untuk **Berita Acara**.
   - Menampilkan tanggal kegiatan dalam format `d MMMM yyyy`.
   - Rotasi halaman otomatis (*round-robin*) jika data melebihi 1 halaman.
2. **`FeedbackQrScene.tsx` (Slide 6)**:
   - Layout elegan terpusat satu layar penuh tanpa scroll (`100vh`).
   - Kode QR berukuran besar (~280px-340px) di dalam wadah berlatar putih bersih dengan kontras tinggi (mudah dipindai kamera HP).
   - Judul: **Kotak Saran & Sumbangan**.
   - Deskripsi instruksi yang jelas dan terarah.

### 4.4 Panel Admin
1. **`/admin/pengumuman/page.tsx`**:
   - Antarmuka tabel pengumuman, tombol "+ Tambah Pengumuman", modal formulir (Judul, Kategori, Tanggal, Isi), tombol Draf/Terbitkan, dan konfirmasi hapus.
   - Ditambahkan ke *Sidebar* ([AdminShell.tsx](file:///d:/Achmad%20Roychan/Proyek/dashboard-data-mahasiswa/src/components/admin/AdminShell.tsx)).
2. **`/admin/pengaturan/page.tsx`**:
   - Ditambahkan seksi kartu "Pengaturan Kode QR Kotak Saran & Sumbangan": pratinjau gambar QR saat ini, formulir unggah gambar QR baru, dan tombol simpan.

---

## 5. Rencana Pengujian & Verifikasi
- Migrasi database dieksekusi dengan aman (`pnpm db:generate` & `pnpm db:migrate`).
- Unit/Integrasi Test:
  - Validasi CRUD dan RBAC pada router `announcements`.
  - Validasi *round-robin* pagination slideshow untuk 6 scene.
  - Validasi endpoint upload gambar QR.
  - Validasi ketat `100vh` tanpa *scroll* pada Slide 5 dan Slide 6.
- Menjalankan `pnpm typecheck` dan `pnpm vitest run --no-file-parallelism` dengan hasil 100% *pass*.
