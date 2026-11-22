param(
    [string]$HostName = "lab-informatika.local",
    [string]$User = "lab"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host " UPDATE DASHBOARD BEELINK T4 PRO (LUBUNTU 26.04) VIA WIFI / LAN" -ForegroundColor Cyan
Write-Host " Target: $User@$HostName" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan

# 1. Jalankan build standalone terbaru di PC pengembang & verifikasi exit code
Write-Host "[1/4] Menjalankan build Next.js standalone terbaru..." -ForegroundColor Yellow
Push-Location $ProjectRoot
pnpm build
if ($LASTEXITCODE -ne 0) {
    Pop-Location
    throw "pnpm build gagal dengan exit code $LASTEXITCODE. Update dibatalkan agar versi lama tidak terkirim."
}
Pop-Location

$StandaloneDir = Join-Path $ProjectRoot ".next\standalone"
if (-not (Test-Path (Join-Path $StandaloneDir "server.js"))) {
    throw "Build gagal: .next\standalone\server.js tidak ditemukan."
}

# 2. Siapkan staging folder tanpa .env lokal dan tanpa menimpa node_modules native Linux di T4 Pro
$StageDir = Join-Path $env:TEMP "t4pro-wifi-stage"
$TempTar = Join-Path $env:TEMP "dashboard-update-t4pro.tar.gz"
if (Test-Path $StageDir) { Remove-Item -Path $StageDir -Recurse -Force }
if (Test-Path $TempTar) { Remove-Item -Path $TempTar -Force }
New-Item -ItemType Directory -Path $StageDir -Force | Out-Null

Write-Host "[2/4] Mengompresi paket update standalone (.next, server.js, public, drizzle)..." -ForegroundColor Yellow
Copy-Item -Path (Join-Path $StandaloneDir "server.js") -Destination $StageDir -Force
Copy-Item -Path (Join-Path $StandaloneDir "package.json") -Destination $StageDir -Force
Copy-Item -Path (Join-Path $StandaloneDir ".next") -Destination (Join-Path $StageDir ".next") -Recurse -Force
Copy-Item -Path (Join-Path $ProjectRoot ".next\static") -Destination (Join-Path $StageDir ".next\static") -Recurse -Force
Copy-Item -Path (Join-Path $ProjectRoot "public") -Destination (Join-Path $StageDir "public") -Recurse -Force
Copy-Item -Path (Join-Path $ProjectRoot "drizzle") -Destination (Join-Path $StageDir "drizzle") -Recurse -Force

# Hapus .env* dan devDependencies jika ada di staging
Get-ChildItem -Path $StageDir -Filter ".env*" -Force -ErrorAction SilentlyContinue | Remove-Item -Force
$StagePkg = Join-Path $StageDir "package.json"
if (Test-Path $StagePkg) {
    $pkg = Get-Content -Path $StagePkg -Raw | ConvertFrom-Json
    if ($pkg.PSObject.Properties.Name -contains "devDependencies") {
        $pkg.PSObject.Properties.Remove("devDependencies")
    }
    $pkg | ConvertTo-Json -Depth 10 | Set-Content -Path $StagePkg -Encoding UTF8
}

Push-Location $StageDir
tar -czf $TempTar .
if ($LASTEXITCODE -ne 0) {
    Pop-Location
    throw "Gagal mengompresi arsip update (exit code $LASTEXITCODE)."
}
Pop-Location
Remove-Item -Path $StageDir -Recurse -Force

# 3. Kirim arsip ke Beelink T4 Pro via SCP
Write-Host "[3/4] Mengirim paket update ke $User@$HostName..." -ForegroundColor Yellow
scp $TempTar "$User@${HostName}:/tmp/dashboard-update-t4pro.tar.gz"
if ($LASTEXITCODE -ne 0) {
    Remove-Item -Path $TempTar -Force -ErrorAction SilentlyContinue
    throw "Pengiriman SCP ke $User@$HostName gagal (exit code $LASTEXITCODE)."
}
Remove-Item -Path $TempTar -Force

# 4. Ekstrak, migrasikan database secara ketat (ON_ERROR_STOP=1), dan restart service + Chromium X11
Write-Host "[4/4] Menerapkan update & migrasi database di Beelink T4 Pro..." -ForegroundColor Yellow
$RemoteScript = @'
set -euo pipefail
echo " -> Mengekstrak paket standalone ke /opt/dashboard-mahasiswa..."
sudo tar -xzf /tmp/dashboard-update-t4pro.tar.gz -C /opt/dashboard-mahasiswa/
rm -f /tmp/dashboard-update-t4pro.tar.gz

echo " -> Memeriksa & menerapkan migrasi SQL PostgreSQL (strict mode)..."
sudo su - postgres -c "psql -d dashboard_mahasiswa -v ON_ERROR_STOP=1" <<'EOSQL'
CREATE TABLE IF NOT EXISTS _dashboard_sql_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
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

for sql_file in /opt/dashboard-mahasiswa/drizzle/*.sql; do
  if [ -f "$sql_file" ]; then
    fname="$(basename "$sql_file")"
    is_applied="$(sudo su - postgres -c "psql -d dashboard_mahasiswa -t -A -c \"SELECT 1 FROM _dashboard_sql_migrations WHERE filename = '${fname}';\"")"
    if [ "$is_applied" = "1" ]; then
      continue
    fi
    echo "    Menerapkan migrasi baru: ${fname}..."
    awk 'BEGIN{RS="--> statement-breakpoint"} {print $0 ";"}' "$sql_file" \
      | sudo su - postgres -c "psql -d dashboard_mahasiswa -v ON_ERROR_STOP=1"
    sudo su - postgres -c "psql -d dashboard_mahasiswa -v ON_ERROR_STOP=1 -c \"INSERT INTO _dashboard_sql_migrations (filename) VALUES ('${fname}') ON CONFLICT DO NOTHING;\""
  fi
done

echo " -> Memuat ulang layanan server standalone..."
sudo systemctl restart dashboard-mahasiswa.service

echo " -> Menyegarkan sesi Chromium Kiosk pada DISPLAY=:0..."
pkill -f '[c]hromium.*localhost:3000' || true
sleep 1
XAUTH="${XAUTHORITY:-$HOME/.Xauthority}"
if [ ! -f "$XAUTH" ]; then
  FOUND_XAUTH="$(find /run/user -maxdepth 3 -name 'Xauthority' 2>/dev/null | head -n 1 || true)"
  if [ -n "$FOUND_XAUTH" ]; then
    XAUTH="$FOUND_XAUTH"
  fi
fi
setsid -f env DISPLAY=:0 XAUTHORITY="$XAUTH" /usr/local/bin/start-dashboard-kiosk-t4pro.sh </dev/null >/dev/null 2>&1

echo "=================================================================="
echo " UPDATE BEELINK T4 PRO BERHASIL!"
echo " - Kiosk Layar Sentuh : 7 Slide (termasuk Slide 7 Jadwal Kuliah)"
echo " - Admin Jadwal       : http://lab-informatika.local:3000/admin/jadwal"
echo "=================================================================="
'@ -replace "`r`n", "`n"

ssh -t "$User@$HostName" "$RemoteScript"
if ($LASTEXITCODE -ne 0) {
    throw "Eksekusi update remote di $User@$HostName gagal (exit code $LASTEXITCODE)."
}

Write-Host "`nUpdate ke Beelink T4 Pro selesai!" -ForegroundColor Green
