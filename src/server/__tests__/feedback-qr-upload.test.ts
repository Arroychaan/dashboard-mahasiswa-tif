import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  MAX_FEEDBACK_QR_BYTES,
  PhotoUploadValidationError,
  processAndStoreFeedbackQr,
  verifyFeedbackQrMagicBytes,
} from "~/server/storage/feedback-qr";

describe("Feedback QR Code Storage & Security Verification", () => {
  let tempUploadDir: string;

  beforeEach(() => {
    tempUploadDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "unissula-qr-upload-test-"),
    );
  });

  afterEach(() => {
    fs.rmSync(tempUploadDir, { recursive: true, force: true });
  });

  it("1. Accepts genuine PNG, JPEG, and WebP, sanitizes via Sharp, and stores as WebP", async () => {
    const pngBuffer = await sharp({
      create: {
        width: 400,
        height: 400,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const jpegBuffer = await sharp({
      create: {
        width: 400,
        height: 400,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();

    const webpBuffer = await sharp({
      create: {
        width: 400,
        height: 400,
        channels: 4,
        background: { r: 10, g: 100, b: 200, alpha: 1 },
      },
    })
      .webp()
      .toBuffer();

    expect(verifyFeedbackQrMagicBytes(pngBuffer)).toBe("png");
    expect(verifyFeedbackQrMagicBytes(jpegBuffer)).toBe("jpeg");
    expect(verifyFeedbackQrMagicBytes(webpBuffer)).toBe("webp");

    const pngResult = await processAndStoreFeedbackQr({
      buffer: pngBuffer,
      declaredMimeType: "image/png",
      storageRootDir: tempUploadDir,
    });

    expect(pngResult.qrPath).toMatch(
      /^\/uploads\/qr\/feedback-qr-[0-9a-f-]{36}\.webp$/,
    );
    const writtenPath = path.join(tempUploadDir, pngResult.fileName);
    expect(fs.existsSync(writtenPath)).toBe(true);

    const storedMeta = await sharp(fs.readFileSync(writtenPath)).metadata();
    expect(storedMeta.format).toBe("webp");
    expect(storedMeta.width).toBe(400);
    expect(storedMeta.height).toBe(400);

    const jpegResult = await processAndStoreFeedbackQr({
      buffer: jpegBuffer,
      declaredMimeType: "image/jpeg",
      storageRootDir: tempUploadDir,
    });
    expect(jpegResult.fileName).not.toBe(pngResult.fileName);
  });

  it("2. Strictly rejects SVG uploads, HTML/scripts, Windows PE/MZ executables, and ELF binaries", async () => {
    const svgBuffer = Buffer.from(
      `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><script>alert("xss")</script></svg>`,
      "utf8",
    );
    const mzExecutableBuffer = Buffer.from(
      "4d5a90000300000004000000ffff0000",
      "hex",
    );
    const elfBinaryBuffer = Buffer.from(
      "7f454c46020101000000000000000000",
      "hex",
    );

    expect(() => verifyFeedbackQrMagicBytes(svgBuffer)).toThrow(
      PhotoUploadValidationError,
    );
    expect(() => verifyFeedbackQrMagicBytes(mzExecutableBuffer)).toThrow(
      PhotoUploadValidationError,
    );
    expect(() => verifyFeedbackQrMagicBytes(elfBinaryBuffer)).toThrow(
      PhotoUploadValidationError,
    );

    await expect(
      processAndStoreFeedbackQr({
        buffer: svgBuffer,
        storageRootDir: tempUploadDir,
      }),
    ).rejects.toThrow(PhotoUploadValidationError);

    await expect(
      processAndStoreFeedbackQr({
        buffer: mzExecutableBuffer,
        storageRootDir: tempUploadDir,
      }),
    ).rejects.toThrow(PhotoUploadValidationError);

    await expect(
      processAndStoreFeedbackQr({
        buffer: elfBinaryBuffer,
        storageRootDir: tempUploadDir,
      }),
    ).rejects.toThrow(PhotoUploadValidationError);
  });

  it("3. Rejects oversized files exceeding 2 MB", async () => {
    const oversizedBuffer = Buffer.alloc(MAX_FEEDBACK_QR_BYTES + 1024, 0xff);

    await expect(
      processAndStoreFeedbackQr({
        buffer: oversizedBuffer,
        storageRootDir: tempUploadDir,
      }),
    ).rejects.toThrow(/melebihi batas maksimal 2 MB/);
  });
});
