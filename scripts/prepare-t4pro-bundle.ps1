param(
    [string]$TargetDrive = "",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$BundleDir = Join-Path $ProjectRoot "deploy\t4pro-lubuntu\usb-bundle\t4pro-dashboard"
$AppDir = Join-Path $BundleDir "app"
$StandaloneDir = Join-Path $ProjectRoot ".next\standalone"

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host " Menyiapkan Pre-Compiled Standalone Bundle untuk Beelink T4 Pro" -ForegroundColor Cyan
Write-Host " Target OS: Lubuntu 26.04 LTS (x86_64 + Touchscreen Kiosk)" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan

# 1. Jalankan build standalone terbaru (kecuali -SkipBuild diminta secara eksplisit)
if (-not $SkipBuild -or -not (Test-Path (Join-Path $StandaloneDir "server.js"))) {
    Write-Host "[1/5] Menjalankan pnpm build (standalone) di PC pengembang..." -ForegroundColor Yellow
    Push-Location $ProjectRoot
    pnpm build
    if ($LASTEXITCODE -ne 0) {
        Pop-Location
        throw "pnpm build gagal dengan exit code $LASTEXITCODE. Pengemasan dibatalkan."
    }
    Pop-Location
} else {
    Write-Host "[1/5] Melewati build (-SkipBuild); memakai .next\standalone yang ada..." -ForegroundColor Yellow
}

if (-not (Test-Path (Join-Path $StandaloneDir "server.js"))) {
    throw "Artefak .next\standalone\server.js tidak ditemukan."
}

# 2. Susun struktur bundle tanpa membocorkan .env lokal maupun devDependencies
Write-Host "[2/5] Menyusun paket standalone bersih di $BundleDir..." -ForegroundColor Yellow
if (Test-Path $BundleDir) {
    Remove-Item -Path $BundleDir -Recurse -Force
}
New-Item -ItemType Directory -Path $AppDir -Force | Out-Null

# Salin server.js, package.json, dan .next dari .next/standalone (TANPA node_modules
# Windows yang berisi cyclic NTFS junction pnpm dan TANPA file .env* lokal)
Copy-Item -Path (Join-Path $StandaloneDir "server.js") -Destination $AppDir -Force
Copy-Item -Path (Join-Path $StandaloneDir "package.json") -Destination $AppDir -Force
Copy-Item -Path (Join-Path $StandaloneDir ".next") -Destination (Join-Path $AppDir ".next") -Recurse -Force
if (Test-Path (Join-Path $ProjectRoot "pnpm-lock.yaml")) {
    Copy-Item -Path (Join-Path $ProjectRoot "pnpm-lock.yaml") -Destination $AppDir -Force
}

# Wajib: pastikan tidak ada file .env* lokal tersisa di bundle USB
Get-ChildItem -Path $AppDir -Filter ".env*" -Force -ErrorAction SilentlyContinue | Remove-Item -Force

# Bersihkan devDependencies dari package.json di bundle agar runtime tetap ramping
$PkgJsonPath = Join-Path $AppDir "package.json"
if (Test-Path $PkgJsonPath) {
    $pkg = Get-Content -Path $PkgJsonPath -Raw | ConvertFrom-Json
    if ($pkg.PSObject.Properties.Name -contains "devDependencies") {
        $pkg.PSObject.Properties.Remove("devDependencies")
    }
    $pkg | ConvertTo-Json -Depth 10 | Set-Content -Path $PkgJsonPath -Encoding UTF8
}

# Wajib: salin .next/static, public, dan migrasi SQL drizzle
$StaticDst = Join-Path $AppDir ".next\static"
New-Item -ItemType Directory -Path $StaticDst -Force | Out-Null
Copy-Item -Path (Join-Path $ProjectRoot ".next\static\*") -Destination $StaticDst -Recurse -Force
Copy-Item -Path (Join-Path $ProjectRoot "public") -Destination (Join-Path $AppDir "public") -Recurse -Force
Copy-Item -Path (Join-Path $ProjectRoot "drizzle") -Destination (Join-Path $AppDir "drizzle") -Recurse -Force

# 3. Pre-bundle skrip CLI (bootstrap-super-admin & seed-course-schedules) menjadi ESM mandiri (.mjs)
Write-Host "[3/5] Mengompilasi skrip bootstrap & seed menjadi modul ESM mandiri (.mjs)..." -ForegroundColor Yellow
$EsbuildBin = Get-ChildItem -Path (Join-Path $ProjectRoot "node_modules\.pnpm\esbuild@*\node_modules\esbuild\bin\esbuild") -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
if (-not $EsbuildBin) {
    throw "esbuild tidak ditemukan di node_modules. Jalankan pnpm install terlebih dahulu."
}

$ScriptsDst = Join-Path $AppDir "scripts"
New-Item -ItemType Directory -Path $ScriptsDst -Force | Out-Null
$EsmBanner = "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);"

Push-Location $ProjectRoot
node $EsbuildBin "scripts/bootstrap-super-admin.ts" `
    --bundle --platform=node --format=esm `
    "--banner:js=$EsmBanner" `
    "--external:@node-rs/argon2" `
    "--tsconfig=tsconfig.json" `
    "--outfile=$(Join-Path $ScriptsDst 'bootstrap-super-admin.mjs')"
if ($LASTEXITCODE -ne 0) {
    Pop-Location
    throw "Gagal membundel bootstrap-super-admin.mjs (exit code $LASTEXITCODE)."
}

node $EsbuildBin "scripts/seed-course-schedules.ts" `
    --bundle --platform=node --format=esm `
    "--banner:js=$EsmBanner" `
    "--tsconfig=tsconfig.json" `
    "--outfile=$(Join-Path $ScriptsDst 'seed-course-schedules.mjs')"
if ($LASTEXITCODE -ne 0) {
    Pop-Location
    throw "Gagal membundel seed-course-schedules.mjs (exit code $LASTEXITCODE)."
}
Pop-Location

# 4. Salin setup-lubuntu.sh dengan normalisasi line ending LF (Linux)
Write-Host "[4/5] Menyiapkan skrip setup-lubuntu.sh (format LF)..." -ForegroundColor Yellow
$SetupSrc = Join-Path $ProjectRoot "deploy\t4pro-lubuntu\setup-lubuntu.sh"
$SetupDst = Join-Path $BundleDir "setup-lubuntu.sh"
$RawSh = [System.IO.File]::ReadAllText($SetupSrc) -replace "`r`n", "`n"
[System.IO.File]::WriteAllText($SetupDst, $RawSh, (New-Object System.Text.UTF8Encoding($false)))

# 5. Salin ke Flashdisk USB jika parameter TargetDrive diberikan (mis. -TargetDrive "E:")
if ($TargetDrive -ne "" -and (Test-Path "$TargetDrive\")) {
    $UsbDest = "$TargetDrive\t4pro-dashboard"
    Write-Host "[5/5] Menyalin paket ke USB Drive ($UsbDest)..." -ForegroundColor Green
    if (Test-Path $UsbDest) {
        Remove-Item -Path $UsbDest -Recurse -Force
    }
    Copy-Item -Path $BundleDir -Destination $UsbDest -Recurse -Force
} else {
    Write-Host "[5/5] Paket tersimpan lokal di: $BundleDir" -ForegroundColor Green
    Write-Host "      Salin folder 't4pro-dashboard' ke flashdisk USB lalu jalankan di T4 Pro:" -ForegroundColor Gray
    Write-Host "      sudo bash setup-lubuntu.sh" -ForegroundColor White
}

Write-Host "==================================================================" -ForegroundColor Green
Write-Host " SELESAI! Bundle standalone siap dipasang di Beelink T4 Pro." -ForegroundColor Green
Write-Host "==================================================================" -ForegroundColor Green
