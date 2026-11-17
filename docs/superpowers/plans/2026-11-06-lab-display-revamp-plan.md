# Lab Display Revamp, High-DPI Institutional Branding & Global Theme Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the public dashboard into a minimalist, clean, and elegant laboratory wall display with transparent High-DPI institutional logos, concise Anti-AI Slop copywriting, and database-backed global theme management controlled from the Admin Panel (defaulting to Light Mode).

**Architecture:** A PostgreSQL `system_settings` table managed via Drizzle ORM stores the global theme state (`LIGHT` | `DARK` | `MONOCHROME`). A tRPC router (`systemSettings`) provides public read access for the unattended lab kiosk and protected mutation access for administrators. The frontend slideshow consumes these tokens to dynamically render matte, high-contrast scenes with dual High-DPI logos.

**Tech Stack:** Next.js 15 (App Router, Turbopack), React 19, Tailwind CSS v4, Drizzle ORM, PostgreSQL, tRPC v11, Sharp, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-06-lab-display-revamp-design.md`

## Global Constraints

- **Theme Default:** Must default to `LIGHT` (Clean Academic) on initial boot and fresh databases.
- **Visual Design:** Strictly follow Anti-AI Slop rules: no generic purple/cyan gradients, no blanket glassmorphism/backdrop-blur, no uniform pills, no heavy floating drop-shadows. Surfaces must be matte with clean 1px borders.
- **Copywriting Hygiene:** Strictly follow Anti-AI Copywriting rules: no empty verbs (*delve, elevate, revolutionize, komprehensif*), no redundant fluff. Copy must be terse, direct, and academic.
- **Accessibility & Test Compatibility:** Retain accessible descriptors (e.g. `aria-label="Total Lulusan Terpublikasi"`) so existing test assertions and screen readers pass without regression.
- **RBAC Boundaries:** Only `ADMIN` and `SUPER_ADMIN` may modify the display theme. Theme changes must be audited in `audit_logs`.

## Review Focus

1. **Unauthenticated Public Kiosk Fetching:** The public slideshow running in kiosk mode must fetch the active theme without requiring any session cookies or login tokens.
2. **Missing Settings Row Fallback:** If `system_settings` has no `public_theme` row, the system must gracefully fall back to `LIGHT` without throwing errors.
3. **High-DPI Transparency on Dark/Light Backgrounds:** The extracted `Logo_Informatika` must have zero white fringe / halo artifacts when displayed on either light or dark backgrounds.
4. **Contrast Compliance:** All text and chart elements must exceed WCAG AA (4.5:1) in all three themes (`LIGHT`, `DARK`, `MONOCHROME`).
5. **Session Invalidation & Audit Trail:** Non-admin roles (`EDITOR`) attempting to modify the theme must be rejected with 403 `FORBIDDEN`.

---

## Tasks

### Task 1: High-DPI Transparent Institutional Logo Assets

**Files:**
- Create: `scripts/process-logos.ts`
- Create: `public/Logo_Informatika_HD.png`
- Create: `public/Logo_Informatika.svg`
- Create: `public/Logo_Unissula_HD.png`

- [x] Write a Node.js/Sharp script `scripts/process-logos.ts` to:
  - Read `public/Logo_Informatika.jpg`, isolate the logo bounding box, remove the white background using a clean alpha threshold, anti-alias the edges, and save as `public/Logo_Informatika_HD.png` (transparent PNG).
  - Generate a clean, crisp vector `public/Logo_Informatika.svg` matching the geometry and colors (`#008080` teal, `#E67E22` orange arc, `#1A1A1A` dark typography).
  - Read `public/Logo_Unissula.png`, trim excess transparent margins, and save as `public/Logo_Unissula_HD.png`.
- [x] Run `npx tsx scripts/process-logos.ts` to generate the assets.
- [x] Inspect generated image metadata and corner alpha pixels using Sharp to verify transparency and resolution.

---

### Task 2: Database Schema & Migration for System Settings

**Files:**
- Modify: `src/server/db/schema.ts`
- Modify: `drizzle/` migrations
- Test: `src/server/__tests__/system-settings.test.ts`

- [x] In `src/server/db/schema.ts`, define `systemThemeEnum` with values `["LIGHT", "DARK", "MONOCHROME"]`.
- [x] Define `systemSettings` table:
  - `key: varchar("key", { length: 64 }).primaryKey()`
  - `value: text("value").notNull()`
  - `updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date())`
  - `updatedByUserId: uuid("updated_by_user_id").references(() => users.id, { onDelete: "set null" })`
- [x] Write a focused unit/integration test in `src/server/__tests__/system-settings.test.ts` using in-memory PGlite to verify inserting and querying `system_settings`.
- [x] Run `pnpm test` to verify the schema passes test execution.

---

### Task 3: tRPC Router for System Settings & Theme Management

**Files:**
- Create: `src/server/api/routers/systemSettings.ts`
- Modify: `src/server/api/root.ts`
- Modify: `src/server/api/routers/publicDashboard.ts`
- Test: `src/server/__tests__/system-settings.test.ts`

- [x] Create `src/server/api/routers/systemSettings.ts` with:
  - `getPublicTheme`: Public procedure returning `{ theme: "LIGHT" | "DARK" | "MONOCHROME" }`, defaulting to `"LIGHT"` if not set.
  - `getSettings`: Protected procedure (`ADMIN`, `SUPER_ADMIN`) returning setting record and updater name.
  - `updatePublicTheme`: Protected procedure (`ADMIN`, `SUPER_ADMIN`) validating `z.enum(["LIGHT", "DARK", "MONOCHROME"])`, upserting into `system_settings`, and recording an audit log entry via `writeAuditLog`.
- [x] Register `systemSettings` in `src/server/api/root.ts`.
- [x] In `src/server/__tests__/system-settings.test.ts`, add test cases:
  - Public caller can fetch public theme (defaults to `LIGHT`).
  - `ADMIN` and `SUPER_ADMIN` can update public theme to `DARK` and `MONOCHROME`.
  - `EDITOR` caller is rejected with `FORBIDDEN`.
  - Audit log is recorded on theme update.
- [x] Run `pnpm test` to verify all tests pass.

---

### Task 4: Theme Design Tokens & Public Slideshow Engine Integration

**Files:**
- Modify: `src/components/public/design-tokens.ts`
- Modify: `src/components/public/PublicDashboardSlideshow.tsx`
- Modify: `src/components/public/BrandedHeader.tsx`
- Modify: `src/components/public/DashboardCharts.tsx`

- [x] In `src/components/public/design-tokens.ts`:
  - Export `type PublicDisplayTheme = "LIGHT" | "DARK" | "MONOCHROME"`.
  - Define theme configuration palettes (background, surface, text, border, accent, chart colors) for each theme.
- [x] In `src/components/public/PublicDashboardSlideshow.tsx`:
  - Query `api.systemSettings.getPublicTheme.useQuery(undefined, { refetchInterval: 15_000, staleTime: 10_000 })`.
  - Apply active theme container classes and provide theme context / props down to scenes.
- [x] In `src/components/public/BrandedHeader.tsx`:
  - Replace temporary text box placeholder with dual HD logos: `Logo_Unissula_HD.png` and `Logo_Informatika_HD.png` (or SVG) using Next.js `<Image>`.
  - Clean up institutional title typography and Jakarta clock layout.
  - Support theme-aware styling (light, dark, monochrome).
- [x] In `src/components/public/DashboardCharts.tsx`:
  - Ensure Bar and Line charts adapt their stroke, fill, grid lines, and tooltip styling to the active theme.

---

### Task 5: Public Scenes Minimalist Overhaul & Copywriting Cleanup

**Files:**
- Modify: `src/components/public/StatSummaryCard.tsx`
- Modify: `src/components/public/OverviewScene.tsx`
- Modify: `src/components/public/GraduateScene.tsx`
- Modify: `src/components/public/LecturerScene.tsx`
- Modify: `src/components/public/PublicationScene.tsx`
- Modify: `src/components/public/PublicEmptyState.tsx`

- [x] Update `StatSummaryCard.tsx`:
  - Minimalist matte surface with 1px border; remove floating shadows; render clear, high-contrast typography.
- [x] Update `OverviewScene.tsx`:
  - Streamline copywriting: "Lulusan Terdaftar", "Tren Kelulusan Tahunan", "Dosen & Peneliti", "Publikasi Ilmiah".
  - Retain `aria-label="Total Lulusan Terpublikasi"` for accessibility and test assertion compatibility.
- [x] Update `GraduateScene.tsx`:
  - Clean, theme-aware table and cards; clear annual breakdown without redundant explanatory paragraphs.
- [x] Update `LecturerScene.tsx`:
  - Minimalist lecturer cards with crisp photo presentation, clean badge pills, and high-contrast typography.
- [x] Update `PublicationScene.tsx`:
  - Clean, legible publication listings with minimalist DOI/URL link badges.
- [x] Update `PublicEmptyState.tsx`:
  - Clean, minimal empty state display.

---

### Task 6: Admin Panel Theme Management UI & Navigation

**Files:**
- Create: `src/app/admin/pengaturan/page.tsx`
- Modify: `src/components/admin/AdminShell.tsx`

- [x] In `src/components/admin/AdminShell.tsx`:
  - Add `{ href: "/admin/pengaturan", label: "Pengaturan Display", description: "Tema tampilan layar lab", minRoles: ["ADMIN", "SUPER_ADMIN"] }` to `NAV_ITEMS`.
- [x] Create `src/app/admin/pengaturan/page.tsx`:
  - Protected page for `ADMIN` and `SUPER_ADMIN`.
  - Interactive theme selector featuring 3 live preview cards:
    - **Terang (Light)** - Default / Clean Academic.
    - **Gelap (Dark)** - Minimalist Deep Slate.
    - **Monokrom (Monochrome)** - High-Contrast Editorial.
  - One-click theme activation calling `api.systemSettings.updatePublicTheme.useMutation()`.
  - Displays currently active theme, last modified timestamp, and updater name.
  - Displays clean confirmation feedback banner on update.

---

### Task 7: Full Verification & Anti-AI Slop Quality Gate

**Files:**
- Test: All tests in `src/server/__tests__/*.test.ts`

- [x] Run `pnpm test` to ensure all unit, security, integration, and public dashboard tests pass.
- [x] Run `pnpm check` (`next lint && tsc --noEmit`) to verify zero TypeScript or ESLint errors.
- [x] Verify light, dark, and monochrome theme contrast levels meet WCAG AA standards.
- [x] Document completion summary and point user to the updated files.
