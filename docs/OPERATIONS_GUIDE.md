# Operations, Backup & Recovery Guide

**Project:** Dashboard Monitoring Laboratorium Informatika UNISSULA

---

## 1. Routine Service Management

### Start / Stop / Restart Services
```bash
# Start in background
docker compose -f docker-compose.prod.yml up -d

# Restart application container without database downtime
docker compose -f docker-compose.prod.yml restart app

# Stop all containers (data volumes remain intact)
docker compose -f docker-compose.prod.yml down
```

> **Caution:** Never run `docker compose -f docker-compose.prod.yml down -v` in production, as the `-v` flag deletes persistent PostgreSQL and photo volumes.

### Inspecting Logs & Health Status
```bash
# View container status and healthcheck state
docker compose -f docker-compose.prod.yml ps

# Tail application logs
docker compose -f docker-compose.prod.yml logs -f --tail=100 app

# Tail PostgreSQL logs
docker compose -f docker-compose.prod.yml logs -f --tail=100 db

# Check health endpoint directly
curl -fsS http://localhost:3000/api/health
```

---

## 2. Database Backup & Restore Procedures

### 2.1 Creating a Verified PostgreSQL Backup (`pg_dump`)
Run the following command to create a compressed, timestamped custom-format PostgreSQL dump (`-Fc`):
```bash
mkdir -p ./backups/postgres
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-dashboard_lab_if_unissula}" -Fc \
  > "./backups/postgres/db_backup_${TIMESTAMP}.dump"
```
Verify the backup archive integrity:
```bash
ls -lh "./backups/postgres/db_backup_${TIMESTAMP}.dump"
```

### 2.2 Restoring PostgreSQL from Backup (`pg_restore`)
To restore a `.dump` archive into the PostgreSQL container:
```bash
# 1. Stop the app container to prevent active writes during restore
docker compose -f docker-compose.prod.yml stop app

# 2. Restore the dump with --clean --if-exists
cat "./backups/postgres/db_backup_<TIMESTAMP>.dump" | \
  docker compose -f docker-compose.prod.yml exec -T db \
  pg_restore -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-dashboard_lab_if_unissula}" --clean --if-exists --no-owner

# 3. Start the app container
docker compose -f docker-compose.prod.yml start app
```

---

## 3. Lecturer Photo Storage Backup & Restore

Uploaded lecturer profile photos are stored in the Docker volume `lecturer_photos_prod` mounted at `/app/public/uploads/lecturers`.

### 3.1 Backing Up Uploaded Lecturer Photos
```bash
mkdir -p ./backups/photos
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

docker compose -f docker-compose.prod.yml exec -T app \
  tar -czf - -C /app/public/uploads/lecturers . \
  > "./backups/photos/lecturer_photos_${TIMESTAMP}.tar.gz"
```

### 3.2 Restoring Uploaded Lecturer Photos
```bash
cat "./backups/photos/lecturer_photos_<TIMESTAMP>.tar.gz" | \
  docker compose -f docker-compose.prod.yml exec -T app \
  tar -xzf - -C /app/public/uploads/lecturers
```

---

## 4. MFA Recovery & Account Emergency Procedures

### 4.1 Using a Recovery Code (`SUPER_ADMIN`)
Each `SUPER_ADMIN` receives 8 single-use recovery codes (format `XXXX-XXXX-XXXX`) when provisioned or when rotating MFA:
1. Navigate to `/admin/login`.
2. Enter Email, Password, and one unused **Kode Pemulihan (Recovery Code)** in the MFA recovery field.
3. The recovery code is consumed atomically and recorded in `audit_logs` (`AUTH_LOGIN_SUCCESS` with `mfaMethod: "RECOVERY_CODE"`).
4. Immediately navigate to `/admin/pengguna` and click **Rotasi MFA** on your account to generate a fresh TOTP secret and 8 new recovery codes.

### 4.2 Rotating MFA via Admin Interface
Any active `SUPER_ADMIN` can rotate their own or another `SUPER_ADMIN`'s TOTP secret and recovery codes from `/admin/pengguna` -> **Rotasi MFA**. The new Base32 secret, `otpauth://` URI, and 8 recovery codes are displayed once in a modal dialog.

### 4.3 Secret Rotation (`AUTH_SECRET`)
> **Important:** Because `SUPER_ADMIN` TOTP secrets are encrypted at rest with AES-256-GCM using a key derived from `AUTH_SECRET`, rotating `AUTH_SECRET` invalidates existing encrypted TOTP secrets in `users.mfaSecretEncrypted`.
If `AUTH_SECRET` must be rotated after a suspected key compromise:
1. Update `AUTH_SECRET` in `.env` and restart the `app` container.
2. Connect to PostgreSQL to clear `mfa_secret_encrypted` for the primary `SUPER_ADMIN` or re-enroll MFA via `Rotasi MFA`.

