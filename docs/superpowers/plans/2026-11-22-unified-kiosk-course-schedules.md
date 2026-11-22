# Unified Kiosk Hybrid & Slide 7 (Jadwal Mata Kuliah) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menambahkan Slide 7 (*Jadwal Mata Kuliah Prodi Teknik Informatika*) dengan manajemen CRUD admin + 5 data dummy awal, mentransformasi dashboard publik menjadi **Unified Kiosk Hybrid** ramah layar sentuh dengan *idle timeout* 45 detik, serta menyiapkan paket deployment teroptimasi untuk **Beelink T4 Pro Mini PC (4GB/64GB)** berbasis **Lubuntu 26.04**.

**Architecture:** Memperluas stack Next.js 15 App Router + Drizzle ORM (PostgreSQL) + tRPC v11 dengan tabel `course_schedules` baru, router admin/publik, fungsi murni status jadwal WIB & state machine *Kiosk Hybrid*, serta 2-row touch-first UI tanpa *scrollbar* (`100vh`). Deployment Lubuntu menggunakan alur *pre-compiled Next.js standalone bundle* (`output: "standalone"`) agar CPU dual-core Celeron N3350 hanya menjalankan runtime ringan (~1.2 GB total RAM) dengan akselerasi GPU Chromium dan flag layar sentuh.

**Tech Stack:** Next.js 15 (`standalone`), React 19, TypeScript 5.8, Tailwind CSS v4, Drizzle ORM + PostgreSQL, tRPC v11, Zod, Vitest + PGlite, Lubuntu 26.04 (LXQt + systemd + Chromium Kiosk).

**Spec:** [`docs/superpowers/specs/2026-11-22-unified-kiosk-course-schedules-design.md`](../specs/2026-11-22-unified-kiosk-course-schedules-design.md)

## Global Constraints

- **Target Hardware:** Beelink T4 Pro Mini PC (Intel Celeron N3350, 4GB RAM, 64GB eMMC) + Monitor Touchscreen di Lubuntu 26.04 LTS; konsumsi RAM sistem total $\le 1.3\text{ GB}$.
- **Zero-Scroll Public Display:** Semua 7 *scene* publik wajib pas dalam satu layar penuh (`100vh`) tanpa *scrollbar* vertikal maupun horizontal pada monitor 1080p/4K.
- **Touch Target Floor:** Seluruh elemen interaktif layar sentuh (filter hari, filter ruangan, pill navigasi slide, paginasi manual, tombol tutup modal) wajib memiliki ukuran minimal `44x44px` (`min-h-[44px] min-w-[44px]`) dan `touch-action: manipulation`.
- **2-Row Filter Cap on Slide 7:** Hanya 2 baris filter pada kiosk (Hari: `Hari Ini`, `Senin`–`Sabtu`; Ruangan: `Semua`, `R106`–`R308`); `semester` ditampilkan sebagai *badge* pada kartu jadwal, bukan baris filter ketiga.
- **Card Capacity:** Slide 7 (`CourseScheduleScene`) menampilkan maksimal `6` kartu per layar (grid `2x3`).
- **Idle Reset:** Timeout `45_000 ms` (45 detik) tanpa interaksi wajib menutup modal, mereset seluruh filter ke bawaan (`TODAY`, `ALL`), mengembalikan ke Slide 1 (`OVERVIEW`), dan melanjutkan rotasi otomatis (`15_000 ms` per *scene*).
- **RBAC & Privacy:** `EDITOR` dapat membuat/mengubah jadwal tetapi dipaksa `isPublished: false` dan tidak dapat memublikasikan/menghapus/menjalankan seed; `ADMIN`/`SUPER_ADMIN` berwenang penuh; seluruh mutasi tercatat di `audit_logs`; jangan memodifikasi aturan larangan NIM/NIP.
- **CPU Efficiency:** Jam detik 1 Hz tetap terisolasi di `BrandedHeader`; pembaruan status kelas (`Sedang Berlangsung` / `Akan Datang` / `Selesai`) di `PublicDashboardSlideshow` cukup menyegarkan `liveNow` setiap `30_000 ms` agar tidak membebani dual-core Celeron N3350.
- **Shell & Encoding:** File skrip Linux (`.sh`) wajib berformat line ending `LF` (`\n`), bukan `CRLF`.

## Review Focus

1. **Timezone WIB (`Asia/Jakarta`) di perbatasan tengah malam UTC:** Saat waktu server berada pada UTC 17:00–23:59 (yaitu 00:00–06:59 WIB hari berikutnya), penentuan hari aktif (`Hari Ini`) dan status `ONGOING`/`UPCOMING`/`FINISHED` wajib mengikuti zona waktu `Asia/Jakarta`, bukan waktu lokal mesin/UTC. *(Diujikan pada Task 3)*
2. **Hari Minggu (`MINGGU`) tanpa kuliah:** `dayOfWeekEnum` hanya memuat `SENIN`–`SABTU`. Pada hari Minggu saat `selectedDayFilter === "TODAY"`, layar tidak boleh error atau menampilkan hasil mentah kosong tanpa konteks, melainkan banner *"Hari Ini Tidak Ada Perkuliahan (Hari Libur)"* dengan tombol 1-tap *"Lihat Jadwal Hari Senin"*. *(Diujikan pada Task 3, Task 4, Task 5)*
3. **Validasi rentang waktu `HH:mm` terbalik atau tidak valid:** Input jam seperti `"25:00"`, `"8:00"` non-padded, atau `endTime <= startTime` (mis. `14:30` s.d. `13:00`) wajib ditolak oleh Zod validator sebelum menyentuh database. *(Diujikan pada Task 1)*
4. **Reset indeks halaman saat filter berubah dalam mode jeda sentuh:** Jika pengguna sedang di halaman 2 pada `Semua Ruangan` lalu mengetuk filter ruangan `R108` yang hanya memiliki 1 kelas, indeks halaman manual wajib langsung direset ke `0` agar tidak menampilkan grid kosong. *(Diujikan pada Task 5)*
5. **Isolasi Draf & Hak Akses `EDITOR` pada jadwal kuliah:** Mutasi `courseSchedules.create` oleh `EDITOR` dengan `isPublished: true` wajib dipaksa menjadi `false`; `EDITOR` ditolak (`FORBIDDEN`) saat memanggil `setPublished`, `delete`, atau `seedDummy`; dan `publicDashboard.courseSchedules` hanya mengembalikan rekaman `isPublished = true`. *(Diujikan pada Task 2)*

---

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `src/server/db/schema.ts` | Modify | Tambah `dayOfWeekEnum`, tabel `courseSchedules` beserta indeks & check constraint, dan tipe `DayOfWeek`. |
| `drizzle/0005_*.sql` + `drizzle/meta/*` | Create | Migrasi SQL PostgreSQL untuk `day_of_week` enum dan tabel `course_schedules`. |
| `src/server/security/audit.ts` | Modify | Tambah `"COURSE_SCHEDULE"` ke union `AuditLogInput["entityType"]`. |
| `src/lib/validators/index.ts` | Modify | Konstanta `COURSE_DAYS`, `COURSE_ROOMS`, serta seluruh skema Zod & DTO jadwal kuliah. |
| `src/server/db/seed-course-schedules.ts` | Create | Definisi 5 data *dummy* awal + fungsi idempoten `seedDummyCourseSchedules(db)`. |
| `scripts/seed-course-schedules.ts` | Create | Skrip CLI untuk mengisi 5 data *dummy* jadwal ke PostgreSQL. |
| `package.json` | Modify | Tambah skrip `db:seed-schedules`. |
| `src/server/api/routers/courseSchedules.ts` | Create | Router tRPC CRUD admin (`list`, `count`, `getById`, `stats`, `create`, `update`, `setPublished`, `delete`, `seedDummy`). |
| `src/server/api/root.ts` | Modify | Registrasikan `courseSchedules: courseSchedulesRouter`. |
| `src/server/api/routers/publicDashboard.ts` | Modify | Tambah prosedur `courseSchedules` publik + perhitungkan `courseSchedules.updatedAt` di `buildOverview`. |
| `src/components/public/design-tokens.ts` | Modify | Tambah `COURSE_SCHEDULES_PAGE_SIZE = 6`, `IDLE_TIMEOUT_MS = 45_000`, dan Scene 7 `COURSE_SCHEDULE`. |
| `src/components/public/course-schedule-utils.ts` | Create | Fungsi murni konversi WIB, status kelas real-time, dan filter/pengurutan jadwal. |
| `src/components/public/slideshow-engine.ts` | Modify | Ekstensi rotasi ke 7 *scene*, `courseSchedulePageIndex`, `jumpToScene`, dan `resetToAttractState`. |
| `src/components/public/kiosk-hybrid-state.ts` | Create | Pure state reducer `kioskHybridReducer` untuk interaksi sentuh, filter, modal pengumuman, paginasi manual, dan idle reset. |
| `src/components/public/CourseScheduleScene.tsx` | Create | Komponen Slide 7 (grid 2x3, filter Hari & Ruangan 2 baris, badge status real-time, banner Minggu, paginasi sentuh). |
| `src/components/public/AnnouncementsScene.tsx` | Modify | Jadikan kartu pengumuman dapat disentuh (`onSelectAnnouncement`) + paginasi manual saat mode jeda. |
| `src/components/public/BrandedHeader.tsx` | Modify | Jadikan pill indikator *scene* tombol sentuh `min-h-[44px]` + indikator mode jeda & tombol *Lanjutkan Rotasi*. |
| `src/components/public/PublicDashboardSlideshow.tsx` | Modify | Integrasikan query jadwal, state *Kiosk Hybrid*, idle timer 45 detik, modal baca pengumuman, dan Slide 7. |
| `src/styles/globals.css` | Modify | Tambah aturan `touch-action: manipulation` untuk respons sentuh instan tanpa *double-tap zoom*. |
| `src/app/admin/(protected)/jadwal/page.tsx` | Create | Halaman CRUD admin jadwal kuliah (gaya terang konsisten dengan `AdminShell` & `/admin/mahasiswa`). |
| `src/components/admin/AdminShell.tsx` | Modify | Tambah menu navigasi `Jadwal Kuliah` (`/admin/jadwal`). |
| `src/app/admin/(protected)/page.tsx` | Modify | Tambah ringkasan & tautan cepat modul Jadwal Kuliah di beranda admin. |
| `deploy/t4pro-lubuntu/setup-lubuntu.sh` | Create | Auto-installer Lubuntu 26.04 x86_64 (PostgreSQL tuned 4GB, Node standalone systemd, Chromium GPU + touch kiosk). |
| `scripts/prepare-t4pro-bundle.ps1` | Create | Pengemas *pre-compiled standalone bundle* untuk flashdisk USB / transfer offline ke T4 Pro. |
| `scripts/update-t4pro-wifi.ps1` & `UPDATE-T4PRO-WIFI.bat` | Create | Skrip 1-klik update paket standalone & migrasi DB via WiFi/SSH ke T4 Pro. |
| `docs/PANDUAN-T4PRO-LUBUNTU.md` | Create | Panduan instalasi, kalibrasi layar sentuh, alokasi RAM, dan perawatan Mini PC T4 Pro. |

---

### Task 1: Database Schema, Migration, Validators & Dummy Seed Helper

**Files:**
- Modify: `src/server/db/schema.ts`
- Modify: `src/server/security/audit.ts`
- Modify: `src/lib/validators/index.ts`
- Create: `src/server/db/seed-course-schedules.ts`
- Create: `scripts/seed-course-schedules.ts`
- Modify: `package.json`
- Create: `drizzle/0005_*.sql` (generated via `pnpm db:generate`)
- Test: `src/server/__tests__/course-schedules-schema.test.ts`

**Interfaces:**
- Consumes: `pgEnum`, `pgTable`, `check`, `index` dari `drizzle-orm/pg-core`; `z` dari `zod`.
- Produces:
  - `src/server/db/schema.ts`: `dayOfWeekEnum`, `courseSchedules`, `type DayOfWeek`
  - `src/server/security/audit.ts`: `AuditLogInput["entityType"]` mencakup `"COURSE_SCHEDULE"`
  - `src/lib/validators/index.ts`: `COURSE_DAYS`, `COURSE_ROOMS`, `dayOfWeekSchema`, `timeSlotSchema`, `courseScheduleIdSchema`, `listCourseSchedulesInputSchema`, `createCourseScheduleSchema`, `updateCourseScheduleSchema`, `setPublishedCourseScheduleSchema`, `publicCourseScheduleDtoSchema`, `type DayOfWeekType`, `type PublicCourseScheduleDTO`
  - `src/server/db/seed-course-schedules.ts`: `DUMMY_COURSE_SCHEDULES` (5 item sesuai spec), `seedDummyCourseSchedules(db)` mengembalikan `Promise<{ insertedCount: number; skipped: boolean }>`

- [ ] **Step 1: Write the failing schema, validator, and seed test**

Create `src/server/__tests__/course-schedules-schema.test.ts` testing:
1. `createCourseScheduleSchema` accepts valid payload (`dayOfWeek: "SENIN"`, `startTime: "13:00"`, `endTime: "14:30"`, `courseName: "Kecerdasan Buatan"`, `className: "B"`, `roomName: "R108"`, `lecturerName: "Dr. Ahmad Fauzi, M.Kom."`, `semester: 5`, `academicYear: "2026/2027"`, `isPublished: true`).
2. `createCourseScheduleSchema` rejects malformed time (`"8:00"`, `"25:99"`), inverted range (`startTime: "14:30"`, `endTime: "13:00"`), equal range (`startTime: "13:00"`, `endTime: "13:00"`), and out-of-range semester (`0` or `9`). *(Review Focus #3)*
3. Applying all SQL migrations in `drizzle/` onto a fresh `PGlite` instance creates `"course_schedules"` without error.
4. `seedDummyCourseSchedules(testDb)` inserts exactly `5` published rows (`Kecerdasan Buatan` B `R108` `13:00`–`14:30`, `Sistem Biomedis` A `R109` `13:00`–`14:30`, `Kalkulus` A `R106` `08:00`–`09:30`, `Desain Basis Data` B `R304` `09:45`–`11:15`, `Sistem Operasi` A `R305` `14:45`–`16:15`), and calling it a second time returns `{ insertedCount: 0, skipped: true }` without duplicating rows.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/__tests__/course-schedules-schema.test.ts`
Expected: FAIL because `courseSchedules`, `createCourseScheduleSchema`, and `seedDummyCourseSchedules` do not exist yet.

- [ ] **Step 3: Implement schema, audit entity type, validators, seed helper, and Drizzle migration**

1. In `src/server/db/schema.ts`: add `dayOfWeekEnum` (`"SENIN"`, `"SELASA"`, `"RABU"`, `"KAMIS"`, `"JUMAT"`, `"SABTU"`), `type DayOfWeek`, and `courseSchedules` table matching Spec §4.1 with indexes `course_schedules_day_idx`, `course_schedules_room_idx`, `course_schedules_is_published_idx`, `course_schedules_published_day_start_idx(isPublished, dayOfWeek, startTime)`, and SQL check constraint `course_schedules_semester_range_chk` (`semester IS NULL OR (semester >= 1 AND semester <= 8)`).
2. In `src/server/security/audit.ts`: add `"COURSE_SCHEDULE"` to `AuditLogInput["entityType"]`.
3. In `src/lib/validators/index.ts`:
   - `COURSE_DAYS = ["SENIN", "SELASA", "RABU", "KAMIS", "JUMAT", "SABTU"] as const`
   - `COURSE_ROOMS = ["R106", "R107", "R108", "R109", "R303", "R304", "R305", "R306", "R307", "R308"] as const`
   - `dayOfWeekSchema = z.enum(COURSE_DAYS)`
   - `timeSlotSchema`: regex `/^([01]\d|2[0-3]):([0-5]\d)$/` ("Format jam harus HH:mm, contoh 08:00")
   - `createCourseScheduleSchema` (`.strict()`) with `.refine((d) => d.endTime > d.startTime, { message: "Jam selesai harus lebih besar dari jam mulai", path: ["endTime"] })`, `semester: z.number().int().min(1).max(8).nullable().optional()`, `academicYear: z.string().trim().max(32).nullable().optional()`, `isPublished: z.boolean().default(false)`
   - `updateCourseScheduleSchema`: `createCourseScheduleSchema` fields without `isPublished` plus `id: z.string().uuid()`, with the same `endTime > startTime` refinement
   - `listCourseSchedulesInputSchema`: optional `{ search, dayOfWeek, roomName, isPublished, limit (default 50), offset (default 0) }`
   - `setPublishedCourseScheduleSchema`, `courseScheduleIdSchema`, `publicCourseScheduleDtoSchema` (strict: `id`, `dayOfWeek`, `startTime`, `endTime`, `courseName`, `className`, `roomName`, `lecturerName`, `semester`, `academicYear`).
4. In `src/server/db/seed-course-schedules.ts`: export `DUMMY_COURSE_SCHEDULES` (5 rekaman `isPublished: true`, `academicYear: "2026/2027"`):
   - `SENIN`, `08:00`–`09:30`, `Kalkulus`, kelas `A`, ruang `R106`, semester `1`
   - `SENIN`, `13:00`–`14:30`, `Kecerdasan Buatan`, kelas `B`, ruang `R108`, semester `5`
   - `SENIN`, `13:00`–`14:30`, `Sistem Biomedis`, kelas `A`, ruang `R109`, semester `5`
   - `SELASA`, `09:45`–`11:15`, `Desain Basis Data`, kelas `B`, ruang `R304`, semester `3`
   - `RABU`, `14:45`–`16:15`, `Sistem Operasi`, kelas `A`, ruang `R305`, semester `3`
   dan fungsi idempoten `seedDummyCourseSchedules(db)` yang memeriksa `count()` terlebih dahulu dan hanya melakukan `insert` bila tabel masih kosong (`count === 0`).
5. Create `scripts/seed-course-schedules.ts` calling `seedDummyCourseSchedules(db)` and add `"db:seed-schedules": "tsx --env-file=.env scripts/seed-course-schedules.ts"` in `package.json`.
6. Generate migration: run `pnpm db:generate`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/server/__tests__/course-schedules-schema.test.ts`
Expected: PASS (all assertions green).

- [ ] **Step 5: Commit**

```bash
git add drizzle package.json scripts/seed-course-schedules.ts src/lib/validators/index.ts src/server/db/schema.ts src/server/db/seed-course-schedules.ts src/server/security/audit.ts src/server/__tests__/course-schedules-schema.test.ts
git commit -m "feat(db): add course_schedules schema, migration, validators, and 5 dummy seed helper"
```

---

### Task 2: tRPC Routers (`courseSchedules` Admin CRUD & `publicDashboard.courseSchedules`)

**Files:**
- Create: `src/server/api/routers/courseSchedules.ts`
- Modify: `src/server/api/root.ts`
- Modify: `src/server/api/routers/publicDashboard.ts`
- Test: `src/server/__tests__/course-schedules-router.test.ts`

**Interfaces:**
- Consumes: `courseSchedules` dari `src/server/db/schema.ts`; skema Zod jadwal dari `src/lib/validators/index.ts`; `seedDummyCourseSchedules` dari `src/server/db/seed-course-schedules.ts`; `writeAuditLog`, `canPublishOrDeleteContent`.
- Produces:
  - `api.courseSchedules`: `list`, `count`, `getById`, `stats` (`{ total, published, draft, recentChanges }`), `create`, `update`, `setPublished`, `delete`, `seedDummy`
  - `api.publicDashboard.courseSchedules`: mengembalikan `PublicCourseScheduleDTO[]` terpublikasi terurut hari (`SENIN`..`SABTU`) lalu `startTime` asc, lalu `roomName` asc.

- [ ] **Step 1: Write the failing router & RBAC integration test**

Create `src/server/__tests__/course-schedules-router.test.ts` using PGlite + Drizzle migrations testing:
1. **RBAC EDITOR isolation *(Review Focus #5)***: `EDITOR` calls `courseSchedules.create` with `isPublished: true` → persisted with `isPublished: false`; `EDITOR` can `update` and `list`; `EDITOR` receives `FORBIDDEN` on `setPublished`, `delete`, and `seedDummy`.
2. **ADMIN CRUD & Public Filtering *(Review Focus #5)***: `ADMIN` creates 1 draft and 2 published schedules (on `SELASA` `08:00` and `SENIN` `13:00` & `08:00`); `publicDashboard.courseSchedules` returns only the 2 published schedules ordered `SENIN` `08:00` → `SENIN` `13:00` (or `SELASA` after `SENIN`), never drafts; `list` filters accurately by `search` (matching `courseName` or `lecturerName`), `dayOfWeek`, `roomName`, and `isPublished`; `setPublished` and `delete` update visibility and write entries to `audit_logs` with `entityType: "COURSE_SCHEDULE"`.
3. **Admin `seedDummy` & `stats`**: `ADMIN` calls `courseSchedules.seedDummy()` on empty table → returns `{ insertedCount: 5, skipped: false }`; second call returns `{ insertedCount: 0, skipped: true }`; `courseSchedules.stats()` reports `{ total: 5, published: 5, draft: 0 }`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/__tests__/course-schedules-router.test.ts`
Expected: FAIL because `courseSchedules` router and `publicDashboard.courseSchedules` are not registered.

- [ ] **Step 3: Implement `courseSchedulesRouter`, wire into `appRouter`, and extend `publicDashboardRouter`**

1. Create `src/server/api/routers/courseSchedules.ts` modeled after `announcements.ts` and `graduates.ts`:
   - `buildCourseScheduleWhereClause`: filters `isPublished`, `dayOfWeek`, `roomName` (exact match), and `search` (`or(ilike(courseSchedules.courseName, q), ilike(courseSchedules.lecturerName, q), ilike(courseSchedules.roomName, q))`).
   - Deterministic day ordering using SQL `CASE` (`SENIN`=1..`SABTU`=6) + `asc(courseSchedules.startTime)` + `asc(courseSchedules.roomName)`.
   - `stats` (`editorProcedure`): returns `{ total, published, draft, recentChanges }` (top 5 by `desc(updatedAt)`), matching `graduates.stats` for the admin overview page.
   - `seedDummy` (`adminProcedure`): calls `seedDummyCourseSchedules(ctx.db)` and logs `SEED_DUMMY_COURSE_SCHEDULES` when `insertedCount > 0`.
2. Register `courseSchedules: courseSchedulesRouter` in `src/server/api/root.ts`.
3. In `src/server/api/routers/publicDashboard.ts`:
   - Add `courseSchedules` (`publicProcedure.output(z.array(publicCourseScheduleDtoSchema))`) querying `isPublished = true`, ordered by day rank (`SENIN`..`SABTU`), `startTime` asc, `roomName` asc.
   - Include latest published `courseSchedules.updatedAt` in `buildOverview` `lastUpdatedAt` calculation (guarded so empty table keeps `lastUpdatedAt: null`).

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm vitest run src/server/__tests__/course-schedules-router.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/api/routers/courseSchedules.ts src/server/api/root.ts src/server/api/routers/publicDashboard.ts src/server/__tests__/course-schedules-router.test.ts
git commit -m "feat(api): add courseSchedules admin CRUD router and publicDashboard.courseSchedules"
```

---

### Task 3: Schedule Timezone/Status Utilities & 7-Scene Slideshow Engine

**Files:**
- Modify: `src/components/public/design-tokens.ts`
- Create: `src/components/public/course-schedule-utils.ts`
- Modify: `src/components/public/slideshow-engine.ts`
- Modify: `src/server/__tests__/phase4-public-dashboard.test.ts`
- Test: `src/server/__tests__/course-schedule-utils.test.ts`

**Interfaces:**
- Consumes: `DayOfWeekType`, `PublicCourseScheduleDTO`, `COURSE_DAYS` dari `src/lib/validators/index.ts`.
- Produces:
  - `src/components/public/design-tokens.ts`: `COURSE_SCHEDULES_PAGE_SIZE = 6`, `IDLE_TIMEOUT_MS = 45_000`, `PublicSceneId` mencakup `"COURSE_SCHEDULE"`, `PUBLIC_SCENE_DEFINITIONS` (7 *scene*).
  - `src/components/public/course-schedule-utils.ts`:
    - `type PublicDayFilter = "TODAY" | DayOfWeekType`
    - `type ScheduleLiveStatus = "ONGOING" | "UPCOMING" | "FINISHED" | "OTHER_DAY"`
    - `DAY_LABELS: Record<DayOfWeekType | "MINGGU", string>`
    - `parseTimeToMinutes(hhmm: string): number`
    - `getJakartaDayAndMinutes(date: Date): { dayOfWeek: DayOfWeekType | "MINGGU"; minutesSinceMidnight: number; dayLabel: string }`
    - `getScheduleLiveStatus(schedule: Pick<PublicCourseScheduleDTO, "dayOfWeek" | "startTime" | "endTime">, now: Date): ScheduleLiveStatus`
    - `resolveEffectiveDay(dayFilter: PublicDayFilter, now: Date): DayOfWeekType | "MINGGU"`
    - `filterCourseSchedules(items: readonly PublicCourseScheduleDTO[], params: { dayFilter: PublicDayFilter; roomFilter: string; now: Date }): PublicCourseScheduleDTO[]`
  - `src/components/public/slideshow-engine.ts`:
    - `SlideshowState` ditambah `courseSchedulePageIndex: number`
    - `SlideshowDatasetCounts` ditambah `courseSchedulesCount?: number`
    - `SlideshowPageSizes` ditambah `courseSchedulesPageSize?: number`
    - `jumpToScene(current: SlideshowState, sceneId: PublicSceneId): SlideshowState`
    - `resetToAttractState(current: SlideshowState): SlideshowState` (mengembalikan `sceneIndex: 0`, mempertahankan atau mereset page index `0` sehingga siklus attract selalu bersih dari halaman awal Slide 1).

- [ ] **Step 1: Write the failing unit tests for WIB status, Sunday handling, filtering, and 7-scene engine**

Create `src/server/__tests__/course-schedule-utils.test.ts` testing:
1. **WIB UTC+7 midnight crossover *(Review Focus #1)***: `new Date("2026-11-22T17:30:00.000Z")` (Sunday UTC = Monday `00:30` WIB) resolves to `{ dayOfWeek: "SENIN", minutesSinceMidnight: 30, dayLabel: "Senin" }`.
2. **Sunday detection *(Review Focus #2)***: `new Date("2026-11-22T06:00:00.000Z")` (`13:00` WIB Sunday) resolves to `dayOfWeek: "MINGGU"`, and `filterCourseSchedules(items, { dayFilter: "TODAY", roomFilter: "ALL", now })` returns `[]` cleanly without throwing.
3. **Live status boundaries *(Review Focus #1)***: For a `SENIN` `13:00`–`14:30` class:
   - Monday `12:59` WIB (`05:59Z`) → `"UPCOMING"`
   - Monday `13:00` WIB (`06:00Z`) → `"ONGOING"` (start inclusive)
   - Monday `14:29` WIB (`07:29Z`) → `"ONGOING"`
   - Monday `14:30` WIB (`07:30Z`) → `"FINISHED"` (end exclusive)
   - Tuesday `13:30` WIB (`06:30Z`) → `"OTHER_DAY"`
4. **Day + Room filtering**: `dayFilter: "SENIN"` + `roomFilter: "R108"` returns only matching items sorted by `startTime` asc; `roomFilter: "ALL"` returns all rooms for that day.
5. **7-scene slideshow rotation & jumps**: 7 transitions complete 1 cycle back to `OVERVIEW`; `courseSchedulePageIndex` advances fairly across cycles; `jumpToScene(state, "COURSE_SCHEDULE")` sets `sceneIndex: 6`; `resetToAttractState(state)` returns `sceneIndex: 0` with `courseSchedulePageIndex: 0`.

Also update `src/server/__tests__/phase4-public-dashboard.test.ts`:
- Truncate `"course_schedules"` and `"announcements"` inside `truncateAllTables`.
- Update the 3-cycle loop from `18` steps (6 scenes) to `21` steps (7 scenes) and include `courseSchedulesCount: 14` (3 pages at pageSize=6) in `counts`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/server/__tests__/course-schedule-utils.test.ts src/server/__tests__/phase4-public-dashboard.test.ts`
Expected: FAIL (`course-schedule-utils.ts` missing, scene count is still 6).

- [ ] **Step 3: Implement `design-tokens.ts`, `course-schedule-utils.ts`, and `slideshow-engine.ts`**

1. Update `src/components/public/design-tokens.ts` with `COURSE_SCHEDULES_PAGE_SIZE = 6`, `IDLE_TIMEOUT_MS = 45_000`, `"COURSE_SCHEDULE"` in `PublicSceneId`, and Scene 7 definition (`orderNumber: 7`, `shortLabel: "Jadwal"`, `title: "Jadwal Mata Kuliah Program Studi"`, `subtitle: "Jadwal perkuliahan harian, ruangan, dan dosen pengampu Teknik Informatika"`).
2. Implement `src/components/public/course-schedule-utils.ts` using `Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jakarta", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })` (never local `getDay()`/`getHours()`) so UTC servers and tests behave identically to WIB.
3. Update `src/components/public/slideshow-engine.ts` with `courseSchedulePageIndex`, fair round-robin advance on `"COURSE_SCHEDULE"`, `jumpToScene`, and `resetToAttractState`.

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm vitest run src/server/__tests__/course-schedule-utils.test.ts src/server/__tests__/phase4-public-dashboard.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/public/design-tokens.ts src/components/public/course-schedule-utils.ts src/components/public/slideshow-engine.ts src/server/__tests__/course-schedule-utils.test.ts src/server/__tests__/phase4-public-dashboard.test.ts
git commit -m "feat(public): add WIB schedule status utils and 7-scene slideshow engine"
```

---

### Task 4: Slide 7 (`CourseScheduleScene`), Tappable `AnnouncementsScene`, and Touch `BrandedHeader`

**Files:**
- Create: `src/components/public/CourseScheduleScene.tsx`
- Modify: `src/components/public/AnnouncementsScene.tsx`
- Modify: `src/components/public/BrandedHeader.tsx`
- Test: `src/server/__tests__/public-kiosk-scenes.test.ts`

**Interfaces:**
- Consumes: `ThemeTokens`, `THEME_CONFIGS`, `COURSE_SCHEDULES_PAGE_SIZE`, `PUBLIC_SCENE_DEFINITIONS` dari `design-tokens.ts`; `PublicCourseScheduleDTO`, `COURSE_DAYS`, `COURSE_ROOMS` dari `validators`; helpers dari `course-schedule-utils.ts`; `getPaginatedSlice` dari `slideshow-engine.ts`.
- Produces:
  - `CourseScheduleScene`: props `{ schedules: PublicCourseScheduleDTO[]; pageIndex?: number; dayFilter?: PublicDayFilter; roomFilter?: string; now?: Date; isPaused?: boolean; themeTokens?: ThemeTokens; onDayFilterChange?: (day: PublicDayFilter) => void; onRoomFilterChange?: (room: string) => void; onPageChange?: (pageIndex: number) => void; }`
  - `AnnouncementsScene`: extended optional props `{ onSelectAnnouncement?: (item: PublicAnnouncementItem) => void; isPaused?: boolean; onPageChange?: (pageIndex: number) => void; }`
  - `BrandedHeader`: extended optional props `{ isPaused?: boolean; onSelectScene?: (sceneId: PublicSceneId) => void; onResumeSlideshow?: () => void; }`

- [ ] **Step 1: Write the failing SSR component rendering tests**

Create `src/server/__tests__/public-kiosk-scenes.test.ts` using `renderToStaticMarkup` testing:
1. `CourseScheduleScene` on Monday `13:30` WIB (`2026-11-23T06:30:00.000Z`) renders:
   - 2 filter rows: Day pills (`Hari Ini`, `Senin`, `Selasa`, `Rabu`, `Kamis`, `Jumat`, `Sabtu`) and Room pills (`Semua`, `R106`..`R308`), all containing `min-h-[44px]`.
   - Active class (`13:00`–`14:30`) with badge `"Sedang Berlangsung"`, upcoming class (`14:45`–`16:15`) with `"Akan Datang"`, finished class (`08:00`–`09:30`) with `"Selesai"`, and Semester badge (`"Semester 5"`).
   - No 3rd Semester filter row (no `"Semua Semester"` button).
2. `CourseScheduleScene` on Sunday (`2026-11-22T06:00:00.000Z`) with `dayFilter="TODAY"` renders `"Hari Ini Tidak Ada Perkuliahan (Hari Libur)"` and a touch button `"Lihat Jadwal Hari Senin"`. *(Review Focus #2)*
3. `CourseScheduleScene` with 8 matching schedules renders at most 6 cards and includes manual touch pagination buttons (`"Sebelumnya"` / `"Berikutnya"`) with `min-h-[44px]` and `"Halaman 1 / 2"`.
4. `CourseScheduleScene` renders cleanly under `LIGHT`, `DARK`, and `MONOCHROME` themes.
5. `AnnouncementsScene` with `onSelectAnnouncement` renders clickable cards with `"Ketuk untuk baca lengkap"` cue, and `BrandedHeader` with `isPaused={true}` renders `"Mode Interaktif"` and `"Lanjutkan Rotasi"` button alongside tappable 7 scene buttons.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/__tests__/public-kiosk-scenes.test.ts`
Expected: FAIL because `CourseScheduleScene.tsx` does not exist and new props are not wired.

- [ ] **Step 3: Implement `CourseScheduleScene.tsx`, update `AnnouncementsScene.tsx`, and update `BrandedHeader.tsx`**

1. Create `src/components/public/CourseScheduleScene.tsx`:
   - Zero-scroll flex column (`flex min-h-0 flex-1 flex-col justify-between gap-2.5 overflow-hidden`).
   - Top compact 2-row touch filter strip (each button `min-h-[44px] px-3.5 text-xs sm:text-sm font-bold rounded-lg`):
     - Row 1: `Hari Ini` + `Senin`, `Selasa`, `Rabu`, `Kamis`, `Jumat`, `Sabtu` (plus active day badge & total matching classes).
     - Row 2: `Semua` + rooms (`COURSE_ROOMS`, plus any extra custom room names present in `schedules` deduplicated and capped sensibly so horizontal overflow never happens).
   - Sunday empty state when `effectiveDay === "MINGGU"` and `pageItems.length === 0`: clear card *"Hari Ini Tidak Ada Perkuliahan (Hari Libur)"* with a large `min-h-[48px]` button *"Lihat Jadwal Hari Senin"* calling `onDayFilterChange?.("SENIN")`.
   - Standard empty state when a weekday/room filter has 0 classes: *"Tidak Ada Jadwal Kuliah"* with reset button *"Tampilkan Semua Ruangan"* when `roomFilter !== "ALL"`.
   - 2x3 Card Grid (`grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3`): each card displays high-contrast room badge (`R108`), time (`13:00 – 14:30 WIB`), real-time status badge (`Sedang Berlangsung` emerald pulse dot / `Akan Datang` sky / `Selesai` neutral), course name + class pill (`Kelas B`), lecturer name, and optional `Semester X` pill.
   - Footer pagination bar when `totalPages > 1`: shows `Halaman {safePageIndex + 1} / {totalPages}` and touch buttons `Sebelumnya` / `Berikutnya` (`min-h-[44px]`) calling `onPageChange`.
2. Modify `src/components/public/AnnouncementsScene.tsx`:
   - Keep zero-scroll 3-column grid; wrap card body inside a `<button type="button">` (or render card with `onClick` + keyboard Enter/Space support when `onSelectAnnouncement` is passed) with subtle `"Ketuk untuk baca lengkap →"` footer hint so tapping opens the full reader modal.
   - Add touch `Sebelumnya` / `Berikutnya` (`min-h-[44px]`) buttons in the pagination bar when `totalPages > 1 && onPageChange`.
3. Modify `src/components/public/BrandedHeader.tsx`:
   - Replace the `aria-hidden="true"` `<div>` scene indicators with accessible `<button type="button">` pills (`min-h-[44px] px-3 py-1.5`) calling `onSelectScene?.(scene.id)` with `aria-current={isActive ? "step" : undefined}` (keeps rendering cleanly when `onSelectScene` is omitted for backward compatibility with `phase4-public-dashboard.test.ts`!).
   - When `isPaused` is true, display a prominent high-contrast pill `"Mode Interaktif"` + touch button `"Lanjutkan Rotasi"` (`min-h-[44px]`) calling `onResumeSlideshow?.()`.

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm vitest run src/server/__tests__/public-kiosk-scenes.test.ts src/server/__tests__/phase4-public-dashboard.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/public/CourseScheduleScene.tsx src/components/public/AnnouncementsScene.tsx src/components/public/BrandedHeader.tsx src/server/__tests__/public-kiosk-scenes.test.ts
git commit -m "feat(public): add CourseScheduleScene and touch-interactive header and announcements"
```

---

### Task 5: Unified Kiosk Hybrid State Machine & Orchestrator (`PublicDashboardSlideshow`)

**Files:**
- Create: `src/components/public/kiosk-hybrid-state.ts`
- Modify: `src/components/public/PublicDashboardSlideshow.tsx`
- Modify: `src/styles/globals.css`
- Test: `src/server/__tests__/kiosk-hybrid-controller.test.ts`

**Interfaces:**
- Consumes: `SlideshowState`, `SlideshowDatasetCounts`, `advanceSlideshowState`, `createInitialSlideshowState`, `jumpToScene`, `resetToAttractState` dari `slideshow-engine.ts`; `PublicDayFilter` dari `course-schedule-utils.ts`; `PublicAnnouncementItem` dari `AnnouncementsScene.tsx`; `IDLE_TIMEOUT_MS` dari `design-tokens.ts`.
- Produces:
  - `src/components/public/kiosk-hybrid-state.ts`:
    - `KioskHybridState` (`slideshow`, `isPaused`, `selectedDayFilter`, `selectedRoomFilter`, `manualSchedulePageIndex`, `manualAnnouncementPageIndex`, `activeModalAnnouncement`)
    - `KioskHybridAction` union (`AUTO_TICK`, `TOUCH_INTERACT`, `SELECT_SCENE`, `SET_DAY_FILTER`, `SET_ROOM_FILTER`, `SET_SCHEDULE_PAGE`, `SET_ANNOUNCEMENT_PAGE`, `OPEN_ANNOUNCEMENT_MODAL`, `CLOSE_ANNOUNCEMENT_MODAL`, `IDLE_TIMEOUT_RESET`, `RESUME_SLIDESHOW`)
    - `createInitialKioskHybridState(): KioskHybridState`
    - `kioskHybridReducer(state: KioskHybridState, action: KioskHybridAction): KioskHybridState`

- [ ] **Step 1: Write the failing Kiosk Hybrid state machine unit tests**

Create `src/server/__tests__/kiosk-hybrid-controller.test.ts` testing:
1. `AUTO_TICK` advances `slideshow` normally while `isPaused === false`, and is a no-op while `isPaused === true`.
2. `TOUCH_INTERACT` sets `isPaused = true` without altering active scene.
3. `SELECT_SCENE("COURSE_SCHEDULE")` jumps to scene index `6`, sets `isPaused = true`, closes any open modal, and resets `manualSchedulePageIndex = 0`.
4. **Filter change resets stale page index *(Review Focus #4)***: Starting from `manualSchedulePageIndex: 2`, dispatching `SET_ROOM_FILTER("R108")` or `SET_DAY_FILTER("SENIN")` sets `isPaused = true` and resets `manualSchedulePageIndex` to `0`.
5. `OPEN_ANNOUNCEMENT_MODAL(item)` opens modal and pauses; `CLOSE_ANNOUNCEMENT_MODAL` closes modal while remaining paused until idle timeout or explicit resume.
6. `IDLE_TIMEOUT_RESET` sets `isPaused = false`, `selectedDayFilter = "TODAY"`, `selectedRoomFilter = "ALL"`, `manualSchedulePageIndex = 0`, `manualAnnouncementPageIndex = 0`, `activeModalAnnouncement = null`, and resets `slideshow.sceneIndex` to `0` (`OVERVIEW`).
7. `RESUME_SLIDESHOW` resumes cleanly (`isPaused = false`, closes modal, resets filters).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/__tests__/kiosk-hybrid-controller.test.ts`
Expected: FAIL (`kiosk-hybrid-state.ts` does not exist).

- [ ] **Step 3: Implement `kiosk-hybrid-state.ts`, wire `PublicDashboardSlideshow.tsx`, and optimize touch CSS**

1. Create `src/components/public/kiosk-hybrid-state.ts` implementing `createInitialKioskHybridState` and `kioskHybridReducer`.
2. Update `src/components/public/PublicDashboardSlideshow.tsx`:
   - Add `courseSchedules?: PublicCourseScheduleDTO[]` to `PublicDashboardInitialData` and subscribe to `api.publicDashboard.courseSchedules.useQuery(undefined, { ...queryOptions, initialData: initialData?.courseSchedules, placeholderData: (prev) => prev })`.
   - Replace plain `slideshowState` with `useReducer(kioskHybridReducer, undefined, createInitialKioskHybridState)`.
   - Maintain a lightweight `liveNow` state refreshed every `30_000 ms` (not 1s) for real-time schedule status badges.
   - Maintain `idleTimerRef`: helper `bumpIdleTimer()` clears previous timeout and schedules `window.setTimeout(() => dispatch({ type: "IDLE_TIMEOUT_RESET" }), IDLE_TIMEOUT_MS)` whenever `isPaused` becomes true or any `onPointerDown` / `onTouchStart` / interactive action occurs. Clean up timeout on unmount.
   - Bind `onPointerDown` on the root wrapper (triggers `TOUCH_INTERACT` + `bumpIdleTimer()`), plus `Escape` keydown listener to close `activeModalAnnouncement`.
   - Compute `countsRef.current.courseSchedulesCount` from today's active schedule slice (using `filterCourseSchedules` via `useMemo`) so fair round-robin pagination during unattended auto-rotation matches the cards visible on Slide 7.
   - Add `"COURSE_SCHEDULE"` to `isSingleScreenScene` (`lg:h-screen lg:max-h-screen lg:overflow-hidden`).
   - Render `<CourseScheduleScene>` when `activeSceneId === "COURSE_SCHEDULE"`, passing `pageIndex={state.isPaused ? state.manualSchedulePageIndex : state.slideshow.courseSchedulePageIndex}` and touch callbacks.
   - Pass `onSelectAnnouncement`, `isPaused`, and `onPageChange` to `<AnnouncementsScene>`, and `isPaused`, `onSelectScene`, `onResumeSlideshow` to `<BrandedHeader>`.
   - Render an accessible full-screen touch reader modal (`role="dialog"`, `aria-modal="true"`) when `state.activeModalAnnouncement` is open, with theme-matched surface tokens, full formatted date, category badge, scrollable body if long, and large `min-h-[48px]` `"Tutup Pengumuman"` button + backdrop click close.
   - Update footer status line to indicate `"Mode Sentuh Aktif (Reset 45s)"` when `isPaused` vs `"Rotasi: 15s • Sentuh layar untuk interaksi"` when idle.
3. Update `src/styles/globals.css`: add `touch-action: manipulation;` to buttons and interactive controls (`button, [role="button"], a[href]`) and `overscroll-behavior: none;` on `html, body` to prevent Chromium pull-to-refresh or rubber-band bounce on touchscreen kiosks.

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm vitest run src/server/__tests__/kiosk-hybrid-controller.test.ts src/server/__tests__/public-kiosk-scenes.test.ts src/server/__tests__/phase4-public-dashboard.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/public/kiosk-hybrid-state.ts src/components/public/PublicDashboardSlideshow.tsx src/styles/globals.css src/server/__tests__/kiosk-hybrid-controller.test.ts
git commit -m "feat(public): integrate Unified Kiosk Hybrid touch controller, idle reset, and announcement modal"
```

---

### Task 6: Admin Panel CRUD (`/admin/jadwal`) & Navigation Integration

**Files:**
- Create: `src/app/admin/(protected)/jadwal/page.tsx`
- Modify: `src/components/admin/AdminShell.tsx`
- Modify: `src/app/admin/(protected)/page.tsx`

**Interfaces:**
- Consumes: `api.courseSchedules.*` (`list`, `count`, `stats`, `create`, `update`, `setPublished`, `delete`, `seedDummy`), `api.publicDashboard.courseSchedules`, `COURSE_DAYS`, `COURSE_ROOMS`, `createCourseScheduleSchema`, `updateCourseScheduleSchema`, `AdminStates`, `ConfirmDialog`.
- Produces: Route `/admin/jadwal` accessible to `EDITOR`, `ADMIN`, `SUPER_ADMIN` (with publish/delete/seed buttons restricted to `ADMIN`/`SUPER_ADMIN`).

- [ ] **Step 1: Implement `/admin/(protected)/jadwal/page.tsx`**

Build the page matching the crisp light high-contrast styling of `AdminShell.tsx` and `src/app/admin/(protected)/mahasiswa/page.tsx` (`bg-white`, `border-slate-200`, `text-slate-900`, `bg-blue-800` primary CTA, `min-h-[44px]` buttons):
- Header: **"Manajemen Jadwal Mata Kuliah"** + primary button **"+ Tambah Jadwal"** + secondary button **"Muat 5 Data Dummy"** (visible to `ADMIN`/`SUPER_ADMIN` when `totalCount === 0`, calling `courseSchedules.seedDummy`).
- Filter bar (4 columns on desktop): Pencarian (mata kuliah/dosen/ruang, debounced 250ms), Filter Hari (`Semua Hari`, `Senin`–`Sabtu`), Filter Ruangan (`Semua Ruangan`, `R106`–`R308`), Filter Status (`Semua`, `Terpublikasi`, `Draf`).
- Table columns: Hari & Jam (`SENIN`, `13:00 – 14:30 WIB`), Mata Kuliah & Kelas (`Kecerdasan Buatan • Kelas B`), Ruangan (`R108`), Dosen Pengampu, Semester / TA, Status (`StatusBadge`), Aksi (`Ubah`, plus `Publikasikan`/`Jadikan Draf` & `Hapus` for `ADMIN`/`SUPER_ADMIN`).
- Pagination controls (`PAGE_SIZE = 15`).
- Create/Edit Modal (`role="dialog"`, Escape-to-close):
  - Fields: `courseName`, `className` (e.g. `"A"`, `"B"`, `"Reguler"`), `dayOfWeek` (`<select>` `SENIN`–`SABTU`), `roomName` (`<input list="rooms-datalist">` pre-populated with `COURSE_ROOMS` so admins can pick `R106`–`R308` or enter a new room), `startTime` (`type="time"` default `"08:00"`), `endTime` (`type="time"` default `"09:30"`), `lecturerName`, `semester` (optional `1`–`8`), `academicYear` (optional default `"2026/2027"`), and `isPublished` checkbox (create mode, `ADMIN`/`SUPER_ADMIN` only).
  - Client-side validation with `createCourseScheduleSchema` / `updateCourseScheduleSchema` before mutating.
  - On mutation success: invalidate `utils.courseSchedules` and `utils.publicDashboard.courseSchedules`.
- Delete `ConfirmDialog`.

- [ ] **Step 2: Add navigation item in `AdminShell.tsx` and overview card in `src/app/admin/(protected)/page.tsx`**

1. In `src/components/admin/AdminShell.tsx`: add `{ href: "/admin/jadwal", label: "Jadwal Kuliah", description: "Jadwal matkul, ruangan, dan dosen", minRoles: ["EDITOR", "ADMIN", "SUPER_ADMIN"] }` to `NAV_ITEMS` right after `Pengumuman`.
2. In `src/app/admin/(protected)/page.tsx`: query `api.courseSchedules.stats.useQuery()`, add a 4th summary card (`grid-cols-1 md:grid-cols-2 lg:grid-cols-4`) displaying total/published/draft schedules, include `schedule.recentChanges` in `recentItems`, and add a quick-nav tile to `/admin/jadwal`.

- [ ] **Step 3: Run typecheck, lint, and full test suite**

Run: `pnpm check; pnpm test`
Expected: `next lint` clean, `tsc --noEmit` exit code 0, all Vitest files PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/(protected)/jadwal/page.tsx src/components/admin/AdminShell.tsx src/app/admin/(protected)/page.tsx
git commit -m "feat(admin): add course schedules CRUD page, sidebar nav, and overview metrics"
```

---

### Task 7: Beelink T4 Pro (Lubuntu 26.04 Touchscreen) Deployment Bundle, Scripts & Verification

**Files:**
- Create: `deploy/t4pro-lubuntu/setup-lubuntu.sh`
- Create: `scripts/prepare-t4pro-bundle.ps1`
- Create: `scripts/update-t4pro-wifi.ps1`
- Create: `UPDATE-T4PRO-WIFI.bat`
- Create: `docs/PANDUAN-T4PRO-LUBUNTU.md`
- Test: `src/server/__tests__/t4pro-deployment-artifacts.test.ts`

**Interfaces:**
- Consumes: `next.config.js` (`output: "standalone"`), `drizzle/*.sql`, `scripts/bootstrap-super-admin.ts`, `scripts/seed-course-schedules.ts`.
- Produces: Self-contained Lubuntu 26.04 installer, offline USB standalone bundler, 1-click WiFi updater, and Indonesian deployment manual.

- [ ] **Step 1: Write the failing deployment artifact verification test**

Create `src/server/__tests__/t4pro-deployment-artifacts.test.ts` verifying:
1. `deploy/t4pro-lubuntu/setup-lubuntu.sh` exists, uses Unix `LF` line endings (zero `\r\n`), starts with `#!/usr/bin/env bash`, configures Chromium with `--kiosk`, `--touch-events=enabled`, `--enable-gpu-rasterization`, `--disable-pinch`, `--overscroll-history-navigation=0`, `--disk-cache-dir=/tmp/chromium-cache`, configures PostgreSQL 4GB profile (`shared_buffers = 256MB`), configures systemd service running `node server.js` (`NODE_OPTIONS=--max-old-space-size=512`), and applies SQL migrations + dummy seed.
2. `scripts/prepare-t4pro-bundle.ps1`, `scripts/update-t4pro-wifi.ps1`, `UPDATE-T4PRO-WIFI.bat`, and `docs/PANDUAN-T4PRO-LUBUNTU.md` exist and reference `.next/standalone` and `lab-informatika.local`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/__tests__/t4pro-deployment-artifacts.test.ts`
Expected: FAIL (files do not exist yet).

- [ ] **Step 3: Create Lubuntu 26.04 T4 Pro scripts and operational documentation**

1. Create `deploy/t4pro-lubuntu/setup-lubuntu.sh` (explicit LF line endings):
   - Hostname `lab-informatika` + `avahi-daemon` (`http://lab-informatika.local:3000`).
   - Install `postgresql`, `curl`, `ca-certificates`, `avahi-daemon`, `chromium` (fallback `chromium-browser`), `x11-xserver-utils`, `intel-media-va-driver` / `mesa-va-drivers` (hardware decode/rasterization for Intel HD Graphics 500 on Celeron N3350), Node.js 20 LTS.
   - Tune PostgreSQL for T4 Pro 4GB RAM (`shared_buffers = 256MB`, `work_mem = 8MB`, `maintenance_work_mem = 64MB`, `effective_cache_size = 1GB`, `max_connections = 40`).
   - Copy pre-compiled standalone bundle into `/opt/dashboard-mahasiswa`, generate `.env` (`NODE_ENV=production`, `DB_MAX_CONNECTIONS=5`, `PORT=3000`, `HOSTNAME=0.0.0.0`), run `drizzle/*.sql` migrations idempotently, bootstrap Super Admin, and seed 5 dummy course schedules if table is empty.
   - Create `dashboard-mahasiswa.service` running `ExecStart=/usr/bin/node /opt/dashboard-mahasiswa/server.js` with `NODE_OPTIONS=--max-old-space-size=512` (much lower RAM & faster startup than `next start` with full `node_modules`).
   - Create `/usr/local/bin/start-dashboard-kiosk-t4pro.sh` disabling DPMS/screen-saver (`xset s off -dpms; xset s noblank`), waiting for `http://localhost:3000/api/health`, and launching Chromium with:
     - `--kiosk --incognito --noerrdialogs --disable-infobars --disable-session-crashed-bubble`
     - `--touch-events=enabled --disable-pinch --overscroll-history-navigation=0`
     - `--enable-gpu-rasterization --enable-zero-copy --ignore-gpu-blocklist`
     - `--disable-features=Translate,OptimizationHints,MediaRouter --disable-extensions --disable-sync --check-for-update-interval=31536000`
     - `--disk-cache-dir=/tmp/chromium-cache --disk-cache-size=67108864` (protects 64GB eMMC lifespan!)
   - Register LXQt/XDG autostart `/etc/xdg/autostart/dashboard-kiosk.desktop` and disable `lxqt-powermanagement` sleep/blanking in `/etc/xdg/lxqt/lxqt-powermanagement.conf`.
2. Create `scripts/prepare-t4pro-bundle.ps1`: builds Next.js standalone (`pnpm build`), assembles `.next/standalone` + `.next/static` + `public` + `drizzle` + `scripts` + `setup-lubuntu.sh` (LF-normalized) into `deploy/t4pro-lubuntu/usb-bundle/t4pro-dashboard`, and optionally copies directly to a target USB flash drive.
3. Create `scripts/update-t4pro-wifi.ps1` and `UPDATE-T4PRO-WIFI.bat`: runs `pnpm build`, tars `.next/standalone`, `.next/static`, `public`, `drizzle`, uploads via SCP to T4 Pro, applies SQL migrations, restarts `dashboard-mahasiswa.service`, and refreshes the Chromium kiosk process.
4. Create `docs/PANDUAN-T4PRO-LUBUNTU.md`: concise Indonesian guide covering hardware RAM breakdown (~1.2 GB / 4 GB), installing Lubuntu 26.04, deploying via USB bundle (`sudo bash setup-lubuntu.sh`), updating via `UPDATE-T4PRO-WIFI.bat`, touchscreen calibration (`xinput`), and admin panel login/usage for `/admin/jadwal`.

- [ ] **Step 4: Run full verification gate (`pnpm check`, `pnpm test`, `pnpm build`)**

Run: `pnpm check; pnpm test; pnpm build`
Expected:
- `next lint` and `tsc --noEmit` PASS with 0 errors.
- All Vitest test suites (including `course-schedules-schema`, `course-schedules-router`, `course-schedule-utils`, `public-kiosk-scenes`, `kiosk-hybrid-controller`, `t4pro-deployment-artifacts`, and all existing tests) PASS 100%.
- `pnpm build` completes cleanly and emits `.next/standalone/server.js`.

- [ ] **Step 5: Commit**

```bash
git add deploy/t4pro-lubuntu/setup-lubuntu.sh scripts/prepare-t4pro-bundle.ps1 scripts/update-t4pro-wifi.ps1 UPDATE-T4PRO-WIFI.bat docs/PANDUAN-T4PRO-LUBUNTU.md src/server/__tests__/t4pro-deployment-artifacts.test.ts
git commit -m "feat(deploy): add Beelink T4 Pro Lubuntu 26.04 touchscreen kiosk setup and standalone bundle scripts"
```
