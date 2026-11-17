import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

async function processLogos() {
  const publicDir = path.resolve("public");
  const informatikaJpg = path.join(publicDir, "Logo_Informatika.jpg");
  const unissulaPng = path.join(publicDir, "Logo_Unissula.png");

  console.log("Processing institutional logos...");

  // 1. Process Logo_Informatika.jpg
  if (fs.existsSync(informatikaJpg)) {
    const { data, info } = await sharp(informatikaJpg)
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Find tight non-white bounding box
    let minX = info.width;
    let maxX = 0;
    let minY = info.height;
    let maxY = 0;

    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const idx = (y * info.width + x) * 3;
        const r = data[idx]!;
        const g = data[idx + 1]!;
        const b = data[idx + 2]!;
        // Non-white pixel
        if (r < 245 || g < 245 || b < 245) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    // Add 2px breathing margin
    minX = Math.max(0, minX - 2);
    minY = Math.max(0, minY - 2);
    maxX = Math.min(info.width - 1, maxX + 2);
    maxY = Math.min(info.height - 1, maxY + 2);

    const cropW = maxX - minX + 1;
    const cropH = maxY - minY + 1;

    // Build RGBA buffer with smooth alpha transparency
    const rgba = Buffer.alloc(cropW * cropH * 4);
    for (let y = 0; y < cropH; y++) {
      for (let x = 0; x < cropW; x++) {
        const srcIdx = ((minY + y) * info.width + (minX + x)) * 3;
        const dstIdx = (y * cropW + x) * 4;

        const r = data[srcIdx]!;
        const g = data[srcIdx + 1]!;
        const b = data[srcIdx + 2]!;

        // Perceptual brightness
        const brightness = 0.299 * r + 0.587 * g + 0.114 * b;

        rgba[dstIdx] = r;
        rgba[dstIdx + 1] = g;
        rgba[dstIdx + 2] = b;

        if (brightness >= 248) {
          rgba[dstIdx + 3] = 0; // Pure transparent
        } else if (brightness > 220) {
          // Smooth anti-aliased edge falloff
          const factor = (248 - brightness) / 28;
          rgba[dstIdx + 3] = Math.round(255 * factor);
        } else {
          rgba[dstIdx + 3] = 255; // Solid
        }
      }
    }

    // Upscale 3x using Lanczos3 for crisp High-DPI rendering
    const targetW = cropW * 3;
    const targetH = cropH * 3;

    await sharp(rgba, {
      raw: { width: cropW, height: cropH, channels: 4 },
    })
      .resize(targetW, targetH, {
        kernel: sharp.kernel.lanczos3,
        fit: "fill",
      })
      .sharpen({ sigma: 1.0, m1: 1.2, m2: 0.5 })
      .png({ compressionLevel: 9, quality: 100 })
      .toFile(path.join(publicDir, "Logo_Informatika_HD.png"));

    console.log(
      `✓ Generated Logo_Informatika_HD.png (${targetW}x${targetH} High-DPI transparent)`,
    );
  }

  // 2. Process Logo_Unissula.png
  if (fs.existsSync(unissulaPng)) {
    // Read and trim excess transparent padding, save crisp High-DPI
    await sharp(unissulaPng)
      .trim()
      .resize(600, null, {
        fit: "inside",
        kernel: sharp.kernel.lanczos3,
        withoutEnlargement: false,
      })
      .png({ compressionLevel: 9, quality: 100 })
      .toFile(path.join(publicDir, "Logo_Unissula_HD.png"));

    console.log("✓ Generated Logo_Unissula_HD.png (High-DPI transparent)");
  }

  console.log("Institutional logos processing complete.");
}

void processLogos();

