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

# 1. Jalankan build standalone terbaru di PC pengembang
Write-Host "[1/4] Memastikan hasil build Next.js standalone terbaru..." -ForegroundColor Yellow
Push-Location $ProjectRoot
pnpm build
Pop-Location

$StandaloneDir = Join-Path $ProjectRoot ".next\standalone"
if (-not (Test-Path (Join-Path $StandaloneDir "server.js"))) {
    throw "Build gagal: .next\standalone\server.js tidak ditemukan."
}

# 2. Siapkan staging folder tanpa menimpa modul native Linux x86_64 di server
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
Copy-Item -Path (Join-Path $ProjectRoot "scripts") -Destination (Join-Path $StageDir "scripts") -Recurse -Force

Push-Location $StageDir
tar -czf $TempTar .
Pop-Location
Remove-Item -Path $StageDir -Recurse -Force

# 3. Kirim arsip ke Beelink T4 Pro via SCP
Write-Host "[3/4] Mengirim paket update ke $User@$HostName..." -ForegroundColor Yellow
scp $TempTar "$User@${HostName}:/tmp/dashboard-update-t4pro.tar.gz"
Remove-Item -Path $TempTar -Force

# 4. Ekstrak, migrasikan database, dan restart service di Lubuntu T4 Pro
Write-Host "[4/4] Menerapkan update & migrasi database di Beelink T4 Pro..." -ForegroundColor Yellow
$RemoteScript = @'
set -e
echo " -> Mengekstrak paket standalone ke /opt/dashboard-mahasiswa..."
sudo tar -xzf /tmp/dashboard-update-t4pro.tar.gz -C /opt/dashboard-mahasiswa/
rm -f /tmp/dashboard-update-t4pro.tar.gz

echo " -> Menerapkan migrasi SQL PostgreSQL..."
for sql_file in /opt/dashboard-mahasiswa/drizzle/*.sql; do
  if [ -f "$sql_file" ]; then
    awk 'BEGIN{RS="--> statement-breakpoint"} {print $0 ";"}' "$sql_file" \
      | sudo su - postgres -c "psql -d dashboard_mahasiswa -v ON_ERROR_STOP=0" >/dev/null 2>&1 || true
  fi
done

echo " -> Memuat ulang layanan server standalone..."
sudo systemctl restart dashboard-mahasiswa.service

echo " -> Menyegarkan sesi Chromium Kiosk..."
pkill -f "chromium.*localhost:3000" 2>/dev/null || true
nohup /usr/local/bin/start-dashboard-kiosk-t4pro.sh >/dev/null 2>&1 &

echo "=================================================================="
echo " UPDATE BEELINK T4 PRO BERHASIL!"
echo " - Kiosk Layar Sentuh : 7 Slide (termasuk Slide 7 Jadwal Kuliah)"
echo " - Admin Jadwal       : http://lab-informatika.local:3000/admin/jadwal"
echo "=================================================================="
'@ -replace "`r`n", "`n"

ssh -t "$User@$HostName" "$RemoteScript"

Write-Host "`nUpdate ke Beelink T4 Pro selesai!" -ForegroundColor Green
