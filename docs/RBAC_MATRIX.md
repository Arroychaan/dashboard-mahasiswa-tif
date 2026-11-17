# Role-Based Access Control (RBAC) & Security Matrix

## 1. Defined Roles (`user_role` Enum)
1. **`SUPER_ADMIN`**:
   - Full CRUD and publication approval (`setPublished`) authority across `graduates`, `lecturers`, and `publications`.
   - Creates and manages user accounts of any role (`SUPER_ADMIN`, `ADMIN`, `EDITOR`), subject to the **Last Active `SUPER_ADMIN` Safeguard**.
   - Mandatory **TOTP MFA** (`mfa_enabled = true`, AES-256-GCM encrypted secret, Argon2id hashed one-time recovery codes). Sessions without `mfaVerified === true` are rejected by server-side authorization middleware.
   - Exclusive read access to `auditLogs.list`.
2. **`ADMIN`**:
   - Full CRUD, deletion, and publication approval (`setPublished`) authority across `graduates`, `lecturers`, and `publications`.
   - Can create and manage **`EDITOR` accounts only** (`users.create` with `role: 'EDITOR'`, `users.setActive` and `users.changePassword` on `EDITOR` targets).
   - **Cannot** modify `ADMIN` or `SUPER_ADMIN` accounts.
   - **Cannot** promote themselves or assign `ADMIN` or `SUPER_ADMIN` roles.
   - **Cannot** access sensitive audit logs (`auditLogs.list`).
3. **`EDITOR`**:
   - Creates and updates draft records in `graduates`, `lecturers`, and `publications` (including assigning `publication_authors`).
   - Views admin data needed for editing (`graduates.list`, `lecturers.list`, `publications.list`).
   - **Cannot** publish, unpublish, or delete content (`setPublished` and `delete` are restricted to `ADMIN` and `SUPER_ADMIN`; `isPublished` on `create` is forced to `false`).
   - **Cannot** manage users, change roles, or view user lists (`users.*` denied, except changing their own password via `users.changePassword` with `currentPassword`).
   - **Cannot** access `auditLogs.list`.
4. **`PUBLIC` (Unauthenticated)**:
   - Read-only access to `/` and `publicDashboard.*` procedures.
   - No access to any `/admin/*` management routes or protected tRPC routers.

---

## 2. tRPC Procedure Permission Matrix

| Procedure | `PUBLIC` | `EDITOR` | `ADMIN` | `SUPER_ADMIN` (MFA Verified) |
| --- | :---: | :---: | :---: | :---: |
| `publicDashboard.overview` / `graduates` / `lecturers` / `publications` | Allow | Allow | Allow | Allow |
| `graduates.list` / `getById` | Deny (`UNAUTHORIZED`) | Allow | Allow | Allow |
| `graduates.create` / `update` | Deny (`UNAUTHORIZED`) | Allow (`isPublished` forced `false` on create) | Allow | Allow |
| `graduates.setPublished` / `delete` | Deny (`UNAUTHORIZED`) | Deny (`FORBIDDEN`) | Allow | Allow |
| `lecturers.list` / `getById` | Deny (`UNAUTHORIZED`) | Allow | Allow | Allow |
| `lecturers.create` / `update` | Deny (`UNAUTHORIZED`) | Allow (`isPublished` forced `false` on create) | Allow | Allow |
| `lecturers.setPublished` / `delete` | Deny (`UNAUTHORIZED`) | Deny (`FORBIDDEN`) | Allow | Allow |
| `publications.list` / `getById` | Deny (`UNAUTHORIZED`) | Allow | Allow | Allow |
| `publications.create` / `update` | Deny (`UNAUTHORIZED`) | Allow (`isPublished` forced `false` on create) | Allow | Allow |
| `publications.setPublished` / `delete` | Deny (`UNAUTHORIZED`) | Deny (`FORBIDDEN`) | Allow | Allow |
| `users.list` / `getById` | Deny (`UNAUTHORIZED`) | Deny (`FORBIDDEN`) | Allow | Allow |
| `users.create` | Deny (`UNAUTHORIZED`) | Deny (`FORBIDDEN`) | Allow (`EDITOR` role only) | Allow (Any role) |
| `users.changeRole` | Deny (`UNAUTHORIZED`) | Deny (`FORBIDDEN`) | Deny (`FORBIDDEN` for `ADMIN`/`SUPER_ADMIN` targets or roles) | Allow (Except last active `SUPER_ADMIN`) |
| `users.setActive` | Deny (`UNAUTHORIZED`) | Deny (`FORBIDDEN`) | Allow (`EDITOR` targets only) | Allow (Except last active `SUPER_ADMIN`) |
| `users.changePassword` | Deny (`UNAUTHORIZED`) | Allow (Self only, requires `currentPassword`) | Allow (Self or `EDITOR` targets) | Allow (Any user) |
| `auditLogs.list` | Deny (`UNAUTHORIZED`) | Deny (`FORBIDDEN`) | Deny (`FORBIDDEN`) | Allow |

---

## 3. Security & Authorization Controls (OWASP ASVS 5.0 Aligned)
1. **Password Hashing**: Argon2id (`@node-rs/argon2`, `memoryCost: 19456 KiB`, `timeCost: 2`, `parallelism: 1`, `outputLen: 32`) with dummy verification against non-existent accounts to mitigate timing-based user enumeration.
2. **Mandatory TOTP MFA for `SUPER_ADMIN`**:
   - RFC 6238 TOTP (`otpauth`) with Base32 secrets encrypted at rest using AES-256-GCM (96-bit random IV, 128-bit auth tag, HKDF-SHA256 derived key) and 8 one-time recovery codes hashed with Argon2id.
   - Both login (`authenticateUserCredentials`) and protected tRPC middleware (`enforceAuthenticatedActiveUser`) verify `mfaEnabled`, `mfaSecretEncrypted`, and `session.user.mfaVerified === true`.
3. **Live Database Re-Verification & Session Invalidation**:
   - Every protected tRPC call queries `users` by ID to verify `isActive === true`, `role === session.user.role`, and `sessionVersion === session.user.sessionVersion`.
   - Any role change, password change, or account deactivation increments `sessionVersion`, immediately invalidating existing sessions.
4. **Authentication Rate Limiting**:
   - Sliding 15-minute window locks out repeated failed authentication attempts after 5 failures for 15 minutes (`RATE_LIMITED`).
5. **Audit Logging & Secret Redaction**:
   - All mutations and authentication events write to `audit_logs` via `writeAuditLog`, which recursively strips forbidden secret keys (`password`, `passwordHash`, `mfaSecret`, `recoveryCodes`, `token`, `nim`, etc.).
