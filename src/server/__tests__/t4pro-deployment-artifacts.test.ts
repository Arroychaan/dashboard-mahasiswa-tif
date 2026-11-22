import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

describe("Task 7: Beelink T4 Pro (Lubuntu 26.04 Touchscreen) Deployment Artifacts", () => {
  it("provides LF-only setup-lubuntu.sh with Intel GPU, touchscreen kiosk, 4GB PostgreSQL tuning, and standalone systemd config", () => {
    const scriptPath = path.join(ROOT, "deploy/t4pro-lubuntu/setup-lubuntu.sh");
    expect(fs.existsSync(scriptPath)).toBe(true);

    const content = fs.readFileSync(scriptPath, "utf8");
    // Must strictly use LF line endings for Linux execution
    expect(content).not.toContain("\r\n");
    expect(content.startsWith("#!/usr/bin/env bash\n")).toBe(true);

    // Chromium touchscreen & Intel GPU hardware flags
    expect(content).toContain("--kiosk");
    expect(content).toContain("--touch-events=enabled");
    expect(content).toContain("--enable-gpu-rasterization");
    expect(content).toContain("--disable-pinch");
    expect(content).toContain("--overscroll-history-navigation=0");
    expect(content).toContain("--disk-cache-dir=/tmp/chromium-cache");

    // 4GB RAM PostgreSQL tuning
    expect(content).toContain("shared_buffers = 256MB");
    expect(content).toContain("effective_cache_size = 1GB");

    // Standalone Next.js systemd runtime & migrations + seed
    expect(content).toContain("NODE_OPTIONS=--max-old-space-size=512");
    expect(content).toContain("server.js");
    expect(content).toContain("seed-course-schedules");
    expect(content).toContain("lab-informatika");

    // Critical #1: pre-bundled ESM bootstrap script invoked via node without silencing failure
    expect(content).toContain("bootstrap-super-admin.mjs");
    expect(content).not.toContain("npx --yes tsx");

    // Critical #3: isolated Linux x64 native addon staging + explicit runtime verification
    expect(content).toContain("/tmp/t4pro-native-addons");
    expect(content).toContain("require('@node-rs/argon2')");
    expect(content).toContain("require('sharp')");

    // Important #2: tracked SQL migrations executed with strict ON_ERROR_STOP=1
    expect(content).toContain("_dashboard_sql_migrations");
    expect(content).toContain("ON_ERROR_STOP=1");
    expect(content).not.toContain("ON_ERROR_STOP=0");
  });

  it("provides pre-compiled standalone bundle scripts (USB & WiFi) and Indonesian operational guide", () => {
    const requiredFiles = [
      "scripts/prepare-t4pro-bundle.ps1",
      "scripts/update-t4pro-wifi.ps1",
      "UPDATE-T4PRO-WIFI.bat",
      "docs/PANDUAN-T4PRO-LUBUNTU.md",
    ];

    for (const relPath of requiredFiles) {
      const absPath = path.join(ROOT, relPath);
      expect(fs.existsSync(absPath), `Missing ${relPath}`).toBe(true);
    }

    const bundlePs1 = fs.readFileSync(
      path.join(ROOT, "scripts/prepare-t4pro-bundle.ps1"),
      "utf8",
    );
    expect(bundlePs1).toContain(".next");
    expect(bundlePs1).toContain("standalone");
    // Critical #1, #2, #3 & Important #3 checks on prepare-t4pro-bundle.ps1
    expect(bundlePs1).toContain("-SkipBuild");
    expect(bundlePs1).toContain("$LASTEXITCODE -ne 0");
    expect(bundlePs1).toContain(".env*");
    expect(bundlePs1).toContain("devDependencies");
    expect(bundlePs1).toContain("bootstrap-super-admin.mjs");
    expect(bundlePs1).toContain("seed-course-schedules.mjs");
    // Root-cause regression check: must never copy Windows .next/standalone/node_modules cyclic pnpm junctions
    expect(bundlePs1).not.toContain("robocopy \"$StandaloneDir\"");
    expect(bundlePs1).toContain("Join-Path $StandaloneDir \"server.js\"");
    expect(bundlePs1).toContain("Join-Path $StandaloneDir \".next\"");

    const wifiPs1 = fs.readFileSync(
      path.join(ROOT, "scripts/update-t4pro-wifi.ps1"),
      "utf8",
    );
    expect(wifiPs1).toContain("lab-informatika.local");
    expect(wifiPs1).toContain("standalone");
    // Important #1 & #2 checks on update-t4pro-wifi.ps1
    expect(wifiPs1).toContain("$LASTEXITCODE -ne 0");
    expect(wifiPs1).toContain("[c]hromium.*localhost:3000");
    expect(wifiPs1).toContain("DISPLAY=:0");
    expect(wifiPs1).toContain("XAUTHORITY");
    expect(wifiPs1).toContain("_dashboard_sql_migrations");
    expect(wifiPs1).toContain("ON_ERROR_STOP=1");
    expect(wifiPs1).not.toContain("ON_ERROR_STOP=0");

    const wifiBat = fs.readFileSync(
      path.join(ROOT, "UPDATE-T4PRO-WIFI.bat"),
      "utf8",
    );
    expect(wifiBat).toContain("update-t4pro-wifi.ps1");

    const guide = fs.readFileSync(
      path.join(ROOT, "docs/PANDUAN-T4PRO-LUBUNTU.md"),
      "utf8",
    );
    expect(guide).toContain("T4 Pro");
    expect(guide).toContain("Lubuntu 26.04");
    expect(guide).toContain("/admin/jadwal");
    expect(guide).toContain("lab-informatika.local");
  });
});
