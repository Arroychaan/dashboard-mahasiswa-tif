#!/usr/bin/env bash
# ==============================================================================
# AUTO-INSTALLER: Dashboard Lab Informatika UNISSULA (Beelink T4 Pro + Lubuntu 26.04)
# Target Hardware: Intel Celeron N3350 (x86_64), RAM 4GB, eMMC 64GB, Touchscreen
# Architecture: Pre-compiled Next.js Standalone (node server.js) + PostgreSQL 16+
#               + Chromium Touchscreen Kiosk (Intel GPU Hardware Rasterization)
# ==============================================================================

set -euo pipefail

LOG_FILE="/var/log/dashboard-t4pro-setup.log"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "=================================================================="
echo " Instalasi Dashboard Kiosk Hybrid UNISSULA - Beelink T4 Pro (Lubuntu)"
echo " Waktu Mulai: $(date)"
echo "=================================================================="

if [ "$(id -u)" -ne 0 ]; then
  echo "Harap jalankan skrip ini dengan sudo: sudo bash $0"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_SRC_DIR="${SCRIPT_DIR}/app"
INSTALL_DIR="/opt/dashboard-mahasiswa"
KIOSK_USER="${SUDO_USER:-$(awk -F: '$3 == 1000 {print $1}' /etc/passwd | head -n 1)}"
if [ -z "$KIOSK_USER" ]; then
  KIOSK_USER="root"
fi

if [ ! -f "${APP_SRC_DIR}/server.js" ]; then
  echo "ERROR: Bundle standalone (${APP_SRC_DIR}/server.js) tidak ditemukan."
  echo "Pastikan Anda menyiapkan paket menggunakan scripts/prepare-t4pro-bundle.ps1."
  exit 1
fi

# 1. Hostname & mDNS agar mudah diakses dari laptop/HP admin via WiFi/LAN
echo "[1/7] Mengatur hostname jaringan lokal (lab-informatika.local)..."
hostnamectl set-hostname lab-informatika || true
if grep -q "127.0.1.1" /etc/hosts; then
  sed -i 's/127\.0\.1\.1.*/127.0.1.1\tlab-informatika/g' /etc/hosts
else
  echo -e "127.0.1.1\tlab-informatika" >> /etc/hosts
fi

# 2. Pasang paket runtime & driver akselerasi GPU Intel (Apollo Lake HD Graphics 500)
echo "[2/7] Menginstal PostgreSQL, Avahi mDNS, Chromium, dan driver GPU Intel..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y

CHROMIUM_PKG="chromium"
if ! apt-cache show chromium >/dev/null 2>&1; then
  CHROMIUM_PKG="chromium-browser"
fi

apt-get install -y \
  curl ca-certificates gnupg openssl \
  postgresql postgresql-contrib \
  avahi-daemon \
  x11-xserver-utils \
  "$CHROMIUM_PKG" \
  fonts-dejavu-core

# Driver VA-API Intel opsional (tidak menggagalkan instalasi jika nama paket berbeda)
apt-get install -y intel-media-va-driver mesa-va-drivers libva-drm2 2>/dev/null || true

systemctl enable avahi-daemon
systemctl restart avahi-daemon

# Pasang Node.js 20 LTS jika belum tersedia
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d 'v')" -lt 20 ]; then
  echo " -> Menginstal Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

# 3. Tuning PostgreSQL untuk RAM 4GB T4 Pro (~80-150MB footprint operasional)
echo "[3/7] Mengonfigurasi PostgreSQL teroptimasi untuk T4 Pro 4GB RAM..."
systemctl enable postgresql
systemctl start postgresql

PG_CONF=$(su - postgres -c "psql -t -P format=unaligned -c 'SHOW config_file;'" 2>/dev/null || true)
if [ -n "$PG_CONF" ] && [ -f "$PG_CONF" ]; then
  CONF_DIR="$(dirname "$PG_CONF")/conf.d"
  mkdir -p "$CONF_DIR"
  cat > "${CONF_DIR}/99-t4pro-4gb.conf" <<EOF
shared_buffers = 256MB
work_mem = 8MB
maintenance_work_mem = 64MB
effective_cache_size = 1GB
max_connections = 40
checkpoint_completion_target = 0.9
EOF
  systemctl restart postgresql
fi

su - postgres -c "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='postgres'\" | grep -q 1 && psql -c \"ALTER USER postgres WITH PASSWORD 'postgres_dev_password';\""
su - postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='dashboard_mahasiswa'\" | grep -q 1 || psql -c \"CREATE DATABASE dashboard_mahasiswa OWNER postgres;\""

# 4. Salin Pre-Compiled Next.js Standalone Bundle (tanpa .env dari mesin pengembang)
echo "[4/7] Memasang paket aplikasi standalone ke ${INSTALL_DIR}..."
mkdir -p "$INSTALL_DIR"
tar -C "$APP_SRC_DIR" --exclude='.env' --exclude='.env.*' -cf - . | tar -C "$INSTALL_DIR" -xf -

# Buat .env hanya jika belum ada (melindungi AUTH_SECRET & konfigurasi eksisting saat reinstall)
if [ ! -f "${INSTALL_DIR}/.env" ]; then
  GENERATED_SECRET="$(openssl rand -hex 32)"
  cat > "${INSTALL_DIR}/.env" <<EOF
NODE_ENV="production"
AUTH_SECRET="${GENERATED_SECRET}"
AUTH_TRUST_HOST="true"
AUTH_SECURE_COOKIES="false"
DATABASE_URL="postgresql://postgres:postgres_dev_password@localhost:5432/dashboard_mahasiswa"
POSTGRES_USER="postgres"
POSTGRES_PASSWORD="postgres_dev_password"
POSTGRES_DB="dashboard_mahasiswa"
POSTGRES_PORT="5432"
DB_MAX_CONNECTIONS="5"
PORT="3000"
HOSTNAME="0.0.0.0"
EOF
  chmod 600 "${INSTALL_DIR}/.env"
fi

# Pasang dependensi runtime Linux x86_64 dan addon native (@node-rs/argon2 & sharp)
cd "$INSTALL_DIR"
echo " -> Memasang modul runtime Linux x86_64 untuk Next.js standalone..."
npm install --omit=dev --no-audit --no-fund --os=linux --cpu=x64

echo " -> Memastikan modul native Linux x86_64 (@node-rs/argon2, sharp) di direktori terisolasi..."
NATIVE_STAGE="/tmp/t4pro-native-addons"
rm -rf "$NATIVE_STAGE"
mkdir -p "$NATIVE_STAGE"
cat > "${NATIVE_STAGE}/package.json" <<'EOF'
{"name":"t4pro-native-addons","private":true}
EOF
npm --prefix "$NATIVE_STAGE" install --no-save --omit=dev --no-audit --no-fund --os=linux --cpu=x64 @node-rs/argon2 sharp

mkdir -p "${INSTALL_DIR}/node_modules"
rm -rf "${INSTALL_DIR}/node_modules/@node-rs" "${INSTALL_DIR}/node_modules/sharp" "${INSTALL_DIR}/node_modules/@img"
cp -a "${NATIVE_STAGE}/node_modules/." "${INSTALL_DIR}/node_modules/"
rm -rf "$NATIVE_STAGE"

# Verifikasi biner native Linux benar-benar dapat dimuat oleh Node.js sebelum lanjut
cd "$INSTALL_DIR"
node -e "require('@node-rs/argon2'); require('sharp'); console.log(' -> Modul native Linux (@node-rs/argon2 & sharp) terverifikasi OK');"

# 5. Migrasi SQL terlacak (ON_ERROR_STOP=1), seed 5 jadwal dummy, & bootstrap Super Admin
echo "[5/7] Menjalankan migrasi tabel PostgreSQL (strict mode) & inisialisasi data..."
su - postgres -c "psql -d dashboard_mahasiswa -v ON_ERROR_STOP=1" <<'EOSQL'
CREATE TABLE IF NOT EXISTS _dashboard_sql_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
-- Catat migrasi lama secara idempoten jika database pernah diinisialisasi sebelum ledger ini ada
INSERT INTO _dashboard_sql_migrations (filename)
SELECT m.fname FROM (VALUES
  ('0000_familiar_kid_colt.sql', to_regclass('public.users') IS NOT NULL),
  ('0001_chubby_red_ghost.sql', to_regclass('public.users') IS NOT NULL),
  ('0002_magical_silvermane.sql', to_regclass('public.system_settings') IS NOT NULL),
  ('0003_perfect_nuke.sql', to_regclass('public.announcements') IS NOT NULL),
  ('0004_milky_gambit.sql', to_regclass('public.announcements') IS NOT NULL),
  ('0005_volatile_hiroim.sql', to_regclass('public.course_schedules') IS NOT NULL)
) AS m(fname, already_exists)
WHERE m.already_exists
ON CONFLICT (filename) DO NOTHING;
EOSQL

for sql_file in "${INSTALL_DIR}"/drizzle/*.sql; do
  if [ -f "$sql_file" ]; then
    fname="$(basename "$sql_file")"
    is_applied="$(su - postgres -c "psql -d dashboard_mahasiswa -t -A -c \"SELECT 1 FROM _dashboard_sql_migrations WHERE filename = '${fname}';\"")"
    if [ "$is_applied" = "1" ]; then
      echo "    Melewati migrasi sudah terpasang: ${fname}"
      continue
    fi
    echo "    Menerapkan migrasi baru: ${fname}..."
    awk 'BEGIN{RS="--> statement-breakpoint"} {print $0 ";"}' "$sql_file" \
      | su - postgres -c "psql -d dashboard_mahasiswa -v ON_ERROR_STOP=1"
    su - postgres -c "psql -d dashboard_mahasiswa -v ON_ERROR_STOP=1 -c \"INSERT INTO _dashboard_sql_migrations (filename) VALUES ('${fname}') ON CONFLICT DO NOTHING;\""
  fi
done

# Seed 5 jadwal mata kuliah dummy awal (idempoten)
if [ -f "${INSTALL_DIR}/scripts/seed-course-schedules.mjs" ]; then
  node --env-file="${INSTALL_DIR}/.env" "${INSTALL_DIR}/scripts/seed-course-schedules.mjs"
else
  su - postgres -c "psql -d dashboard_mahasiswa -v ON_ERROR_STOP=1" <<'EOSQL'
INSERT INTO course_schedules (day_of_week, start_time, end_time, course_name, class_name, room_name, lecturer_name, semester, academic_year, is_published)
SELECT * FROM (VALUES
  ('SENIN'::day_of_week, '08:00', '09:30', 'Kalkulus', 'A', 'R106', 'Dr. Ir. Hendra Kusuma, M.T.', 1, '2026/2027', true),
  ('SENIN'::day_of_week, '13:00', '14:30', 'Kecerdasan Buatan', 'B', 'R108', 'Dr. Ahmad Fauzi, S.Kom., M.Kom.', 5, '2026/2027', true),
  ('SENIN'::day_of_week, '13:00', '14:30', 'Sistem Biomedis', 'A', 'R109', 'Dr. Siti Rahmawati, S.T., M.Cs.', 5, '2026/2027', true),
  ('SELASA'::day_of_week, '09:45', '11:15', 'Desain Basis Data', 'B', 'R304', 'Budi Santoso, S.Kom., M.T.', 3, '2026/2027', true),
  ('RABU'::day_of_week, '14:45', '16:15', 'Sistem Operasi', 'A', 'R305', 'Nugroho Adi Prasetyo, S.T., M.Kom.', 3, '2026/2027', true)
) AS v(day_of_week, start_time, end_time, course_name, class_name, room_name, lecturer_name, semester, academic_year, is_published)
WHERE NOT EXISTS (SELECT 1 FROM course_schedules LIMIT 1);
EOSQL
fi

# Bootstrap akun SUPER_ADMIN pertama jika belum ada di tabel users (fail loudly jika gagal)
SUPER_ADMIN_COUNT="$(su - postgres -c "psql -d dashboard_mahasiswa -t -A -c \"SELECT COUNT(*) FROM users WHERE role = 'SUPER_ADMIN';\"")"
if [ "${SUPER_ADMIN_COUNT:-0}" -eq 0 ]; then
  if [ ! -f "${INSTALL_DIR}/scripts/bootstrap-super-admin.mjs" ]; then
    echo "ERROR: ${INSTALL_DIR}/scripts/bootstrap-super-admin.mjs tidak ditemukan. Tidak dapat membuat akun SUPER_ADMIN awal."
    exit 1
  fi
  echo " -> Membuat akun SUPER_ADMIN awal (admin@unissula.ac.id)..."
  export BOOTSTRAP_SUPER_ADMIN_NAME="${BOOTSTRAP_SUPER_ADMIN_NAME:-Kepala Lab Informatika}"
  export BOOTSTRAP_SUPER_ADMIN_EMAIL="${BOOTSTRAP_SUPER_ADMIN_EMAIL:-admin@unissula.ac.id}"
  export BOOTSTRAP_SUPER_ADMIN_PASSWORD="${BOOTSTRAP_SUPER_ADMIN_PASSWORD:-PasswordLabUnissula2026!}"
  export BOOTSTRAP_MFA_OUTPUT_FILE="${INSTALL_DIR}/superadmin-mfa.json"
  node --env-file="${INSTALL_DIR}/.env" "${INSTALL_DIR}/scripts/bootstrap-super-admin.mjs"
else
  echo " -> Akun SUPER_ADMIN sudah tersedia (${SUPER_ADMIN_COUNT} akun), melewati bootstrap."
fi

# 6. Buat Systemd Service untuk Server Next.js Standalone (Hemat RAM & Start < 1 detik)
echo "[6/7] Membuat layanan systemd dashboard-mahasiswa.service..."
cat > /etc/systemd/system/dashboard-mahasiswa.service <<EOF
[Unit]
Description=Dashboard Monitoring Program Studi Teknik Informatika UNISSULA (Standalone)
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${INSTALL_DIR}/.env
Environment=NODE_ENV=production
Environment=NODE_OPTIONS=--max-old-space-size=512
ExecStart=/usr/bin/node ${INSTALL_DIR}/server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable dashboard-mahasiswa.service
systemctl restart dashboard-mahasiswa.service

# 7. Konfigurasi Chromium Touchscreen Kiosk & Anti-Sleep LXQt (Lubuntu 26.04)
echo "[7/7] Mengonfigurasi Chromium Touchscreen Kiosk dan anti-sleep Lubuntu LXQt..."
cat > /usr/local/bin/start-dashboard-kiosk-t4pro.sh <<'EOF'
#!/usr/bin/env bash
# Nonaktifkan screen blanking & DPMS di sesi X11 Lubuntu
if [ -n "${DISPLAY:-}" ]; then
  xset -dpms 2>/dev/null || true
  xset s off 2>/dev/null || true
  xset s noblank 2>/dev/null || true
fi

# Tunggu server lokal siap di port 3000
for i in {1..45}; do
  if curl -fsS http://localhost:3000/api/health >/dev/null 2>&1 || curl -fsS http://localhost:3000 >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

mkdir -p /tmp/chromium-cache
CHROMIUM_BIN=$(command -v chromium || command -v chromium-browser)

exec "$CHROMIUM_BIN" \
  --kiosk \
  --incognito \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --touch-events=enabled \
  --disable-pinch \
  --overscroll-history-navigation=0 \
  --enable-gpu-rasterization \
  --enable-zero-copy \
  --ignore-gpu-blocklist \
  --disable-features=Translate,OptimizationHints,MediaRouter \
  --disable-extensions \
  --disable-sync \
  --disable-component-update \
  --check-for-update-interval=31536000 \
  --disk-cache-dir=/tmp/chromium-cache \
  --disk-cache-size=67108864 \
  "http://localhost:3000/"
EOF
chmod +x /usr/local/bin/start-dashboard-kiosk-t4pro.sh

mkdir -p /etc/xdg/autostart
cat > /etc/xdg/autostart/dashboard-kiosk.desktop <<EOF
[Desktop Entry]
Type=Application
Name=Dashboard Kiosk Hybrid UNISSULA
Comment=Menjalankan Dashboard Prodi Teknik Informatika pada Chromium Touchscreen Kiosk
Exec=/usr/local/bin/start-dashboard-kiosk-t4pro.sh
OnlyShowIn=LXQt;XFCE;GNOME;Openbox;
X-GNOME-Autostart-enabled=true
EOF

# Nonaktifkan idle screen sleep LXQt agar layar kiosk menyala 24/7
mkdir -p /etc/xdg/lxqt
cat > /etc/xdg/lxqt/lxqt-powermanagement.conf <<EOF
[General]
enableIdlenessWatcher=false
enableBatteryWatcher=false
EOF

IP_ADDR=$(hostname -I | awk '{print $1}')
echo "=================================================================="
echo " INSTALASI T4 PRO (LUBUNTU 26.04) SELESAI!"
echo " - Kiosk Layar Sentuh  : http://localhost:3000/"
echo " - Panel Admin (mDNS)  : http://lab-informatika.local:3000/admin"
echo " - Panel Admin (IP)    : http://${IP_ADDR}:3000/admin"
echo " - Kelola Jadwal       : http://lab-informatika.local:3000/admin/jadwal"
echo " - Kredensial MFA Awal : ${INSTALL_DIR}/superadmin-mfa.json"
echo " - Kiosk User          : ${KIOSK_USER}"
echo " - Restart perangkat (sudo reboot) untuk langsung masuk Kiosk Mode."
echo "=================================================================="
