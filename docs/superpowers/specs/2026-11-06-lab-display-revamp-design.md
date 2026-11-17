# Design Document: Lab Display Revamp, High-DPI Institutional Branding & Global Theme Settings

**Date:** 2026-11-06  
**Status:** In Review  
**Target:** Public Dashboard Kiosk & Administrative Theme Control  

---

## 1. Intent & Context

The dashboard serves as a permanent wall-mounted information display (kiosk / TV / monitor) in the Computer Science Laboratory (Laboratorium Informatika) of Universitas Islam Sultan Agung (UNISSULA).

The current user interface uses a temporary text-based placeholder for branding, lacks support for light-mode lab displays, and contains verbose, redundant Indonesian copy across several scenes. Furthermore, there is no mechanism for laboratory administrators to control the display theme remotely from the admin panel.

This project delivers a minimalist, clean, and elegant visual overhaul of the public dashboard, introduces persistent global theme management driven from the Admin Panel (defaulting to **Light Mode**), integrates high-definition transparent institutional logos, and streamlines all copy according to strict Anti-AI Slop guidelines.

---

## 2. Goals, Non-Goals & Anti-Goals

### 2.1 Goals
1. **High-DPI Transparent Logos**:
   - Convert `public/Logo_Informatika.jpg` (currently low-res JPEG with solid white background) into an ultra-sharp transparent High-DPI asset and SVG vector.
   - Optimize `public/Logo_Unissula.png` for transparent High-DPI presentation.
   - Integrate both logos into the public header with balanced, professional institutional proportions.
2. **Persistent Global Theme Engine (Default: Light)**:
   - Store public display theme preferences in PostgreSQL via a lightweight `system_settings` table.
   - Provide 3 minimalist, clean theme presets:
     - **Light (Default / Clean Academic)**: Warm-white/off-white surface (`#F8FAFC` / `#FFFFFF`), high-contrast slate typography (`#0F172A`), subtle 1px slate borders, deep UNISSULA green (`#006633`) and gentle informatics teal accents.
     - **Dark (Studio Slate)**: Deep slate surface (`#090D16`), crisp light typography, clean 1px borders, zero glowing neon.
     - **Monochrome (Editorial)**: Pure high-contrast black-and-white academic typography.
3. **Public Dashboard Interface Overhaul**:
   - Re-architect [BrandedHeader.tsx](file:///d:/Achmad%20Roychan/Proyek/dashboard-data-mahasiswa/src/components/public/BrandedHeader.tsx), [OverviewScene.tsx](file:///d:/Achmad%20Roychan/Proyek/dashboard-data-mahasiswa/src/components/public/OverviewScene.tsx), [GraduateScene.tsx](file:///d:/Achmad%20Roychan/Proyek/dashboard-data-mahasiswa/src/components/public/GraduateScene.tsx), [LecturerScene.tsx](file:///d:/Achmad%20Roychan/Proyek/dashboard-data-mahasiswa/src/components/public/LecturerScene.tsx), [PublicationScene.tsx](file:///d:/Achmad%20Roychan/Proyek/dashboard-data-mahasiswa/src/components/public/PublicationScene.tsx), and charts to be theme-aware.
   - Remove visual clutter, heavy drop shadows, and oversized padding.
4. **Copywriting Hygiene (Anti-Boros & Anti-AI Slop)**:
   - Eliminate filler words, abstract AI vocabulary (*delve, elevate, revolusioner, komprehensif*), and redundant sentence structures.
   - Focus on concise, clear academic information labels.
5. **Admin Theme Control**:
   - Add a dedicated "Pengaturan Tampilan" interface in the Admin Panel accessible to `ADMIN` and `SUPER_ADMIN`.
   - Provide immediate visual preview cards for Light, Dark, and Monochrome options with single-click activation.
   - Record theme modification events in `audit_logs`.

### 2.2 Non-Goals
- Modifying graduate, lecturer, or publication core entities and validation schemas.
- Altering the automatic slideshow rotation timing engine or scene order logic.
- Adding arbitrary custom CSS/color pickers (themes must stay within curated minimalist presets).

### 2.3 Anti-Goals (Forbidden Patterns)
- **No generic AI gradients**: No purple-to-cyan or neon-pink decorative washes.
- **No excessive glassmorphism**: No blanket `backdrop-blur` on every card. Surfaces must be solid and grounded.
- **No uniform pill shapes**: Buttons, badges, and cards must maintain disciplined, subtle radii (e.g., `rounded-md` / `rounded-lg`).
- **No floating glow/soft shadows**: Elements sit flat with clean 1px borders; shadows reserved strictly for interactive elevation.
- **No verbose AI copywriting**: Every caption must provide concrete facts or be omitted.

---

## 3. Approaches Considered & Decision

### Approach 1: Global System Settings in Database (Selected)
- **Mechanism**: A dedicated `system_settings` table stores `public_theme` (`LIGHT` | `DARK` | `MONOCHROME`). The public slideshow polls/subscribes via tRPC query, and the admin panel updates it via protected tRPC mutation with audit logging.
- **Why chosen**: Lab wall displays run unattended in fullscreen/kiosk browsers. Storing the theme centrally in PostgreSQL guarantees that reboots, browser crashes, or incognito sessions instantly load the administrator's chosen theme without manual physical intervention on the lab TV.
- **Trade-off**: Requires one concise table definition and migration.

### Approach 2: Client-side LocalStorage Only (Rejected)
- **Mechanism**: Theme toggled locally in browser storage.
- **Why rejected**: Requires lab operators to physically connect a mouse/keyboard to every lab monitor whenever they wish to switch between Light and Dark mode, and loses settings on cache clears.

---

## 4. Technical Specifications & Architecture

### 4.1 Asset Pipeline (Logos)
1. **`Logo_Unissula_HD.png`**:
   - Process existing `public/Logo_Unissula.png` (473×445 transparent) with clean alpha trimming and provide crisp 2x rendering.
2. **`Logo_Informatika_HD.png` & `Logo_Informatika.svg`**:
   - Isolate non-white foreground from `public/Logo_Informatika.jpg`.
   - Remove solid white background, clean compression artifact edges, and produce a transparent High-DPI PNG and vector SVG.
   - Both assets placed in `/public/` and loaded via Next.js `<Image>` with priority hints.

### 4.2 Database Schema (`src/server/db/schema.ts`)
```typescript
export const systemThemeEnum = pgEnum("system_theme", [
  "LIGHT",
  "DARK",
  "MONOCHROME",
]);

export const systemSettings = pgTable("system_settings", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
});
```
- Initial seed / default: `public_theme = "LIGHT"`.

### 4.3 tRPC API
1. **Router Registration (`src/server/api/root.ts`)**:
   - Registered under the key `systemSettings` (backed by `src/server/api/routers/systemSettings.ts`).
2. **Procedures**:
   - `systemSettings.getPublicTheme`: Public query returning `{ theme: "LIGHT" | "DARK" | "MONOCHROME" }`. (Also aliased in `publicDashboard.getTheme` for convenient kiosk co-fetching).
   - `systemSettings.getSettings`: Protected procedure (`ADMIN`, `SUPER_ADMIN`) returning setting key, value, `updatedAt`, and updater details.
   - `systemSettings.updatePublicTheme`: Protected mutation (`ADMIN`, `SUPER_ADMIN`). Validates theme enum, updates database record, and writes an audit event via `writeAuditLog`.
3. **RBAC Boundary Preservation**:
   - `/admin/pengaturan` shows the last change metadata (`updatedAt` and updater name) directly from `system_settings`. Full historical audit log listings remain strictly protected for `SUPER_ADMIN` in `/admin/pengguna`.

### 4.4 Theme Token Architecture (`src/components/public/design-tokens.ts`)
Theme classes and color maps:
- `LIGHT` (Default):
  - Canvas: `bg-slate-50 text-slate-900`
  - Header: `bg-white border-b border-slate-200`
  - Cards: `bg-white border border-slate-200/80`
  - Accents: Emerald/Unissula Green (`#006633`) & Informatics Teal (`#0284C7`)
  - Charts: Clean contrasting stroke and fill with dark axis labels
- `DARK`:
  - Canvas: `bg-slate-950 text-slate-100`
  - Header: `bg-slate-900 border-b border-slate-800`
  - Cards: `bg-slate-900/90 border border-slate-800`
  - Accents: Muted emerald (`#10B981`) & sky (`#38BDF8`)
- `MONOCHROME`:
  - Canvas: `bg-white text-black`
  - Header: `bg-white border-b-2 border-black`
  - Cards: `bg-white border border-black`
  - Accents: High-contrast black/charcoal/white

### 4.5 Copywriting Cleanups & Accessibility Preservation
- **Header Institution**:
  - *Before:* "Universitas Islam Sultan Agung (UNISSULA) • Program Studi Teknik Informatika"
  - *After:* "Universitas Islam Sultan Agung • Program Studi Teknik Informatika"
- **Header Title**:
  - *Before:* "Dashboard Monitoring Laboratorium Informatika"
  - *After:* "Dashboard Laboratorium Informatika"
- **KPI 1**:
  - Visible copy: "Lulusan Terdaftar" (with caption "Tren Kelulusan Tahunan")
  - Accessible name (`aria-label` / `data-testid`): Retains "Total Lulusan Terpublikasi" for screen readers and regression test stability.
- **KPI 2**:
  - Visible copy: "Dosen & Peneliti" (caption: "Staf Pengajar Aktif")
  - Accessible name: "Dosen & Peneliti Aktif"
- **KPI 3**:
  - Visible copy: "Publikasi Ilmiah"
  - Accessible name: "Total Publikasi Ilmiah Unik"
- **KPI 4**:
  - Visible copy: "Rata-Rata Masa Studi" (caption: "Berdasarkan angkatan kelulusan")

### 4.6 Admin UI (`src/app/admin/pengaturan/page.tsx`)
- Navigation item in `AdminShell`: "Pengaturan Display" (visible to `ADMIN` and `SUPER_ADMIN`).
- Selection cards showing real miniature previews for:
  - **Terang (Light)** - Direkomendasikan untuk pencahayaan lab standar.
  - **Gelap (Dark)** - Optimal untuk ruang lab bertaraf bioskop/presentasi.
  - **Monokrom** - Kontras tajam bergaya publikasi ilmiah minimalis.
- Real-time success banner and audit log trail.

---

## 5. Verification Plan

1. **Unit & Integration Tests**:
   - Verify `systemSettings` tRPC router (`getTheme`, `updatePublicTheme`).
   - Verify non-admin role (`EDITOR`) is forbidden from changing system theme.
   - Verify existing 18 test suite passes without regressions.
2. **Visual & Display Inspection**:
   - Verify both logos render crisply at 1x, 2x, and 4x scaling on transparent backgrounds.
   - Verify zero layout shift and smooth transitions between slideshow scenes.
   - Verify Light mode (default), Dark mode, and Monochrome mode render correctly on both desktop and 4K display viewports.
3. **Accessibility**:
   - Contrast check: Text contrast exceeds WCAG AA (4.5:1) in all three themes.

