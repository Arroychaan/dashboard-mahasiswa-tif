# Deployment Guide — Dashboard Monitoring Laboratorium Informatika UNISSULA

This guide provides step-by-step instructions to deploy the application in two supported target environments:
- **Scenario A:** Laboratory Local Server (LAN / Intranet Digital Signage Appliance)
- **Scenario B:** Public or Campus Cloud VPS with HTTPS Reverse Proxy

---

## 1. Prerequisites

- **Docker Engine** `>= 24.0` and **Docker Compose** `v2.20+`
- **Node.js** `>= 20.11` and **pnpm** `>= 9.x` (only needed on host if running CLI scripts outside the container, otherwise can be run via `docker compose exec`)
- Minimum hardware:
  - 2 vCPU, 2 GB RAM, 20 GB SSD storage

---

## 2. Environment Configuration (`.env`)

1. Copy `.env.example` to `.env` in the repository root:
   ```bash
   cp .env.example .env
   ```
2. Generate strong secrets for `AUTH_SECRET` and `POSTGRES_PASSWORD`:
   ```bash
   openssl rand -base64 32
   ```
3. Configure `.env`:
   ```dotenv
   # Database credentials consumed by docker-compose.prod.yml
   POSTGRES_USER="postgres"
   POSTGRES_PASSWORD="<STRONG_RANDOM_DB_PASSWORD>"
   POSTGRES_DB="dashboard_lab_if_unissula"

   # Host-side DATABASE_URL (used when running migrations/bootstrap from host CLI)
   DATABASE_URL="postgresql://postgres:<STRONG_RANDOM_DB_PASSWORD>@localhost:5432/dashboard_lab_if_unissula"

   # Auth.js secret (minimum 32 characters; also used to derive AES-256-GCM key for TOTP secrets)
   AUTH_SECRET="<STRONG_RANDOM_AUTH_SECRET_MIN_32_CHARS>"

   # Public canonical URL of the deployment
   # Scenario A (Lab LAN): http://192.168.10.50:3000
   # Scenario B (Public HTTPS): https://lab-if.unissula.ac.id
   AUTH_URL="https://lab-if.unissula.ac.id"

   # Port bound on the host machine (127.0.0.1:3000 recommended behind reverse proxy)
   APP_PORT="3000"
   ```

> **Security Note:** Never commit `.env` to version control. Restrict permissions on `.env` (`chmod 600 .env`).

---

## 3. Starting the Production Stack (`docker-compose.prod.yml`)

The production Compose configuration (`docker-compose.prod.yml`) creates an isolated internal bridge network (`internal_db_net`). PostgreSQL is **not** exposed to the public internet; only the `app` service exposes `APP_PORT`. Persistent volumes (`postgres_prod_data` and `lecturer_photos_prod`) preserve database records and uploaded lecturer photos across container rebuilds.

### Step 3.1 — Build and Start PostgreSQL & Application Containers
```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### Step 3.2 — Apply Database Migrations
Before first use (or after pulling schema updates), apply the verified Drizzle SQL migrations against the PostgreSQL container:
```bash
# If running from a machine with pnpm installed and a temporary port mapping, or using a one-off container on the internal network:
docker run --rm --network dashboard-data-mahasiswa_internal_db_net \
  -v "$(pwd):/workspace" -w /workspace \
  -e DATABASE_URL="postgresql://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB:-dashboard_lab_if_unissula}" \
  -e AUTH_SECRET="${AUTH_SECRET}" \
  node:20-alpine sh -c "corepack enable && pnpm db:migrate"
```

### Step 3.3 — One-Time Initial `SUPER_ADMIN` Bootstrap
The system contains zero default accounts. Provision the first `SUPER_ADMIN` account and generate its mandatory TOTP MFA secret and 8 single-use recovery codes:
```bash
docker run --rm -it --network dashboard-data-mahasiswa_internal_db_net \
  -v "$(pwd):/workspace" -w /workspace \
  -e DATABASE_URL="postgresql://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB:-dashboard_lab_if_unissula}" \
  -e AUTH_SECRET="${AUTH_SECRET}" \
  -e BOOTSTRAP_SUPER_ADMIN_NAME="Kepala Lab Informatika" \
  -e BOOTSTRAP_SUPER_ADMIN_EMAIL="kalab.if@unissula.ac.id" \
  -e BOOTSTRAP_SUPER_ADMIN_PASSWORD="<STRONG_12_PLUS_CHAR_PASSWORD>" \
  node:20-alpine sh -c "corepack enable && pnpm admin:bootstrap"
```
1. Scan the `otpauth://` URI (or enter the Base32 secret manually) into an authenticator app (Google Authenticator, Aegis, 1Password, Authy).
2. Store the 8 printed recovery codes in a secure offline vault.
3. Clear your shell history (`history -c`) so `BOOTSTRAP_SUPER_ADMIN_PASSWORD` does not remain in command history.

### Step 3.4 — Verify Application Health
```bash
curl -i http://localhost:3000/api/health
```
Expected response (`200 OK`):
```json
{
  "status": "ok",
  "timestamp": "2026-11-06T00:00:00.000Z",
  "checks": {
    "database": "up"
  }
}
```

---

## 4. Scenario A — Laboratory Local Server Deployment

For deployment on an on-premise mini-PC or server inside the UNISSULA Informatics Laboratory LAN:
1. Assign a static LAN IP to the server (e.g., `192.168.10.50`).
2. Set `AUTH_URL="http://192.168.10.50:3000"` in `.env`.
3. Configure the laboratory Smart TV or kiosk display PC according to `docs/KIOSK_DISPLAY_GUIDE.md` pointing to `http://192.168.10.50:3000/`.
4. Restrict `/admin` access at the campus firewall/VLAN level to laboratory staff subnets if desired.

---

## 5. Scenario B — Public / Campus VPS with HTTPS Reverse Proxy

When deploying on a campus VM or cloud VPS accessible over the internet:
1. Bind the application port to localhost only in `docker-compose.prod.yml` (`127.0.0.1:3000:3000`).
2. Place **Caddy** or **Nginx** in front of `127.0.0.1:3000` for automated TLS termination.

### Example Caddyfile (`/etc/caddy/Caddyfile`)
```caddyfile
lab-if.unissula.ac.id {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000 {
        header_up X-Forwarded-Proto {scheme}
        header_up X-Forwarded-For {remote_host}
        header_up Host {host}
    }
}
```

### Example Nginx Configuration (`/etc/nginx/sites-available/dashboard-lab-if.conf`)
```nginx
limit_req_zone $binary_remote_addr zone=admin_login:10m rate=10r/m;

server {
    listen 443 ssl http2;
    server_name lab-if.unissula.ac.id;

    ssl_certificate     /etc/letsencrypt/live/lab-if.unissula.ac.id/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/lab-if.unissula.ac.id/privkey.pem;

    client_max_body_size 5M;

    location /api/auth/ {
        limit_req zone=admin_login burst=5 nodelay;
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

