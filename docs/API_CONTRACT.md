# tRPC API & DTO Contract

## 1. Locked Root Router Structure (`appRouter`)
All API procedures are exposed via `/api/trpc/[trpc]` and RSC caller using these exact top-level router keys in `src/server/api/root.ts`:

```ts
export const appRouter = createTRPCRouter({
  publicDashboard: publicDashboardRouter,
  graduates: graduatesRouter,
  lecturers: lecturersRouter,
  publications: publicationsRouter,
  users: usersRouter,
  auditLogs: auditLogsRouter,
});
```

---

## 2. Public vs. Private DTO Boundaries

### 2.1 Strict Exclusion Rules
| Entity | Field | Public DTO (`publicDashboard.*`) | Admin DTO (`graduates`, `lecturers`, `publications`, `users`, `auditLogs`) | Database |
| --- | --- | --- | --- | --- |
| `graduates` | `NIM` | **FORBIDDEN** | **FORBIDDEN** | **FORBIDDEN** |
| `lecturers` | `nip` | **FORBIDDEN (Never queried/serialized)** | Allowed for `ADMIN` & `SUPER_ADMIN` (`string \| null`); Masked (`null`) for `EDITOR` | Stored |
| `lecturers` | `nidn` | Allowed (`string \| null`) | Allowed (`string \| null`) | Stored |
| `users` | `passwordHash`, `mfaSecretEncrypted`, `mfaRecoveryCodesHashed` | **FORBIDDEN** | **FORBIDDEN (Internal-only)** | Stored |
| `audit_logs` | `metadata` | **FORBIDDEN** | Allowed (`SUPER_ADMIN` only; sanitized JSONB, zero secrets) | Stored |

### 2.2 Public DTO Shapes (`src/lib/validators/index.ts`)
All `publicDashboard` procedures enforce explicit runtime `.output(...)` Zod validation (`strict()`):
- **`PublicOverviewDTO`** (`publicOverviewDtoSchema`):
  - `totalGraduates`: `number (int, >= 0)`
  - `totalLecturers`: `number (int, >= 0)`
  - `totalPublications`: `number (int, >= 0)` *(Distinct published publications linked to >=1 published lecturer)*
  - `totalJournals`: `number (int, >= 0)`
  - `totalArticles`: `number (int, >= 0)`
  - `lastUpdatedAt`: `Date | null`
- **`PublicGraduateDTO`** (`publicGraduateDtoSchema`):
  - `id`: `string (uuid)`
  - `fullName`: `string`
  - `entryYear`: `number (int)`
  - `graduationYear`: `number (int)`
- **`PublicLecturerDTO`** (`publicLecturerDtoSchema`):
  - `id`: `string (uuid)`
  - `fullName`: `string`
  - `nidn`: `string | null` *(Note: `nip` is explicitly omitted)*
  - `position`: `string`
  - `expertise`: `string`
  - `education`: `string | null`
  - `biography`: `string | null`
  - `photoPath`: `string | null`
  - `publishedPublicationCount`: `number (int)`
- **`PublicPublicationDTO`** (`publicPublicationDtoSchema`):
  - `id`: `string (uuid)`
  - `title`: `string`
  - `kind`: `'JOURNAL' | 'ARTICLE'`
  - `journalName`: `string`
  - `publicationYear`: `number (int)`
  - `doi`: `string | null`
  - `url`: `string | null`
  - `authors`: `Array<{ id: string; fullName: string; nidn: string | null }>` *(Only published lecturers)*

---

## 3. Router & Procedure Specifications

### 3.1 `publicDashboard` Router (Public Read-Only)
All procedures use `publicProcedure`, take no user filter/search inputs, enforce `.output(...)` DTO schemas, and only read published records.

| Procedure | Type | Input | Output Schema | Visibility Rules |
| --- | --- | --- | --- | --- |
| `publicDashboard.overview` *(alias: `getSummary`)* | `query` | `void` | `publicOverviewDtoSchema` | Counts only `isPublished = true`. Publications counted distinctly only when linked to >=1 published lecturer. |
| `publicDashboard.graduates` *(alias: `getGraduateStats`)* | `query` | `void` | `publicGraduateStatsDtoSchema` | Only `graduates.isPublished = true`. |
| `publicDashboard.lecturers` *(alias: `getLecturers`)* | `query` | `void` | `z.array(publicLecturerDtoSchema)` | Only `lecturers.isPublished = true`. Explicitly excludes `nip`. |
| `publicDashboard.publications` *(alias: `getPublicationStats`)* | `query` | `void` | `publicPublicationStatsDtoSchema` | Only `publications.isPublished = true` linked via `publication_authors` to >=1 lecturer with `lecturers.isPublished = true`. |

---

### 3.2 `graduates` Router (Protected Admin CRUD)
Manages `graduates` records at `/admin/mahasiswa`.

| Procedure | Type | Minimum Role | Input Schema | Behavior & Audit Action |
| --- | --- | --- | --- | --- |
| `graduates.list` | `query` | `EDITOR` | `listGraduatesInputSchema` (`search?`, `isPublished?`, `entryYear?`, `graduationYear?`, `limit`, `offset`) | Bounded pagination (`1..100`). Ordered by `graduationYear DESC, fullName ASC`. |
| `graduates.count` | `query` | `EDITOR` | `listGraduatesInputSchema` (without `limit`/`offset`) | Returns `{ total: number }` matching current filters for server-side pagination. |
| `graduates.stats` | `query` | `EDITOR` | `void` | Returns `{ total, published, draft }` for the Admin Overview. |
| `graduates.getById` *(alias: `byId`)* | `query` | `EDITOR` | `{ id: uuid }` | Returns single graduate record or `NOT_FOUND`. |
| `graduates.create` | `mutation` | `EDITOR` | `createGraduateSchema` | Validates `graduationYear >= entryYear`. Forces `isPublished = false` for `EDITOR`. Logs `GRADUATE_CREATE`. |
| `graduates.update` | `mutation` | `EDITOR` | `updateGraduateSchema` | Validates years. Immediate update preserving `isPublished`. Logs `GRADUATE_UPDATE`. |
| `graduates.setPublished` | `mutation` | `ADMIN` | `setPublishedSchema` | Toggles public visibility. Logs `GRADUATE_PUBLISH` / `GRADUATE_UNPUBLISH`. |
| `graduates.delete` | `mutation` | `ADMIN` | `{ id: uuid }` | Deletes graduate record. Logs `GRADUATE_DELETE`. |

---

### 3.3 `lecturers` Router (Protected Admin CRUD)
Manages `lecturers` records at `/admin/dosen`. `nip` is only returned and editable when the authenticated user has role `ADMIN` or `SUPER_ADMIN` (`EDITOR` receives `nip: null`).

| Procedure | Type | Minimum Role | Input Schema | Behavior & Audit Action |
| --- | --- | --- | --- | --- |
| `lecturers.list` | `query` | `EDITOR` | `listLecturersInputSchema` (`search?`, `isPublished?`, `limit`, `offset`) | Bounded pagination (`1..100`). Returns lecturer records with `publicationCount` ordered by `fullName ASC`. Masks `nip` for `EDITOR`. |
| `lecturers.count` | `query` | `EDITOR` | `listLecturersInputSchema` (without `limit`/`offset`) | Returns `{ total: number }` matching current filters. |
| `lecturers.stats` | `query` | `EDITOR` | `void` | Returns `{ total, published, draft }` for the Admin Overview. |
| `lecturers.getById` *(alias: `byId`)* | `query` | `EDITOR` | `{ id: uuid }` | Returns lecturer record with associated publication count. Masks `nip` for `EDITOR`. |
| `lecturers.create` | `mutation` | `EDITOR` | `createLecturerSchema` | Forces `isPublished = false` and `nip = null` for `EDITOR`. Logs `LECTURER_CREATE` (excludes `nip` from audit metadata). |
| `lecturers.update` | `mutation` | `EDITOR` | `updateLecturerSchema` | Updates lecturer profile fields; preserves existing `nip` if called by `EDITOR`. Logs `LECTURER_UPDATE`. |
| `lecturers.setPublished` | `mutation` | `ADMIN` | `setPublishedSchema` | Toggles lecturer public visibility. Logs `LECTURER_PUBLISH` / `LECTURER_UNPUBLISH`. |
| `lecturers.delete` | `mutation` | `ADMIN` | `{ id: uuid }` | Checks `publication_authors`; fails with `CONFLICT` if lecturer is still linked to publications. Logs `LECTURER_DELETE`. |

---

### 3.4 `publications` Router (Protected Admin CRUD)
Manages `publications` and `publication_authors` at `/admin/publikasi`.

| Procedure | Type | Minimum Role | Input Schema | Behavior & Audit Action |
| --- | --- | --- | --- | --- |
| `publications.list` | `query` | `EDITOR` | `listPublicationsInputSchema` (`search?`, `isPublished?`, `kind?`, `publicationYear?`, `limit`, `offset`) | Bounded pagination (`1..100`). Returns publications with their linked `authors` list. |
| `publications.count` | `query` | `EDITOR` | `listPublicationsInputSchema` (without `limit`/`offset`) | Returns `{ total: number }` of unique publications matching current filters. |
| `publications.stats` | `query` | `EDITOR` | `void` | Returns `{ total, published, draft }` of unique publications for the Admin Overview. |
| `publications.getById` *(alias: `byId`)* | `query` | `EDITOR` | `{ id: uuid }` | Returns publication and linked `lecturerIds`. |
| `publications.create` | `mutation` | `EDITOR` | `createPublicationSchema` (`lecturerIds: uuid[] (min 1, unique)`, safe `http/https` `url`) | Verifies all `lecturerIds` exist in DB. Inserts publication and `publication_authors` within a transaction. Forces `isPublished = false` for `EDITOR`. Logs `PUBLICATION_CREATE`. |
| `publications.update` | `mutation` | `EDITOR` | `updatePublicationSchema` | Verifies `lecturerIds` exist. Updates publication and synchronizes `publication_authors` within a transaction. Logs `PUBLICATION_UPDATE`. |
| `publications.setPublished` | `mutation` | `ADMIN` | `setPublishedSchema` | Verifies publication has >=1 linked lecturer in `publication_authors` before publishing (`BAD_REQUEST` if authorless). Logs `PUBLICATION_PUBLISH` / `PUBLICATION_UNPUBLISH`. |
| `publications.delete` | `mutation` | `ADMIN` | `deletePublicationSchema` (`id`, `confirmUnlinkAuthors`) | Rejects with `CONFLICT` if authors are linked and `confirmUnlinkAuthors !== true`. Removes `publication_authors` links and deletes publication inside a transaction. Logs `PUBLICATION_DELETE`. |

---

### 3.5 `users` Router (Protected User & Role Management)
Manages administrative accounts at `/admin/pengguna`. All outputs are validated with `userDtoSchema` (omitting `passwordHash` and MFA secrets).

| Procedure | Type | Minimum Role | Input Schema | Behavior & Audit Action |
| --- | --- | --- | --- | --- |
| `users.me` | `query` | `EDITOR` | `void` | Returns the live database-verified `UserDTO` for the currently authenticated session. |
| `users.list` | `query` | `ADMIN` | `listUsersInputSchema` (`limit`, `offset`) | Returns `UserDTO[]` (`id`, `name`, `email`, `role`, `isActive`, `mfaEnabled`, `createdAt`, `updatedAt`). |
| `users.getById` *(alias: `byId`)* | `query` | `ADMIN` | `{ id: uuid }` | Returns sanitized `UserDTO`. |
| `users.create` | `mutation` | `ADMIN` | `createUserSchema` | `SUPER_ADMIN` can create any role. `ADMIN` can **only** create `EDITOR` accounts. Hashes password with Argon2id. Logs `USER_CREATE`. |
| `users.changeRole` | `mutation` | `SUPER_ADMIN` | `changeUserRoleSchema` (`id`, `role`, `totpSecretBase32?`) | `SUPER_ADMIN` can assign any role (except demoting the last active `SUPER_ADMIN`). Increments `sessionVersion`. Logs `USER_CHANGE_ROLE`. |
| `users.setActive` | `mutation` | `ADMIN` | `setUserActiveSchema` (`id`, `isActive`) | `SUPER_ADMIN` can activate/deactivate any user except the last active `SUPER_ADMIN`. `ADMIN` can only modify `EDITOR` accounts. Increments `sessionVersion`. Logs `USER_ACTIVATE` / `USER_DEACTIVATE`. |
| `users.changePassword` | `mutation` | `EDITOR` (Self) / `ADMIN` (`EDITOR` targets) / `SUPER_ADMIN` (All) | `changeUserPasswordSchema` (`targetUserId`, `currentPassword?`, `newPassword`) | Self-change requires valid `currentPassword`. Cross-user change enforces `assertCanManageTargetUser`. Hashes with Argon2id and increments `sessionVersion`. Logs `USER_CHANGE_PASSWORD`. |

---

### 3.6 `auditLogs` Router (Protected Audit Inspection)
Provides read-only access to `audit_logs` restricted strictly to `SUPER_ADMIN`.

| Procedure | Type | Minimum Role | Input Schema | Output Summary |
| --- | --- | --- | --- | --- |
| `auditLogs.list` | `query` | `SUPER_ADMIN` | `listAuditLogsInputSchema` (`limit`, `offset`, `entityType?`) | Bounded pagination (`1..100`). Returns recent audit logs joined with actor user `name` and `email`. |

---

## 4. Authenticated Lecturer Photo Upload Endpoint (`POST /api/admin/lecturer-photo`)
Implemented in `src/app/api/admin/lecturer-photo/route.ts` and `src/server/storage/lecturer-photo.ts`:
- **Authentication & Authorization**: Requires an active session verified against `users` in PostgreSQL (`SUPER_ADMIN`, `ADMIN`, or `EDITOR`).
- **Input Format**: `multipart/form-data` with field `file`.
- **Upload Restrictions**:
  - Maximum size: `2 MB` (`2,097,152` bytes).
  - Allowed formats: `JPEG`, `PNG`, `WebP` verified by binary magic bytes (`FF D8 FF`, `89 50 4E 47 0D 0A 1A 0A`, `RIFF....WEBP`) AND decoded via `sharp`.
  - Rejects SVG, XML/HTML scripts, Windows PE/MZ executables, ELF binaries, and corrupted/spoofed files.
  - Re-encodes image server-side via `sharp` to `600x600` `.webp` (stripping EXIF/metadata).
  - Stores under `public/uploads/lecturers/lecturer-<uuid>.webp` with strict path traversal checks.
  - Writes an `audit_logs` entry (`LECTURER_PHOTO_UPLOAD`).
  - Returns `{ photoPath: "/uploads/lecturers/lecturer-<uuid>.webp" }`.
