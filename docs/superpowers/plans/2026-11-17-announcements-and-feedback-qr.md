# Slide 5 (Pengumuman & Berita Acara) & Slide 6 (Kotak Saran & Sumbangan) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menambahkan Slide 5 (Pengumuman & Berita Acara dinamis via admin) dan Slide 6 (Kotak Saran & Sumbangan berbasis QR yang dapat diganti via admin), memperluas rotasi slideshow publik dari 4 menjadi 6 scene tanpa scroll (100vh).

**Architecture:** Menggunakan Drizzle ORM dengan tabel baru `announcements` dan perluasan kunci di tabel `system_settings` untuk QR feedback. tRPC router mengelola CRUD Pengumuman dan query data publik. Dua komponen scene publik baru (`AnnouncementsScene` dan `FeedbackQrScene`) ditambahkan ke `PublicDashboardSlideshow` dengan penguncian tinggi layar penuh. Halaman admin baru dibuat di `/admin/pengumuman` dan seksi konfigurasi QR ditambahkan ke `/admin/pengaturan`.

**Tech Stack:** Next.js 15 (App Router), TypeScript strict mode, Drizzle ORM, PostgreSQL, tRPC v11, Tailwind CSS, sharp, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-17-announcements-and-feedback-qr-design.md`

## Global Constraints
- **Zero Scroll (100vh)**: Slide 1, Slide 5, dan Slide 6 wajib terkunci dalam 1 layar penuh pada resolusi monitor/TV (`lg:h-screen lg:overflow-hidden`).
- **Data Integrity & RBAC**: Status Draf vs Terbit diberlakukan pada Pengumuman (hanya `ADMIN` dan `SUPER_ADMIN` yang dapat menerbitkan). `EDITOR` hanya dapat membuat/mengedit draf.
- **Validasi Gambar QR**: Upload gambar QR dibatasi maksimal 2 MB, divalidasi magic-bytes (PNG/JPEG/WebP), disanitasi via `sharp`, dan disimpan dengan nama UUID acak di `public/uploads/qr/`.
- **Default Asset**: Jika admin belum mengunggah QR kustom, sistem memakai `public/contoh.png` sebagai bawaan.
- **Bahasa Resmi**: Menggunakan frase resmi "Program Studi Teknik Informatika" (bukan Laboratorium).

## Review Focus
1. Input tanggal pengumuman masa lalu atau masa depan ditangani dengan benar pada pemformatan tanggal Indonesia.
2. Daftar pengumuman kosong menampilkan *empty state* yang rapi dan elegan tanpa error.
3. Pergantian scene slideshow dari 6 scene berputar tepat waktu 15 detik per scene secara round-robin tanpa jeda atau memory leak.
4. Upload file QR non-gambar (misal SVG atau teks skrip) ditolak secara eksplisit dengan status 400.
5. Perubahan tema display (Light/Dark/Monochrome) tetap terbaca jelas pada Slide 5 dan Slide 6 (wadah QR selalu kontras tinggi).

---

### Task 1: Skema Database & Migrasi Drizzle untuk Announcements dan Feedback QR

**Files:**
- Modify: `src/server/db/schema.ts`
- Modify: `src/lib/validators/index.ts`
- Create: `drizzle/0002_add_announcements_and_feedback.sql` (generated via drizzle-kit)
- Test: `src/server/__tests__/announcements-schema.test.ts`

**Interfaces:**
- Produces: `announcementCategoryEnum`, `announcements` table, `createAnnouncementSchema`, `updateAnnouncementSchema`, `updateFeedbackQrSchema`.

- [ ] **Step 1: Write the failing schema test**
Test validasi Zod schema pengumuman dan tipe enum kategori.
- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm vitest run src/server/__tests__/announcements-schema.test.ts`
Expected: FAIL (schema/validator not defined).
- [ ] **Step 3: Implement enum, tabel `announcements`, dan Zod validators**
Tambahkan `announcementCategoryEnum` (`'PENGUMUMAN'`, `'BERITA_ACARA'`) dan tabel `announcements` di `src/server/db/schema.ts` serta validator di `src/lib/validators/index.ts`.
- [ ] **Step 4: Generate dan terapkan migrasi Drizzle**
Run: `pnpm db:generate`
- [ ] **Step 5: Run test to verify it passes**
Run: `pnpm vitest run src/server/__tests__/announcements-schema.test.ts`
Expected: PASS.
- [ ] **Step 6: Commit**
`git add src/server/db/schema.ts src/lib/validators/index.ts drizzle/ src/server/__tests__/announcements-schema.test.ts`
`git commit -m "feat(db): add announcements schema and validators"`

---

### Task 2: Backend tRPC Routers (`announcements`, `systemSettings.feedbackQr`, `publicDashboard`)

**Files:**
- Create: `src/server/api/routers/announcements.ts`
- Modify: `src/server/api/routers/systemSettings.ts`
- Modify: `src/server/api/routers/publicDashboard.ts`
- Modify: `src/server/api/root.ts`
- Test: `src/server/__tests__/announcements-router.test.ts`

**Interfaces:**
- Consumes: `announcements` table, `createAnnouncementSchema`, `updateAnnouncementSchema`.
- Produces: `appRouter.announcements.*`, `appRouter.publicDashboard.announcements`, `appRouter.publicDashboard.feedbackQr`, `appRouter.systemSettings.updateFeedbackQr`.

- [ ] **Step 1: Write the failing router test**
Test RBAC untuk `announcements.list`, `create`, `update`, `setPublished`, `delete`, serta `publicDashboard.announcements` dan `publicDashboard.feedbackQr`.
- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm vitest run src/server/__tests__/announcements-router.test.ts`
Expected: FAIL.
- [ ] **Step 3: Implement router `announcements.ts` dan daftarkan di `root.ts`**
Implementasikan CRUD dengan role guard (EDITOR draf only, ADMIN/SUPER_ADMIN publish & delete).
- [ ] **Step 4: Tambahkan endpoint `announcements` & `feedbackQr` di `publicDashboard.ts` serta mutasi update QR di `systemSettings.ts`**
Ambil data terpublikasi untuk public dashboard, dan kelola konfigurasi QR di `system_settings`.
- [ ] **Step 5: Run test to verify it passes**
Run: `pnpm vitest run src/server/__tests__/announcements-router.test.ts`
Expected: PASS.
- [ ] **Step 6: Commit**
`git add src/server/api/`
`git commit -m "feat(api): add announcements and feedbackQr trpc procedures"`

---

### Task 3: API Endpoint Upload Gambar QR (`POST /api/admin/feedback-qr`)

**Files:**
- Create: `src/app/api/admin/feedback-qr/route.ts`
- Modify: `next.config.js` (pastikan CSP /uploads mengizinkan webp/png)
- Test: `src/server/__tests__/feedback-qr-upload.test.ts`

**Interfaces:**
- Produces: `POST /api/admin/feedback-qr` (mengembalikan `{ qrPath: string }`).

- [ ] **Step 1: Write failing upload test**
Test verifikasi magic bytes gambar, penolakan SVG/teks berbahaya, dan sanitasi via sharp.
- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm vitest run src/server/__tests__/feedback-qr-upload.test.ts`
Expected: FAIL.
- [ ] **Step 3: Implement upload route handler**
Autentikasi role `ADMIN` / `SUPER_ADMIN`, validasi ukuran $\le 2$ MB, proses via `sharp` ke WebP/PNG di `public/uploads/qr/`, audit log.
- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm vitest run src/server/__tests__/feedback-qr-upload.test.ts`
Expected: PASS.
- [ ] **Step 5: Commit**
`git add src/app/api/admin/feedback-qr/ next.config.js`
`git commit -m "feat(storage): add secure feedback QR image upload endpoint"`

---

### Task 4: Halaman Admin Pengumuman & Pengaturan QR

**Files:**
- Create: `src/app/admin/(protected)/pengumuman/page.tsx`
- Modify: `src/app/admin/(protected)/pengaturan/page.tsx`
- Modify: `src/components/admin/AdminShell.tsx` (tambah nav item Pengumuman)

**Interfaces:**
- Consumes: `api.announcements.*`, `api.systemSettings.updateFeedbackQr`.

- [ ] **Step 1: Tambahkan nav item "Pengumuman & Berita Acara" di `AdminShell.tsx`**
Tambahkan rute `/admin/pengumuman` dengan ikon/deskripsi yang sesuai di navigasi admin.
- [ ] **Step 2: Implementasi halaman `/admin/pengumuman/page.tsx`**
Tabel data, modal form (Judul, Kategori, Tanggal, Konten), pencarian, filter status & kategori, toggle publish, dan konfirmasi hapus.
- [ ] **Step 3: Tambahkan kartu "Pengaturan Kode QR Kotak Saran & Sumbangan" di `/admin/pengaturan/page.tsx`**
Pratinjau QR aktif saat ini, tombol unggah gambar QR baru, input teks judul & instruksi, dan tombol simpan.
- [ ] **Step 4: Verifikasi build & typecheck**
Run: `pnpm typecheck`
Expected: 0 error.
- [ ] **Step 5: Commit**
`git add src/app/admin/ src/components/admin/`
`git commit -m "feat(admin): add announcements management and feedback QR settings UI"`

---

### Task 5: Komponen Tampilan Publik (Slide 5: `AnnouncementsScene`, Slide 6: `FeedbackQrScene`) & Slideshow Engine Update

**Files:**
- Modify: `src/components/public/design-tokens.ts` (update 6 scene)
- Modify: `src/components/public/slideshow-engine.ts` (dukungan 6 scene & paginasi pengumuman)
- Create: `src/components/public/AnnouncementsScene.tsx`
- Create: `src/components/public/FeedbackQrScene.tsx`
- Modify: `src/components/public/PublicDashboardSlideshow.tsx`
- Test: `src/server/__tests__/phase4-public-dashboard.test.ts`

**Interfaces:**
- Produces: `PUBLIC_SCENE_DEFINITIONS` (6 items), `AnnouncementsScene`, `FeedbackQrScene`.

- [ ] **Step 1: Perbarui `design-tokens.ts` & `slideshow-engine.ts` untuk 6 Scene**
Tambahkan `ANNOUNCEMENTS` (Layar 5) dan `FEEDBACK_QR` (Layar 6).
- [ ] **Step 2: Implementasi `AnnouncementsScene.tsx` (Slide 5)**
Kartu pengumuman responsif (maks 3 per layar agar besar & jelas terbaca di TV), badge kategori, format tanggal Indonesia, dikunci `100vh` tanpa scroll.
- [ ] **Step 3: Implementasi `FeedbackQrScene.tsx` (Slide 6)**
QR card terpusat dengan background kontras tinggi, judul "Kotak Saran & Sumbangan", teks penjelasan, dikunci `100vh` tanpa scroll.
- [ ] **Step 4: Integrasikan ke `PublicDashboardSlideshow.tsx`**
Query `announcements` dan `feedbackQr`, integrasikan ke state machine slideshow dan render scene 5 & 6.
- [ ] **Step 5: Update tes `phase4-public-dashboard.test.ts`**
Verifikasi rotasi 6 scene dan rendering HTML Slide 5 & 6.
- [ ] **Step 6: Run test to verify it passes**
Run: `pnpm vitest run src/server/__tests__/phase4-public-dashboard.test.ts`
Expected: PASS.
- [ ] **Step 7: Commit**
`git add src/components/public/ src/server/__tests__/`
`git commit -m "feat(public): implement announcements and feedback QR scenes with 6-scene slideshow"`

---

### Task 6: Verifikasi Akhir, Integrasi E2E, & Typecheck

**Files:**
- Modify: `src/server/__tests__/phase5-e2e-audit.test.ts` (verifikasi alur pengumuman terbit & tampil publik)

- [ ] **Step 1: Jalankan typecheck penuh**
Run: `pnpm typecheck`
Expected: 0 error.
- [ ] **Step 2: Jalankan seluruh suite tes**
Run: `pnpm vitest run --no-file-parallelism`
Expected: All 6+ test files PASS.
- [ ] **Step 3: Jalankan linting**
Run: `pnpm lint`
Expected: No warnings or errors.
- [ ] **Step 4: Commit hasil verifikasi**
`git commit -m "test: verify complete announcements and feedback QR integration"`
