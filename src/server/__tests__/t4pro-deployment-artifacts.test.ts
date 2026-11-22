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

    const wifiPs1 = fs.readFileSync(
      path.join(ROOT, "scripts/update-t4pro-wifi.ps1"),
      "utf8",
    );
    expect(wifiPs1).toContain("lab-informatika.local");
    expect(wifiPs1).toContain("standalone");

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
