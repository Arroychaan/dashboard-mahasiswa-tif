import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp, { type OutputInfo } from "sharp";

export const MAX_FEEDBACK_QR_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type DetectedQrImageFormat = "jpeg" | "png" | "webp";

export class PhotoUploadValidationError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "PhotoUploadValidationError";
    this.statusCode = statusCode;
  }
}

/**
 * Inspects binary magic bytes to verify genuine JPEG, PNG, or WebP content
 * and explicitly reject SVG, XML/HTML, scripts, and executable binaries.
 */
export function verifyFeedbackQrMagicBytes(
  buffer: Buffer,
): DetectedQrImageFormat {
  if (buffer.byteLength === 0) {
    throw new PhotoUploadValidationError("File gambar kosong.", 400);
  }

  if (buffer.byteLength > MAX_FEEDBACK_QR_BYTES) {
    throw new PhotoUploadValidationError(
      "Ukuran file gambar melebihi batas maksimal 2 MB.",
      413,
    );
  }

  if (buffer.byteLength < 12) {
    throw new PhotoUploadValidationError(
      "Format file tidak valid atau rusak.",
      400,
    );
  }

  // Reject executable signatures (MZ PE, ELF, Shebang)
  if (
    (buffer[0] === 0x4d && buffer[1] === 0x5a) ||
    (buffer[0] === 0x7f &&
      buffer[1] === 0x45 &&
      buffer[2] === 0x4c &&
      buffer[3] === 0x46) ||
    (buffer[0] === 0x23 && buffer[1] === 0x21)
  ) {
    throw new PhotoUploadValidationError(
      "File eksekusi atau skrip ditolak demi keamanan.",
      400,
    );
  }

  // Reject SVG / XML / HTML / PHP text payloads in header
  const headerAscii = buffer
    .subarray(0, Math.min(buffer.byteLength, 512))
    .toString("utf8")
    .trimStart()
    .toLowerCase();

  if (
    headerAscii.startsWith("<svg") ||
    headerAscii.startsWith("<?xml") ||
    headerAscii.startsWith("<!doctype") ||
    headerAscii.startsWith("<html") ||
    headerAscii.startsWith("<script") ||
    headerAscii.startsWith("<?php") ||
    headerAscii.includes("<svg")
  ) {
    throw new PhotoUploadValidationError(
      "File SVG, XML, atau HTML tidak diizinkan. Gunakan JPEG, PNG, atau WebP.",
      400,
    );
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpeg";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "png";
  }

  // WebP: "RIFF" (0..3) and "WEBP" (8..11)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "webp";
  }

  throw new PhotoUploadValidationError(
    "Format file tidak didukung. Hanya file gambar JPEG, PNG, dan WebP asli yang diizinkan.",
    400,
  );
}

export interface ProcessAndStoreQrOptions {
  buffer: Buffer;
  declaredMimeType?: string;
  storageRootDir?: string;
}

export interface StoredFeedbackQrResult {
  qrPath: string;
  fileName: string;
  byteLength: number;
  width: number;
  height: number;
}

/**
 * Validates, decodes, strips metadata, transforms to a crisp WebP image,
 * and writes to persistent storage with a randomized UUID filename and
 * strict path-traversal protection.
 */
export async function processAndStoreFeedbackQr(
  options: ProcessAndStoreQrOptions,
): Promise<StoredFeedbackQrResult> {
  const { buffer, declaredMimeType } = options;

  if (
    declaredMimeType &&
    declaredMimeType.trim().length > 0 &&
    !ALLOWED_MIME_TYPES.has(declaredMimeType.toLowerCase())
  ) {
    throw new PhotoUploadValidationError(
      "Tipe MIME file tidak diizinkan. Hanya image/jpeg, image/png, dan image/webp yang diterima.",
      400,
    );
  }

  const magicFormat = verifyFeedbackQrMagicBytes(buffer);

  let sanitizedBuffer: Buffer;
  let outputInfo: OutputInfo;

  try {
    const image = sharp(buffer, {
      failOn: "error",
      limitInputPixels: 16_777_216,
    });

    const meta = await image.metadata();
    if (
      !meta.format ||
      (meta.format !== "jpeg" &&
        meta.format !== "png" &&
        meta.format !== "webp") ||
      meta.format !== magicFormat
    ) {
      throw new PhotoUploadValidationError(
        "Konten gambar tidak sesuai dengan header format file.",
        400,
      );
    }

    if (
      !meta.width ||
      !meta.height ||
      meta.width < 32 ||
      meta.height < 32 ||
      meta.width > 4096 ||
      meta.height > 4096
    ) {
      throw new PhotoUploadValidationError(
        "Dimensi gambar QR tidak valid (minimal 32x32 piksel, maksimal 4096x4096 piksel).",
        400,
      );
    }

    // Preserve high clarity for QR scanning, strip EXIF metadata
    const transformed = await sharp(buffer, {
      failOn: "error",
      limitInputPixels: 16_777_216,
    })
      .rotate()
      .resize(1200, 1200, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 92 })
      .toBuffer({ resolveWithObject: true });

    sanitizedBuffer = transformed.data;
    outputInfo = transformed.info;
  } catch (err) {
    if (err instanceof PhotoUploadValidationError) {
      throw err;
    }
    throw new PhotoUploadValidationError(
      "File bukan gambar yang valid atau gagal diproses secara aman.",
      400,
    );
  }

  const safeFileName = `feedback-qr-${crypto.randomUUID()}.webp`;
  if (!/^feedback-qr-[0-9a-f-]{36}\.webp$/.test(safeFileName)) {
    throw new Error("Nama file acak tidak valid.");
  }

  const baseDir = path.resolve(
    options.storageRootDir ??
      path.join(process.cwd(), "public", "uploads", "qr"),
  );
  await fs.mkdir(baseDir, { recursive: true });

  const targetFilePath = path.resolve(baseDir, safeFileName);
  const relativeCheck = path.relative(baseDir, targetFilePath);

  if (
    relativeCheck.startsWith("..") ||
    path.isAbsolute(relativeCheck) ||
    path.dirname(relativeCheck) !== "."
  ) {
    throw new PhotoUploadValidationError(
      "Pelanggaran keamanan jalur penyimpanan terdeteksi.",
      400,
    );
  }

  await fs.writeFile(targetFilePath, sanitizedBuffer, { mode: 0o644 });

  return {
    qrPath: `/uploads/qr/${safeFileName}`,
    fileName: safeFileName,
    byteLength: sanitizedBuffer.byteLength,
    width: outputInfo.width,
    height: outputInfo.height,
  };
}
