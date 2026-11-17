# Public Digital Signage & TV Kiosk Display Guide

## 1. Overview
The root route (`/`) of the **Dashboard Monitoring Laboratorium Informatika UNISSULA** is engineered as a zero-interaction, read-only digital signage display for laboratory television monitors (`1920x1080` Full HD and `3840x2160` 4K UHD) as well as standard desktop and tablet web visitors.

- **Authentication**: None required (`/` is publicly readable).
- **Data Source**: Exclusively consumes `publicDashboard.overview`, `publicDashboard.graduates`, `publicDashboard.lecturers`, and `publicDashboard.publications`. Only records explicitly published (`isPublished = true`) by an `ADMIN` or `SUPER_ADMIN` are displayed.
- **Privacy Guarantees**: Student ID (`NIM`) does not exist in the system; Lecturer `NIP` is never queried or serialized by `publicDashboard` endpoints.
- **Zero Interactive Controls**: The public display intentionally omits search bars, filters, pagination buttons, login links, and clickable external URLs (`<a>`) so kiosk screens cannot be navigated away from the dashboard.

---

## 2. Automatic Slideshow & Refresh Behavior
1. **Four-Scene Rotation (15 Seconds per Scene)**:
   - **Scene 1 (`OVERVIEW`)**: Executive summary KPIs (`totalGraduates`, `totalLecturers`, `totalPublications`, calculated study duration) and Recharts annual progression charts.
   - **Scene 2 (`GRADUATES`)**: Published graduates table (`fullName`, `entryYear`, `graduationYear`, study duration) + cohort breakdown.
   - **Scene 3 (`LECTURERS`)**: 2x2 rotating lecturer profile grid (`photoPath` or monogram fallback, `fullName`, `nidn`, `position`, `expertise`, `education`, `biography`, `publishedPublicationCount`).
   - **Scene 4 (`PUBLICATIONS`)**: 2x3 rotating publication cards (`title`, `kind`, `journalName`, `publicationYear`, published co-authors, and informational `doi`/`url` text).
2. **Fair Round-Robin Pagination**:
   - When a dataset exceeds a single screen (`>10` graduates, `>4` lecturers, or `>6` publications), the slideshow advances that scene's page index by `1` modulo `totalPages` each time the scene completes its turn.
   - Every published record is guaranteed to be displayed in round-robin sequence without skipping items.
3. **Background Data Synchronization (60 Seconds)**:
   - Queries automatically refetch in the background every `60` seconds without reloading the page or resetting the slideshow timer.
   - If a temporary network drop occurs, React Query retains the last valid payload (`placeholderData`) and displays a subtle status indicator in the header until connectivity is restored.

---

## 3. Kiosk Browser Configuration (Full-Screen TV Setup)
Web browsers do not allow websites to enter fullscreen mode (`requestFullscreen()`) without an explicit user gesture or kiosk launch flag. For dedicated laboratory TV mini-PCs, launch the browser using its native kiosk flags:

### 3.1 Google Chrome / Chromium (Windows & Linux)
```bash
# Linux (X11 Mini-PC)
chromium-browser \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-features=Translate \
  --check-for-update-interval=31536000 \
  "https://monitoring-if.unissula.ac.id/"
```

### 3.2 Raspberry Pi 3 Model B (1 GB RAM) Low-Memory Kiosk Configuration
Because the **Raspberry Pi 3 Model B** has **1 GB LPDDR2 RAM** shared with its VideoCore IV GPU, it must be deployed as a **Thin Display Client (Kiosk Browser)** while the Next.js + PostgreSQL server runs on a laboratory PC, local server, or campus VPS.

Use the following memory-optimized Chromium flags on Raspberry Pi 3B:
```bash
chromium-browser \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-features=Translate,OptimizationHints,MediaRouter,CalculateNativeWinOcclusion \
  --disable-extensions \
  --disable-component-update \
  --disable-background-networking \
  --disable-sync \
  --memory-pressure-off \
  --max_old_space_size=256 \
  --disk-cache-dir=/tmp/chromium-cache \
  --disk-cache-size=33554432 \
  --check-for-update-interval=31536000 \
  "http://<IP-SERVER-LAB>:3000/"
```
*(Writing `--disk-cache-dir=/tmp/chromium-cache` in RAM `/tmp` prevents constant MicroSD card writes and significantly extends MicroSD lifespan on Raspberry Pi 3B).*

```powershell
# Windows PowerShell
Start-Process "chrome.exe" -ArgumentList @(
  "--kiosk",
  "--noerrdialogs",
  "--disable-infobars",
  "--disable-session-crashed-bubble",
  "--disable-features=Translate",
  "http://localhost:3000/"
)
```

### 3.2 Microsoft Edge (Windows Mini-PC)
```powershell
Start-Process "msedge.exe" -ArgumentList @(
  "--kiosk",
  "http://localhost:3000/",
  "--edge-kiosk-type=fullscreen",
  "--no-first-run"
)
```

---

## 4. Operating System & TV Display Recommendations
1. **Prevent Display Sleep & Screen Savers**:
   - **Windows**: Set *Power & Sleep -> Screen* and *Sleep* to **Never**.
   - **Linux (X11)**: Run `xset s off -dpms && xset s noblank` in the display startup script.
2. **Resolution & Scaling**:
   - **1920 x 1080 (Full HD TV)**: Set OS display scaling to `100%`.
   - **3840 x 2160 (4K UHD TV)**: Set OS display scaling to `150%` or `200%` (or native `100%` to leverage the `2xl:` ultra-wide typography and spacing tokens).
   - Enable **Just Scan / 1:1 Pixel Mapping** on the television's aspect ratio menu to prevent HDMI overscan cropping.
3. **Empty Dataset Behavior**:
   - When the database contains zero published records, all scenes render truthful `0` values and structured empty-state panels (`Status Data Terpublikasi: 0 Rekaman`).
   - Production deployments never seed or display fabricated lecturer, graduate, or publication records.

