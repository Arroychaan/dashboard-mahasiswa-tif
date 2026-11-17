#!/usr/bin/env bash
# ==============================================================================
# AUTO-INSTALLER: Dashboard Laboratorium Informatika UNISSULA (Raspberry Pi 3B)
# Optimized for: Raspberry Pi 3B (1GB RAM, 32GB SD Card, WiFi, HDMI Monitor)
# Mode:
#   - Monitor HDMI Raspi -> Fullscreen Public Dashboard Kiosk (http://localhost:3000)
#   - Admin Panel        -> Diakses dari Laptop/HP lain via WiFi
#                           (http://lab-informatika.local:3000/admin)
# ==============================================================================

set -euo pipefail

LOG_FILE="/var/log/dashboard-raspi-setup.log"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "=================================================================="
echo " Memulai Instalasi Otomatis Dashboard Lab Informatika UNISSULA"
echo " Waktu Mulai: $(date)"
echo "=================================================================="

if [ "$(id -u)" -ne 0 ]; then
  echo "Harap jalankan skrip ini dengan sudo: sudo bash $0"
  exit 1
fi

# 1. Tentukan lokasi sumber paket di SD Card (/boot/firmware atau /boot)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_SRC_DIR="${SCRIPT_DIR}/app"
INSTALL_DIR="/opt/dashboard-mahasiswa"
BOOT_DIR="/boot/firmware"
if [ ! -d "$BOOT_DIR" ]; then
  BOOT_DIR="/boot"
fi

# 2. Tunggu koneksi internet WiFi (maksimal 90 detik saat first-boot)
echo "[1/8] Memeriksa koneksi jaringan WiFi..."
for i in {1..30}; do
  if ping -c 1 -W 2 8.8.8.8 >/dev/null 2>&1 || ping -c 1 -W 2 deb.debian.org >/dev/null 2>&1; then
    echo " -> Koneksi internet WiFi terhubung!"
    break
  fi
  echo " -> Menunggu koneksi WiFi... ($i/30)"
  sleep 3
done

# 3. Optimasi Swap 2GB untuk membantu RAM 1GB Raspberry Pi 3B
echo "[2/8] Mengoptimalkan memori Swap 2GB untuk Raspberry Pi 3B..."
if ! swapon --show | grep -q "/swapfile"; then
  if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
    chmod 600 /swapfile
    mkswap /swapfile
  fi
  swapon /swapfile || true
  if ! grep -q "/swapfile" /etc/fstab; then
    echo "/swapfile none swap sw 0 0" >> /etc/fstab
  fi
fi
sysctl -w vm.swappiness=20 >/dev/null 2>&1 || true
echo "vm.swappiness=20" > /etc/sysctl.d/99-dashboard-swap.conf

# 4. Set Hostname ke 'lab-informatika' agar bisa diakses via http://lab-informatika.local:3000
echo "[3/8] Mengatur hostname jaringan lokal (lab-informatika.local)..."
hostnamectl set-hostname lab-informatika || true
sed -i 's/127.0.1.1.*/127.0.1.1\tlab-informatika/g' /etc/hosts || true

# 5. Install paket sistem (PostgreSQL, Avahi mDNS, X11 Kiosk & Chromium)
echo "[4/8] Menginstal PostgreSQL, Node.js, dan komponen Kiosk Layar Penuh..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y

# Deteksi nama paket chromium di Debian/Raspberry Pi OS (chromium atau chromium-browser)
CHROMIUM_PKG="chromium"
if ! apt-cache show chromium >/dev/null 2>&1; then
  CHROMIUM_PKG="chromium-browser"
fi

apt-get install -y \
  curl ca-certificates gnupg build-essential \
  postgresql postgresql-contrib \
  avahi-daemon \
  xserver-xorg x11-xserver-utils xinit openbox \
  "$CHROMIUM_PKG" unclutter \
  fonts-dejavu-core

systemctl enable avahi-daemon
systemctl restart avahi-daemon

# Install Node.js 20 LTS jika belum ada atau versi < 20
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d 'v')" -lt 20 ]; then
  echo " -> Menginstal Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
corepack enable || npm install -g pnpm

# 6. Konfigurasi Database PostgreSQL Hemat RAM (~35MB RAM)
echo "[5/8] Mengonfigurasi PostgreSQL hemat memori untuk Raspberry Pi 3B..."
systemctl enable postgresql
systemctl start postgresql

PG_CONF=$(su - postgres -c "psql -t -P format=unaligned -c 'SHOW config_file;'" 2>/dev/null || true)
if [ -n "$PG_CONF" ] && [ -f "$PG_CONF" ]; then
  CONF_DIR="$(dirname "$PG_CONF")/conf.d"
  mkdir -p "$CONF_DIR"
  cat > "${CONF_DIR}/99-raspi-lowmem.conf" <<EOF
shared_buffers = 64MB
work_mem = 4MB
maintenance_work_mem = 32MB
effective_cache_size = 256MB
max_connections = 25
EOF
  systemctl restart postgresql
fi

su - postgres -c "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='postgres'\" | grep -q 1 && psql -c \"ALTER USER postgres WITH PASSWORD 'postgres_dev_password';\""
su - postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='dashboard_mahasiswa'\" | grep -q 1 || psql -c \"CREATE DATABASE dashboard_mahasiswa OWNER postgres;\""

# 7. Salin & Siapkan Aplikasi Dashboard di /opt/dashboard-mahasiswa
echo "[6/8] Memasang aplikasi Dashboard di ${INSTALL_DIR}..."
mkdir -p "$INSTALL_DIR"
cp -r "${APP_SRC_DIR}/." "$INSTALL_DIR/"

cat > "${INSTALL_DIR}/.env" <<EOF
NODE_ENV="production"
AUTH_SECRET="dev-only-placeholder-secret-key-at-least-32-chars"
AUTH_TRUST_HOST="true"
AUTH_SECURE_COOKIES="false"
DATABASE_URL="postgresql://postgres:postgres_dev_password@localhost:5432/dashboard_mahasiswa"
POSTGRES_USER="postgres"
POSTGRES_PASSWORD="postgres_dev_password"
POSTGRES_DB="dashboard_mahasiswa"
POSTGRES_PORT="5432"
DB_MAX_CONNECTIONS="3"
PORT="3000"
HOSTNAME="0.0.0.0"
EOF

cd "$INSTALL_DIR"
echo " -> Memasang modul runtime Linux ARM untuk Raspberry Pi..."
CI=true pnpm install --prod --no-frozen-lockfile || npm install --omit=dev --no-audit --no-fund

# Jalankan migrasi SQL langsung ke PostgreSQL
echo " -> Menjalankan migrasi tabel database..."
for sql_file in "${INSTALL_DIR}"/drizzle/*.sql; do
  if [ -f "$sql_file" ]; then
    echo "    Menerapkan $(basename "$sql_file")..."
    awk 'BEGIN{RS="--> statement-breakpoint"} {print $0 ";"}' "$sql_file" | su - postgres -c "psql -d dashboard_mahasiswa -v ON_ERROR_STOP=0" >/dev/null 2>&1 || true
  fi
done

# Buat akun Super Admin pertama dengan TOTP Secret yang sama agar Recovery Code tetap sama
echo " -> Menyiapkan akun Super Admin (admin@unissula.ac.id)..."
export BOOTSTRAP_SUPER_ADMIN_NAME="Kepala Lab Informatika"
export BOOTSTRAP_SUPER_ADMIN_EMAIL="admin@unissula.ac.id"
export BOOTSTRAP_SUPER_ADMIN_PASSWORD="PasswordLabUnissula2026!"
export BOOTSTRAP_SUPER_ADMIN_TOTP_SECRET="CZPWXPCI4KUNLKPKZLRLTC3AEZGPUYAZ"
export BOOTSTRAP_MFA_OUTPUT_FILE="${INSTALL_DIR}/superadmin-mfa.json"
npx tsx --env-file=.env scripts/bootstrap-super-admin.ts || true

if [ -f "${INSTALL_DIR}/superadmin-mfa.json" ]; then
  cp "${INSTALL_DIR}/superadmin-mfa.json" "${BOOT_DIR}/superadmin-mfa.json" || true
fi

# 8. Buat Systemd Service untuk Server Dashboard
echo "[7/8] Membuat layanan otomatis Server Dashboard (Port 3000)..."
cat > /etc/systemd/system/dashboard-mahasiswa.service <<EOF
[Unit]
Description=Dashboard Monitoring Laboratorium Informatika UNISSULA
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${INSTALL_DIR}/.env
Environment=NODE_ENV=production
Environment=NODE_OPTIONS=--max-old-space-size=256
ExecStart=/usr/bin/env npx next start -H 0.0.0.0 -p 3000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable dashboard-mahasiswa.service
systemctl restart dashboard-mahasiswa.service

# 9. Buat Mode Kiosk Layar Penuh (Monitor Raspi HANYA Menampilkan Dashboard Publik)
echo "[8/8] Mengonfigurasi Mode Kiosk Layar Penuh untuk Monitor..."
KIOSK_USER=$(awk -F: '$3 == 1000 {print $1}' /etc/passwd)
if [ -z "$KIOSK_USER" ]; then
  KIOSK_USER="root"
fi

cat > /usr/local/bin/start-dashboard-kiosk.sh <<'EOF'
#!/usr/bin/env bash
xset -dpms
xset s off
xset s noblank

openbox-session &
unclutter -idle 0.5 -root &

# Tunggu sampai server lokal siap di port 3000
for i in {1..60}; do
  if curl -s http://localhost:3000/api/health >/dev/null 2>&1 || curl -s http://localhost:3000 >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

CHROMIUM_BIN=$(command -v chromium || command -v chromium-browser)
exec "$CHROMIUM_BIN" \
  --kiosk \
  --incognito \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-features=TranslateUI \
  --overscroll-history-navigation=0 \
  --check-for-update-interval=31536000 \
  --memory-pressure-off \
  "http://localhost:3000"
EOF
chmod +x /usr/local/bin/start-dashboard-kiosk.sh

# Untuk Raspberry Pi OS Desktop (X11/Wayland Autostart)
mkdir -p /etc/xdg/autostart
cat > /etc/xdg/autostart/dashboard-kiosk.desktop <<EOF
[Desktop Entry]
Type=Application
Name=Dashboard Kiosk UNISSULA
Exec=/usr/local/bin/start-dashboard-kiosk.sh
X-GNOME-Autostart-enabled=true
EOF

# Untuk Raspberry Pi OS Lite (Tanpa Desktop berat, langsung Xinit Kiosk)
cat > /etc/systemd/system/dashboard-kiosk.service <<EOF
[Unit]
Description=Chromium Kiosk Display - Dashboard Lab Informatika
After=dashboard-mahasiswa.service systemd-user-sessions.service
Wants=dashboard-mahasiswa.service

[Service]
User=${KIOSK_USER}
TTYPath=/dev/tty1
StandardInput=tty
StandardOutput=journal
ExecStart=/usr/bin/xinit /usr/local/bin/start-dashboard-kiosk.sh -- :0 vt1 -nocursor
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# Aktifkan service kiosk jika sistem tidak menjalankan display-manager berat
if ! systemctl is-active --quiet lightdm && ! systemctl is-active --quiet gdm3; then
  systemctl enable dashboard-kiosk.service
  systemctl start dashboard-kiosk.service || true
fi

IP_ADDR=$(hostname -I | awk '{print $1}')
echo "=================================================================="
echo " INSTALASI SELESAI!"
echo " - Layar Monitor Raspi : Otomatis menampilkan Dashboard Publik"
echo " - Akses Admin (WiFi)  : http://lab-informatika.local:3000/admin"
echo " - Akses Admin (IP)    : http://${IP_ADDR}:3000/admin"
echo " - Email Super Admin   : admin@unissula.ac.id"
echo " - Password            : PasswordLabUnissula2026!"
echo " - Recovery Code MFA   : Lihat file superadmin-mfa.json"
echo "=================================================================="
