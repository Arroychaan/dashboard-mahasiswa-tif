# Design Document: Slide 7 (Jadwal Mata Kuliah) & Kiosk Sentuh Hybrid pada Lubuntu 26.04 (T4 Pro Mini PC)

**Date:** 2026-11-22  
**Status:** Approved by Reviewer / Ready for Plan  
**Target Device:** Beelink T4 Pro Mini PC (Intel Celeron N3350, RAM 4GB, eMMC 64GB) + Monitor Touchscreen  
**Target OS:** Lubuntu 26.04 LTS (LXQt Desktop)  

---

## 1. Intent & Context

Program Studi Teknik Informatika UNISSULA membutuhkan pembaruan pada dashboard laboratorium yang dipasang pada monitor layar sentuh (*touchscreen*) di area laboratorium/program studi:
1. **Penambahan Slide ke-7 (Jadwal Mata Kuliah)**: Menampilkan jadwal perkuliahan harian dan mingguan prodi Teknik Informatika (mata kuliah, kelas, jam, ruangan, dan dosen) sehingga mahasiswa dapat langsung mengetahui kelas yang sedang berlangsung maupun kelas berikutnya.
2. **Transformasi Menjadi Kiosk Sentuh Hybrid**: Mengubah display publik dari tayangan pasif murni (*zero-interaction signage*) menjadi sistem *hybrid*:
   - Saat tidak disentuh, layar otomatis memutar 7 *scene* informasi (digital signage).
   - Begitu disentuh, rotasi otomatis terjeda (*pause*), memunculkan navigasi sentuh cepat, filter jadwal hari ini/hari lain/ruangan, serta kemampuan membaca isi lengkap pengumuman.
   - Setelah 45 detik tanpa interaksi (*idle timeout*), sistem otomatis menutup modal/filter dan mereset layar kembali ke Slide 1 (*Attract Screen / Overview*) untuk melanjutkan putaran slideshow.
3. **Efisiensi Perangkat Keras**: Mengoptimalkan sistem agar berjalan sangat ringan, mulus, dan bebas *lag* pada Mini PC T4 Pro (Intel Celeron N3350, RAM 4GB, 64GB storage) dengan sistem operasi Lubuntu 26.04.

---

## 2. Goals, Non-Goals & Anti-Goals

### 2.1 Goals
1. **Skema Database & Dummy Data (`course_schedules`)**:
   - Skema Drizzle baru untuk jadwal kuliah: `id`, `dayOfWeek` (`SENIN`, `SELASA`, `RABU`, `KAMIS`, `JUMAT`, `SABTU`), `startTime` (`HH:mm`), `endTime` (`HH:mm`), `courseName`, `className`, `roomName`, `lecturerName`, `semester`, `academicYear`, `isPublished`, `createdAt`, `updatedAt`.
   - Penyediaan 5 data *dummy* awal realistis sesuai permintaan:
     - Kecerdasan Buatan (Kelas B, R108, 13.00 - 14.30)
     - Sistem Biomedis (Kelas A, R109, 13.00 - 14.30)
     - Kalkulus (Kelas A, R106, 08.00 - 09.30)
     - Desain Basis Data (Kelas B, R304, 09.45 - 11.15)
     - Sistem Operasi (Kelas A, R305, 14.45 - 16.15)
   - Ruangan yang didukung: R106, R107, R108, R109, R303, R304, R305, R306, R307, R308 dengan rentang waktu 08.00 - 17.00 WIB.
2. **Pengelolaan Admin (`/admin/jadwal`)**:
   - Halaman CRUD lengkap di panel admin: pencarian nama matkul/dosen, filter hari & ruangan, tombol Draf/Terbitkan (*Publish*), formulir tambah/edit jadwal, dan dialog konfirmasi hapus.
   - Ditambahkan ke bilah navigasi admin (`AdminShell.tsx`).
3. **Slide Publik Baru (`CourseScheduleScene.tsx`)**:
   - Tampilan jadwal modern, kontras tinggi, dan patuh pada aturan **satu layar penuh tanpa scroll** (`100vh`).
   - Kapasitas kartu per layar: 6 kartu jadwal (grid 2x3).
   - Secara *default* menyorot hari aktif saat ini (*WIB Today*). Jika hari Minggu (*weekend* tanpa kuliah), menampilkan pemberitahuan informatif "Hari Ini Tidak Ada Kuliah (Hari Libur)" dengan tombol cepat "Lihat Jadwal Senin".
   - Menghitung status dinamis kelas secara real-time: **Sedang Berlangsung** (indikator hijau hidup), **Akan Datang**, dan **Selesai**.
   - Paginasi otomatis (*fair round-robin*) saat mode tayang tanpa sentuh, dan tombol sentuh manual (`Sebelumnya` / `Berikutnya` $\ge 44 \times 44\text{ px}$) saat layar sedang disentuh/dijeda.
4. **Interaksi Layar Sentuh Ramah Jari (Touch-First UX)**:
   - Deteksi sentuhan (*touch/click*) global pada layar publik yang otomatis menjeda pemutaran slide.
   - Dua baris tombol filter sentuh berukuran besar ($\ge 44 \times 44\text{ px}$):
     - Baris 1: Filter Hari Cepat (`Hari Ini`, `Senin`, `Selasa`, `Rabu`, `Kamis`, `Jumat`, `Sabtu`).
     - Baris 2: Filter Ruangan Cepat (`Semua Ruangan`, `R106`, `R107`, `R108`, `R109`, `R303`, `R304`, dst.).
     - Metadata Semester ditampilkan langsung pada badge kartu (misal: "Semester 3"), tanpa menambah baris filter ketiga agar tidak memakan ruang vertikal `100vh`.
   - Tombol navigasi slide (*scene indicator pills*) di bagian header/footer untuk melompat antar-slide secara instan.
   - Interaksi Pengumuman: Kartu pada `AnnouncementsScene` dapat ditekan untuk membuka dialog/modal membaca pengumuman lengkap.
   - *Idle Timer Controller* (45 detik): Jika tidak ada aktivitas sentuhan baru, modal tertutup otomatis, filter direset ke default, dan layar kembali ke Slide 1 (`OVERVIEW`) melanjutkan rotasi slideshow.
5. **Ekstensi Rotasi Slideshow**:
   - Memperbarui `design-tokens.ts` dan `slideshow-engine.ts` menjadi 7 *scene*:
     1. `OVERVIEW` (Ringkasan)
     2. `GRADUATES` (Lulusan)
     3. `LECTURERS` (Dosen)
     4. `PUBLICATIONS` (Publikasi)
     5. `ANNOUNCEMENTS` (Pengumuman & Berita Acara)
     6. `FEEDBACK_QR` (Kotak Saran & Sumbangan)
     7. `COURSE_SCHEDULE` (Jadwal Mata Kuliah)
6. **Optimasi Performa T4 Pro & Lubuntu 26.04**:
   - Menggunakan alur *Pre-compiled Standalone Bundle* (kompilasi Next.js dilakukan di PC pengembang dalam ~15 detik, paket siap jalan dikirim via WiFi/USB) agar CPU dual-core Celeron N3350 tidak terbebani *build* berat.
   - Panduan dan skrip setup deployment untuk Lubuntu: autostart systemd service Next.js standalone + PostgreSQL lokal.
   - Parameter Chromium Kiosk hemat daya dengan akselerasi GPU Intel HD Graphics (`--enable-gpu-rasterization --touch-events=enabled --kiosk`). Total konsumsi RAM sistem $\le 1.3\text{ GB}$ (tersisa $\ge 2.7\text{ GB}$ RAM bebas).

### 2.2 Non-Goals
- Tidak menyediakan fitur presensi mahasiswa atau login mahasiswa di kiosk (layar publik murni untuk pencarian dan informasi).
- Tidak menggunakan *virtual keyboard* layar penuh yang rumit; pencarian jadwal dioptimalkan menggunakan tombol filter *pill* (Hari & Ruangan) yang bisa dipilih dalam satu kali tap.

### 2.3 Anti-Goals
- Tidak membiarkan layar berada dalam kondisi teracak atau tertahan di satu slide selamanya setelah ditinggalkan oleh mahasiswa (*idle timeout* wajib mereset layar kembali ke Slide 1).
- Tidak membuat tombol atau elemen kontrol kecil yang menyulitkan sentuhan jari pada layar sentuh.
- Tidak menimbulkan *scrollbar* vertikal/horizontal pada layar publik.

---

## 3. Approaches Considered

### Pendekatan 1: Unified Kiosk Hybrid (Dipilih)
- Satu URL utama (`/`) yang bertindak sebagai signage berotasi otomatis saat idle dan beralih mulus ke mode interaktif saat disentuh.
- **Alasan Pemilihan**: Ideal untuk perangkat keras Mini PC tunggal dengan layar sentuh fisik. Menggabungkan fungsi TV informasi prodi saat ruangan sepi dan kiosk interaktif pencarian jadwal saat mahasiswa menghampiri layar. Sangat efisien dalam pemakaian memori.

### Pendekatan 2: Dual Route Terpisah (`/tv` & `/kiosk`) (Ditolak)
- Memisahkan fungsi menjadi dua rute berbeda.
- **Alasan Penolakan**: Memaksa administrator memilih salah satu mode permanen di browser Mini PC, sehingga menghilangkan salah satu manfaat utama (entah kehilangan fungsi signage otomatis atau kehilangan fungsi interaktif sentuh).

---

## 4. Technical Specifications & Architecture

### 4.1 Skema Database (`src/server/db/schema.ts`)
```typescript
export const dayOfWeekEnum = pgEnum("day_of_week", [
  "SENIN",
  "SELASA",
  "RABU",
  "KAMIS",
  "JUMAT",
  "SABTU",
]);

export const courseSchedules = pgTable(
  "course_schedules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    dayOfWeek: dayOfWeekEnum("day_of_week").notNull(),
    startTime: varchar("start_time", { length: 5 }).notNull(), // "08:00"
    endTime: varchar("end_time", { length: 5 }).notNull(),     // "09:30"
    courseName: varchar("course_name", { length: 255 }).notNull(),
    className: varchar("class_name", { length: 32 }).notNull(), // "A", "B"
    roomName: varchar("room_name", { length: 64 }).notNull(),   // "R108"
    lecturerName: varchar("lecturer_name", { length: 255 }).notNull(),
    semester: integer("semester"),                              // 1-8
    academicYear: varchar("academic_year", { length: 32 }),     // "2026/2027"
    isPublished: boolean("is_published").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (t) => [
    index("course_schedules_day_idx").on(t.dayOfWeek),
    index("course_schedules_room_idx").on(t.roomName),
    index("course_schedules_is_published_idx").on(t.isPublished),
  ]
);
```

### 4.2 API Routers (`src/server/api/routers/`)
1. **`courseSchedules.ts`**:
   - Prosedur admin: `list` (pencarian, filter hari/ruang, status, paginasi), `create`, `update`, `setPublished`, `delete`.
   - Prosedur admin/seed: Injeksi 5 data dummy otomatis saat inisialisasi jika tabel masih kosong.
2. **`publicDashboard.ts`**:
   - Prosedur `courseSchedules`: Mengambil seluruh jadwal terpublikasi (`isPublished = true`) diurutkan berdasarkan hari dan jam mulai.

### 4.3 Logika Kiosk Touch & Idle Reset (`PublicDashboardSlideshow.tsx`)
1. **State Mesin Slideshow**:
   - `isPaused`: `boolean` (otomatis `true` saat `onTouchStart` atau `onClick`).
   - `selectedDayFilter`: `DayOfWeek | "TODAY"` (default `"TODAY"`).
   - `selectedRoomFilter`: `string | "ALL"` (default `"ALL"`).
   - `activeModalAnnouncement`: `AnnouncementItem | null`.
   - `manualPageIndex`: `number` (untuk paginasi manual pada Slide 7 saat `isPaused = true`).
2. **Idle Timer Mechanism**:
   - Ref `idleTimerRef` disetel ke 45 detik.
   - Setiap kali terjadi interaksi layar (`touchmove`, `touchstart`, `pointerdown`), timer direset ke 45 detik.
   - Saat waktu 45 detik habis: `isPaused` kembali menjadi `false`, filter direset ke `"TODAY"` dan `"ALL"`, modal pengumuman ditutup, `sceneIndex` direset ke `0` (Slide 1 `OVERVIEW`), dan slideshow kembali bergulir dari awal.

### 4.4 Slide Publik (`CourseScheduleScene.tsx`)
- Header Scene: Indikator Hari & Tanggal WIB + Tombol Filter Cepat Hari (`Hari Ini`, `Senin`, `Selasa`, `Rabu`, `Kamis`, `Jumat`, `Sabtu`).
- Filter Cepat Ruangan: Tombol pill ruangan populer (`Semua`, `R106`, `R107`, `R108`, `R109`, `R303`, `R304`, `R305`, `R306`, `R307`, `R308`).
- Grid Kartu Jadwal (Maksimal 6 kartu per layar dalam grid 2x3):
  - Kartu menampilkan: Jam (misal `13.00 - 14.30`), Mata Kuliah, Kelas, Ruangan (badge kontras tinggi), Dosen Pengampu, Badge Semester.
  - Status Real-Time:
    - Jika waktu sekarang berada di antara `startTime` dan `endTime`: Badge hijau menyala berdenyut **"Sedang Berlangsung"**.
    - Jika waktu sekarang sebelum `startTime`: Badge biru **"Akan Datang"**.
    - Jika waktu sekarang melewati `endTime`: Badge abu-abu netral **"Selesai"**.
- Paginasi Sentuh: Jika kartu melebihi 6, muncul tombol navigasi halaman ramah sentuh (`<` Halaman 1/2 `>`).

---

## 5. Rencana Pengujian & Verifikasi

1. **Pengujian Basis Data**:
   - Eksekusi migrasi Drizzle untuk tabel `course_schedules`.
   - Eksekusi seed 5 data dummy awal (Kecerdasan Buatan B, Sistem Biomedis A, Kalkulus A, Desain Basis Data B, Sistem Operasi A).
2. **Unit & Integrasi Test**:
   - CRUD dan hak akses RBAC router `courseSchedules` via Vitest.
   - Uji penentuan status aktif jam kuliah (*ongoing*, *upcoming*, *finished*).
   - Uji perputaran 7 scene slideshow pada `slideshow-engine.ts`.
3. **Verifikasi Touchscreen & Idle Timeout**:
   - Simulasi sentuhan menghentikan rotasi slide.
   - Simulasi sentuhan paginasi manual pada jadwal kuliah.
   - Simulasi idle timeout mereset ke Slide 1 setelah 45 detik.
4. **Verifikasi Build & Typecheck**:
   - `pnpm check` (`next lint && tsc --noEmit`) tanpa kesalahan.
   - `pnpm test` (Vitest) 100% lulus.
   - `pnpm build` menghasilkan artefak *standalone* siap pasang di Lubuntu.
