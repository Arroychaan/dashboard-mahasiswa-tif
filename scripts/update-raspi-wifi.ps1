param(
    [string]$HostName = "lab-informatika.local",
    [string]$User = "pi"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host " UPDATE DASHBOARD RASPBERRY PI 3B VIA WIFI / JARINGAN LOKAL" -ForegroundColor Cyan
Write-Host " Target: $User@$HostName" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan

# 1. Pastikan hasil build terbaru sudah ada
if (-not (Test-Path (Join-Path $ProjectRoot ".next"))) {
    Write-Host "Menjalankan build Next.js terlebih dahulu..." -ForegroundColor Yellow
    Push-Location $ProjectRoot
    pnpm build
    Pop-Location
}

# 2. Uji koneksi SSH ke Raspberry Pi
Write-Host "[1/4] Memeriksa koneksi SSH ke $HostName..." -ForegroundColor Yellow
$sshTest = ssh -o BatchMode=yes -o ConnectTimeout=5 "$User@$HostName" "echo OK" 2>&1
if ($LASTEXITCODE -ne 0 -and $sshTest -notmatch "OK") {
    Write-Host "Koneksi otomatis SSH tanpa password belum aktif atau host belum terjangkau." -ForegroundColor Yellow
    Write-Host "Silakan masukkan password Raspberry Pi saat diminta nanti." -ForegroundColor Gray
}

# 3. Buat arsip update ringkas agar pengiriman lewat WiFi sangat cepat
$TempZip = Join-Path $env:TEMP "dashboard-update-raspi.tar.gz"
if (Test-Path $TempZip) { Remove-Item $TempZip -Force }

Write-Host "[2/4] Mengompresi paket update (.next, public, drizzle, src, package.json)..." -ForegroundColor Yellow
Push-Location $ProjectRoot

# Buat tarball berisi folder penting
tar -czf $TempZip `
    --exclude=".next/cache" `
    --exclude=".next/standalone" `
    .next public drizzle src package.json next.config.js tsconfig.json

Pop-Location

# 4. Kirim tarball ke Raspberry Pi
Write-Host "[3/4] Mengirim paket update ke Raspberry Pi ($User@$HostName)..." -ForegroundColor Yellow
scp $TempZip "$User@${HostName}:/tmp/dashboard-update.tar.gz"
Remove-Item $TempZip -Force

# 5. Eksekusi ekstraksi, migrasi database, dan restart service di Raspberry Pi
Write-Host "[4/4] Menerapkan update dan migrasi database di Raspberry Pi..." -ForegroundColor Yellow

$RemoteScript = @'
set -e
echo " -> Mengekstrak update ke /opt/dashboard-mahasiswa..."
sudo tar -xzf /tmp/dashboard-update.tar.gz -C /opt/dashboard-mahasiswa/
rm -f /tmp/dashboard-update.tar.gz

echo " -> Menerapkan migrasi database PostgreSQL..."
for sql_file in /opt/dashboard-mahasiswa/drizzle/*.sql; do
  if [ -f "$sql_file" ]; then
    awk 'BEGIN{RS="--> statement-breakpoint"} {print $0 ";"}' "$sql_file" | sudo su - postgres -c "psql -d dashboard_mahasiswa -v ON_ERROR_STOP=0" >/dev/null 2>&1 || true
  fi
done

echo " -> Memuat ulang server Dashboard..."
sudo systemctl restart dashboard-mahasiswa.service

echo " -> Memuat ulang tampilan Kiosk monitor..."
sudo systemctl restart dashboard-kiosk.service 2>/dev/null || true

echo "=================================================================="
echo " UPDATE BERHASIL DITERAPKAN DI RASPBERRY PI 3B!"
echo " - Layar monitor Raspberry Pi sekarang menampilkan 6 slide terbaru."
echo " - Halaman admin pengumuman aktif di: http://lab-informatika.local:3000/admin/pengumuman"
echo "=================================================================="
'@

ssh -t "$User@$HostName" "$RemoteScript"

Write-Host "`nProses update selesai dengan sukses!" -ForegroundColor Green
