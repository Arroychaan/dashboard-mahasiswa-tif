# Security Audit Report — Phase 5

**Project:** Dashboard Monitoring Laboratorium Informatika UNISSULA  
**Standards Evaluated Against:** OWASP ASVS 5.0 (Levels 1 & 2), OWASP Cheat Sheets (Authentication, Session Management, Access Control, Input Validation, File Upload), Next.js 15 Security Guidance, Auth.js v5 Security Guidance, PostgreSQL Security Best Practices.

> **Disclaimer:** Security is a layered, continuous discipline. This report documents the verified technical controls, test evidence, remediated findings, and residual operational risks as of the Phase 5 release audit. It does not claim the system is "100% secure", "certified", or "vulnerability-free".

---

## 1. Architecture & Contract Conformance Audit (STEP 1)

All implementation files across Phases 1–4 were compared line-by-line against:
- `docs/PROJECT_CONTRACT.md`
- `docs/DATABASE_SCHEMA.md`
- `docs/API_CONTRACT.md`
- `docs/RBAC_MATRIX.md`

### Key Architectural Verifications
1. **No Hardcoded Credentials or Accidental Demo Data**:
   - Inspected `src/`, `drizzle/`, `scripts/`, and configuration files. No seed scripts, hardcoded passwords, or mock production records exist.
   - Initial `SUPER_ADMIN` provisioning is strictly handled via the interactive/env-driven CLI utility `scripts/bootstrap-super-admin.ts` (`pnpm admin:bootstrap`), which refuses to run if any `SUPER_ADMIN` already exists in the `users` table.
2. **Database Schema & Migration Integrity**:
   - Verified `src/server/db/schema.ts` against `drizzle/0000_nervous_black_tarantula.sql` using `pnpm drizzle-kit check`.
   - All 6 tables (`users`, `graduates`, `lecturers`, `publications`, `publication_lecturers`, `audit_logs`), 3 PostgreSQL enums (`user_role`, `publication_status`, `publication_kind`), check constraints (`graduates_graduation_gte_entry_chk`, `graduates_entry_year_range_chk`, `publications_year_range_chk`), unique indexes (`lecturers_nidn_unique`, `lecturers_nip_unique`, `publications_doi_unique`, `publication_lecturers_pub_lec_unique`), and foreign key cascades match `docs/DATABASE_SCHEMA.md`.
   - `NIM` is completely absent from database columns, Zod validators, tRPC payloads, and UI components.

---

## 2. Authentication, Session & RBAC Controls (STEP 2)

| Control Area | Implementation Location | Verification Method & Evidence |
| --- | --- | --- |
| **Password Hashing** | `src/server/security/password.ts` | Argon2id (`memoryCost: 19456`, `timeCost: 2`, `parallelism: 1`). Minimum 12-character password policy enforced across Zod schemas (`src/lib/validators/index.ts`) and CLI bootstrap. |
| **Mandatory `SUPER_ADMIN` MFA** | `src/server/security/mfa.ts`, `src/server/auth/authorize-credentials.ts` | TOTP (RFC 6238, SHA-1, 6 digits, 30s period) with secrets encrypted at rest using AES-256-GCM derived from `AUTH_SECRET` via HKDF-SHA256. Recovery codes hashed with Argon2id and consumed atomically on use. |
| **Brute-Force Protection** | `src/server/security/rate-limit.ts` | Sliding-window limiter per `email + IP` key (max 5 failed attempts per 15 minutes; 15-minute lockout on threshold). Verified in `src/server/__tests__/backend-security.test.ts`. |
| **Live Session Validation & Invalidation** | `src/server/api/trpc.ts` (`protectedProcedure`) | Every authenticated tRPC call re-queries `users` by session user ID. Deactivated accounts (`isActive = false`) or changed roles take effect on the very next request without waiting for JWT expiry. |
| **Horizontal & Vertical Privilege Escalation Guards** | `src/server/api/routers/users.ts` | `EDITOR` cannot access `users.*` or `auditLogs.*`. `ADMIN` can only create/manage `EDITOR` accounts and cannot modify `ADMIN` or `SUPER_ADMIN` accounts. Self-demotion and self-deactivation are blocked. |
| **Last Active `SUPER_ADMIN` Protection** | `src/server/api/routers/users.ts` (`assertNotRemovingLastSuperAdmin`) | Server queries active `SUPER_ADMIN` count inside a transaction before any deactivation or role change and throws `BAD_REQUEST` if `count <= 1`. |

---

## 3. Data Protection, Input Validation & File Upload Security (STEP 3)

| Threat / Requirement | Control Implemented | Verification Evidence |
| --- | --- | --- |
| **SQL Injection** | All database queries use Drizzle ORM parameterized builders (`eq`, `ilike`, `sql` tagged templates). | Tested in `src/server/__tests__/phase5-e2e-audit.test.ts` with `' OR 1=1 --` and `'; DROP TABLE graduates; --` payloads. |
| **Stored / Reflected XSS** | All user inputs are trimmed and validated via Zod (`src/lib/validators/index.ts`). React escapes all JSX text interpolation (`renderToStaticMarkup` verified `&lt;script&gt;` escaping). No `dangerouslySetInnerHTML` is used on user-supplied data. | Tested in `src/server/__tests__/phase5-e2e-audit.test.ts`. |
| **`NIP` Privacy Boundary** | `publicDashboard` SQL queries do not select `nip`. In `lecturers.listAdmin` and `lecturers.getByIdAdmin`, `sanitizeLecturerForRole` strips `nip` (`nip: null`) when the caller role is `EDITOR`. | Tested in `src/server/__tests__/backend-security.test.ts` and `src/server/__tests__/phase3-admin.test.ts`. |
| **Unpublished Data Isolation** | Every `publicDashboard` query filters `eq(status, "PUBLISHED")`. Co-author counts only include `PUBLISHED` lecturers on `PUBLISHED` publications. | Tested in `src/server/__tests__/phase5-e2e-audit.test.ts`. |
| **Distinct Publication Counting** | `countDistinct(publications.id)` is used in `publicDashboard` and `adminOverview` so a publication with $N$ co-authors is counted once. | Tested in `src/server/__tests__/phase5-e2e-audit.test.ts` (Step 15). |
| **Lecturer Photo Upload Hardening** | `src/server/storage/lecturer-photo.ts` & `src/app/api/admin/lecturer-photo/route.ts`: Authenticates session + DB role (`SUPER_ADMIN`/`ADMIN`/`EDITOR`), enforces 2 MB limit, verifies magic bytes (`JPEG`, `PNG`, `WebP`), rejects SVG/HTML/polyglots, re-encodes via `sharp` to strip EXIF metadata, writes to a non-executable `crypto.randomUUID() + ".webp"` filename, and serves `/uploads/:path*` with `Content-Security-Policy: default-src 'none'; img-src 'self'; sandbox`. | Tested in `src/server/__tests__/phase3-admin.test.ts`. |

---

## 4. Issues Identified & Remediated During Phase 5 (STEP 1, STEP 7 & STEP 10)

| ID | Severity | Component | Description | Remediation Applied | Status |
| --- | --- | --- | --- | --- | --- |
| **F-01** | **CRITICAL / HIGH** | Dependencies (`package.json`, `pnpm-workspace.yaml`) | Initial `pnpm audit` reported 16 advisories (`3 critical, 6 high, 7 moderate`) in `next-auth@5.0.0-beta.25`, `@auth/core`, `drizzle-orm@0.41.0`, `postcss`, and `esbuild`. | Upgraded `drizzle-orm` to `^0.45.4`, `next-auth` to `5.0.0-beta.32`, `postcss` to `^8.5.32`, and added workspace overrides (`"@auth/core": ">=0.41.3"`, `esbuild: ">=0.25.0"`). Reduced advisories from 16 to 2 non-exploitable items (documented in Section 5). | **FIXED** |
| **F-02** | **MEDIUM** | `src/lib/validators/index.ts` | `createUserSchema`, `changeUserPasswordSchema`, and `resetUserPasswordSchema` allowed `.min(8)` characters, whereas the CLI bootstrap and Admin UI specified a 12-character minimum password policy. | Standardized all password creation/change/reset schemas in `src/lib/validators/index.ts` to `.min(12, "Password minimal 12 karakter")` with regression test in `phase5-e2e-audit.test.ts`. | **FIXED** |
| **F-03** | **MEDIUM** | `src/server/api/routers/users.ts` | Promoting a user to `SUPER_ADMIN` via `users.changeRole` auto-provisioned TOTP MFA + recovery codes, but promoting via `users.update` (`role: "SUPER_ADMIN"`) did not auto-provision MFA if `mfaEnabled` was false. | Updated `users.update` in `src/server/api/routers/users.ts` to auto-provision encrypted TOTP MFA + hashed recovery codes whenever a user is promoted to `SUPER_ADMIN` without existing MFA. | **FIXED** |
| **F-04** | **MEDIUM** | `src/server/api/routers/auditLogs.ts` & `src/app/admin/pengguna/page.tsx` | Audit log records store uppercase `entityType` (`GRADUATE`, `LECTURER`, `PUBLICATION`, `USER`, `AUTH`), while the UI dropdown passed lowercase values and the router matched case-sensitively. | Normalized `input.entityType.trim().toUpperCase()` in `auditLogs.ts` and updated dropdown option values in `src/app/admin/pengguna/page.tsx`. Verified in `phase5-e2e-audit.test.ts`. | **FIXED** |
| **F-05** | **MEDIUM** | `next.config.js` | Missing explicit `Content-Security-Policy`, `Cache-Control: no-store` on `/admin/*` routes, and sandbox headers on `/uploads/*`. | Hardened `next.config.js` with `output: "standalone"`, strict CSP headers, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`, `Cache-Control: no-store, no-cache, must-revalidate, private` on `/admin/:path*` and `/api/auth/:path*`, and sandboxed CSP on `/uploads/:path*`. | **FIXED** |
| **F-06** | **LOW** | `package.json` | `@auth/drizzle-adapter` was listed in `dependencies` even though authentication uses stateless JWT + custom Drizzle queries against the `users` table. | Removed unused `@auth/drizzle-adapter` from `package.json`. | **FIXED** |

---

## 5. Dependency Audit & Residual Advisories (STEP 6)

After applying the upgrades in **F-01**, executing `pnpm audit` returns 2 advisories (`0 critical | 1 high | 1 moderate`):

1. **`zod < 4.6.6` (`GHSA-mrhx-c7xc-m3w5`, High — algorithmic complexity on unbounded `.refine()` / superRefine collections)**:
   - **Reachability & Mitigation**: Upgrading to `zod@4` is a breaking major change across `@t3-oss/env-nextjs@0.12.0` and `@trpc/server@11`. In our application, the only collection using `.refine()` is `uniqueLecturerIdsSchema` (`src/lib/validators/index.ts`), which is strictly bounded by `.min(1).max(50)` before `.refine()` executes and is only reachable by authenticated administrative users (`editorProcedure`). Unauthenticated public endpoints take zero input parameters.
2. **`minimatch < 11.0.1` (`GHSA-g3hv-75wg-m249`, Moderate — ReDoS in glob matching)**:
   - **Reachability & Mitigation**: Dev-only transitive dependency of `eslint-config-next -> @typescript-eslint/typescript-estree`. Not bundled into the Next.js production runtime (`output: "standalone"`).

---

## 6. Residual Operational Risks & Recommendations

1. **In-Memory Rate Limiter Scope**:
   - `src/server/security/rate-limit.ts` maintains sliding-window state in process memory. This is effective for single-container deployments (`docker-compose.prod.yml` on a laboratory server or single VPS). If the application is horizontally scaled across multiple replicas in the future, configure rate limiting at the reverse proxy (Nginx `limit_req_zone` / Caddy) or migrate the store to Redis.
2. **TLS Termination**:
   - When deployed outside an isolated local laboratory VLAN, HTTPS must be terminated at a reverse proxy (Nginx or Caddy) so `Secure` session cookies and HSTS (`Strict-Transport-Security`) are enforced over TLS.

