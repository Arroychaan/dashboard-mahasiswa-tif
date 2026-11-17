# Project Architecture Contract

## 1. Project Identity & Mission
- **Project**: Dashboard Monitoring Laboratorium Informatika
- **Program**: Program Studi Teknik Informatika
- **Institution**: Universitas Islam Sultan Agung (UNISSULA)
- **Mission**: Provide a secure, maintainable, type-safe monitoring application displaying read-only public digital signage statistics and an authenticated administrative management interface.

## 2. Locked Technology Stack
| Layer | Technology | Rules & Constraints |
| --- | --- | --- |
| Framework | Next.js (App Router) | React Server Components + Client Components where interactive |
| Language | TypeScript (`strict: true`) | `noUncheckedIndexedAccess: true` enabled |
| Styling | Tailwind CSS v4 | Blue visual identity; official UNISSULA/Informatics colors & assets must not be fabricated |
| API Layer | tRPC v11 + SuperJSON | End-to-end type-safe procedures with Zod input/output validation |
| ORM | Drizzle ORM (`postgres-js`) | Explicit SQL migrations via `drizzle-kit`; no Prisma |
| Database | PostgreSQL | Relational integrity, foreign keys, UUID primary keys; no MongoDB/Supabase/Firebase |
| Auth | Auth.js / NextAuth.js v5 | Session-based / credentials authentication scoped to admin users |
| Validation | Zod | Shared validation schemas for inputs, years, and DTOs |
| Charts | Recharts | Deferred to Phase 4 when dashboard visualizations are built |
| Package Manager | `pnpm` | Lockfile (`pnpm-lock.yaml`) committed and enforced |
| Containerization | Docker & Docker Compose | Development PostgreSQL container (`docker-compose.yml`) and production deployment |

## 3. Locked Application Routes
All route paths must strictly match the following structure (no trailing spaces or speculative routes):

| Route Path | Access | Purpose |
| --- | --- | --- |
| `/` | Public (Read-Only) | Automatic digital signage slideshow displaying published graduate, lecturer, and publication metrics and trends. Optimized for desktop, TV, and large displays. No login, search, filter, editing, or interactive controls. |
| `/admin/login` | Public (Unauthenticated Admin Entry) | Administrative sign-in page. Redirects authenticated users to `/admin`. |
| `/admin` | Protected (`SUPER_ADMIN`, `ADMIN`, `EDITOR`) | Admin overview dashboard with summary metrics (published vs. draft counts) and recent activity. |
| `/admin/mahasiswa` | Protected (`SUPER_ADMIN`, `ADMIN`, `EDITOR`) | CRUD management and publication toggle for `graduates` records. |
| `/admin/dosen` | Protected (`SUPER_ADMIN`, `ADMIN`, `EDITOR`) | CRUD management and publication toggle for `lecturers` records. |
| `/admin/publikasi` | Protected (`SUPER_ADMIN`, `ADMIN`, `EDITOR`) | CRUD management, lecturer co-author linking, and publication toggle for `publications` records. |
| `/admin/pengguna` | Protected (`SUPER_ADMIN`, `ADMIN` read/limited, see RBAC Matrix) | User account and role management (`users`) plus audit log inspection (`audit_logs`). |

## 4. Source-of-Truth & Public Data Rules
1. **Admin as Sole Content Source**: Only authenticated administrators/editors can create, update, or publish records via the `/admin/*` interface.
2. **Publication Gate & Content Workflow (`isPublished`)**:
   - All newly created `graduates`, `lecturers`, and `publications` records start as `DRAFT` (`isPublished = false`).
   - Only `ADMIN` and `SUPER_ADMIN` can publish or unpublish records (`setPublished`). `EDITOR` cannot publish, unpublish, or delete content.
   - **Editing Published Items**: Updating an already-published record applies an immediate update to its fields while preserving its `isPublished = true` state and recording an `audit_logs` entry (`*_UPDATE`). Administrators can unpublish a record to `DRAFT` at any time via `setPublished`.
   - Public endpoints (`publicDashboard.*`) strictly filter by `isPublished = true`.
3. **Publication Visibility Rule**:
   - A publication record (`publications.isPublished = true`) is publicly visible **if and only if** it is linked via `publication_authors` to **at least one** published lecturer (`lecturers.isPublished = true`).
   - Global publication totals and trend aggregations count **distinct** publicly visible publications (never double-counted across co-authors).
4. **Strict PII & Privacy Boundaries**:
   - **NIM Exclusion**: Student ID (`NIM`) is strictly excluded from the MVP database schema, API inputs/outputs, DTOs, UI components, exports, and audit logs.
   - **NIP Protection**: Lecturer `nip` is strictly admin-only and must never be serialized or returned in any `publicDashboard` procedure or public page payload. Lecturer `nidn` may be displayed publicly when present.
   - **Password & Secret Redaction**: `users.passwordHash` and session tokens are never returned by API procedures or logged in `audit_logs.metadata`.

## 5. Empty-Data & Missing-Value Behavior
- Empty datasets and nullable fields (`nidn`, `education`, `biography`, `photoPath`, `doi`, `url`) are treated as normal operational states.
- When the database has zero published records:
  - Aggregation procedures return `0` for counts and empty arrays `[]` for series/lists.
  - The public dashboard (`/`) renders a clean, layout-stable empty state without throwing runtime errors or fabricating placeholder metrics.
  - No synthetic/fake production records may be inserted into migrations or startup hooks.

## 6. File Organization Conventions
```text
├── docs/
│   ├── PROJECT_CONTRACT.md
│   ├── DATABASE_SCHEMA.md
│   ├── API_CONTRACT.md
│   ├── RBAC_MATRIX.md
│   └── IMPLEMENTATION_STATUS.md
├── drizzle/                      # Generated SQL migrations & metadata
├── public/                       # Static assets (official logos/icons when provided)
├── src/
│   ├── app/                      # Next.js App Router pages & API route handlers
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts
│   │   │   └── trpc/[trpc]/route.ts
│   │   ├── admin/
│   │   │   ├── login/page.tsx
│   │   │   ├── mahasiswa/page.tsx
│   │   │   ├── dosen/page.tsx
│   │   │   ├── publikasi/page.tsx
│   │   │   ├── pengguna/page.tsx
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── lib/
│   │   └── validators/           # Shared Zod validation schemas & DTO contracts
│   ├── server/
│   │   ├── api/
│   │   │   ├── routers/          # Locked tRPC routers
│   │   │   │   ├── publicDashboard.ts
│   │   │   │   ├── graduates.ts
│   │   │   │   ├── lecturers.ts
│   │   │   │   ├── publications.ts
│   │   │   │   ├── users.ts
│   │   │   │   └── auditLogs.ts
│   │   │   ├── root.ts
│   │   │   └── trpc.ts
│   │   ├── auth/                 # Auth.js configuration & helpers
│   │   └── db/                   # Drizzle ORM connection & PostgreSQL schema
│   │       ├── index.ts
│   │       └── schema.ts
│   ├── styles/
│   │   └── globals.css
│   ├── trpc/                     # tRPC client & RSC hydration utilities
│   └── env.js                    # @t3-oss/env-nextjs validation
├── docker-compose.yml            # Development PostgreSQL container
├── drizzle.config.ts             # Drizzle Kit configuration
└── .env.example                  # Placeholder environment variables template
```

## 7. Deployment Assumptions
- **Database**: PostgreSQL 16+ running in Docker or managed PostgreSQL in production.
- **Migrations**: Executed explicitly via `pnpm db:migrate` (or migration runner) prior to starting the production server. `drizzle-kit push` is strictly forbidden against production databases.
- **Environment Validation**: Enforced at build and runtime via `src/env.js` (`@t3-oss/env-nextjs`).

## 8. Explicit MVP Exclusions
- No `NIM` field anywhere in the system.
- No separate `research_projects` entity or table.
- No public search, filtering, sorting, pagination controls, or interactive drill-downs on `/`.
- No public user registration or public login.
- No speculative entities (e.g., laboratory equipment inventory, room scheduling, course timetables, student grades).
- No fabricated institutional logos, color palettes claimed as official without verification, or fake seed data claimed as real UNISSULA records.

## 9. Multi-Phase Roadmap & Acceptance Criteria
- **Phase 1 (Current — Foundation & Contracts)**:
  - Scaffold T3 Stack with Next.js App Router, TypeScript strict mode, Tailwind CSS, tRPC, Drizzle ORM, NextAuth.js, and Zod.
  - Lock architecture, database schema, API contracts, and RBAC matrix in `docs/`.
  - Implement PostgreSQL Drizzle schema (`graduates`, `lecturers`, `publications`, `publication_authors`, `users`, `audit_logs`) and generate initial SQL migration.
  - Provide development `docker-compose.yml` and `.env.example`.
  - Provide minimal empty-state route shells and router stubs that pass typecheck, lint, migration validation, and production build.
- **Phase 2 (Authentication, RBAC & Audit Logging)**:
  - Implement Credentials authentication against `users` (`passwordHash`, `isActive`, `role`).
  - Implement role-based tRPC middlewares (`editorProcedure`, `adminProcedure`, `superAdminProcedure`) and route protection middleware.
  - Implement `users` and `auditLogs` routers and `/admin/login` + `/admin/pengguna` workflows.
- **Phase 3 (Admin CRUD & Publication Workflows)**:
  - Implement full tRPC procedures and admin UI forms/tables for `graduates` (`/admin/mahasiswa`), `lecturers` (`/admin/dosen`), and `publications` + `publication_authors` (`/admin/publikasi`).
  - Enforce explicit co-author management and audit logging on all mutations.
- **Phase 4 (Public Digital Signage Dashboard & Visualizations)**:
  - Install `recharts`.
  - Implement `publicDashboard` aggregation queries and the automatic digital signage slideshow on `/` for desktop, TV, and large displays.
- **Phase 5 (Hardening, Testing & Deployment Readiness)**:
  - End-to-end verification, production Dockerization, security review, and operational documentation.

