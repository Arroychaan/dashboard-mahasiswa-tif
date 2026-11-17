import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createCaller } from "~/server/api/root";
import { type TRPCContext } from "~/server/api/trpc";
import { bootstrapInitialSuperAdmin } from "~/server/auth/bootstrap";
import * as schema from "~/server/db/schema";
import {
  MAX_LECTURER_PHOTO_BYTES,
  PhotoUploadValidationError,
  processAndStoreLecturerPhoto,
  verifyImageMagicBytes,
} from "~/server/storage/lecturer-photo";

let pgClient: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tempUploadDir: string;

async function applyMigrations(client: PGlite) {
  const drizzleDir = path.resolve(process.cwd(), "drizzle");
  const sqlFiles = fs
    .readdirSync(drizzleDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of sqlFiles) {
    const rawSql = fs.readFileSync(path.join(drizzleDir, file), "utf8");
    const statements = rawSql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      await client.exec(stmt);
    }
  }
}

async function truncateAllTables(client: PGlite) {
  await client.exec(`
    TRUNCATE TABLE
      "publication_authors",
      "publications",
      "lecturers",
      "graduates",
      "audit_logs",
      "users"
    RESTART IDENTITY CASCADE;
  `);
}

function makeCallerForUser(
  user?: {
    id: string;
    name: string;
    email: string;
    role: schema.UserRole;
    isActive: boolean;
    mfaVerified: boolean;
    sessionVersion: number;
  } | null,
) {
  const ctx: TRPCContext = {
    db: testDb as unknown as TRPCContext["db"],
    headers: new Headers(),
    session: user
      ? {
          expires: new Date(Date.now() + 3600_000).toISOString(),
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            isActive: user.isActive,
            mfaVerified: user.mfaVerified,
            sessionVersion: user.sessionVersion,
          },
        }
      : null,
  };
  return createCaller(ctx);
}

describe("Phase 3 Admin Management Interface & Secure Photo Upload Verification", () => {
  beforeAll(async () => {
    pgClient = new PGlite();
    await applyMigrations(pgClient);
    testDb = drizzle(pgClient, { schema });
    tempUploadDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "unissula-lecturer-photos-"),
    );
  });

  afterAll(() => {
    if (tempUploadDir && fs.existsSync(tempUploadDir)) {
      fs.rmSync(tempUploadDir, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    await truncateAllTables(pgClient);
  });

  describe("1. Secure Lecturer Photo Upload (Magic Bytes, sharp Re-encoding & Path Traversal Protection)", () => {
    it("accepts valid PNG, JPEG, and WebP images, re-encodes to sanitized WebP, and assigns a randomized UUID filename", async () => {
      const pngBuffer = await sharp({
        create: {
          width: 300,
          height: 300,
          channels: 3,
          background: { r: 20, g: 60, b: 140 },
        },
      })
        .png()
        .toBuffer();

      const jpegBuffer = await sharp({
        create: {
          width: 400,
          height: 400,
          channels: 3,
          background: { r: 40, g: 80, b: 160 },
        },
      })
        .jpeg()
        .toBuffer();

      const webpBuffer = await sharp({
        create: {
          width: 250,
          height: 250,
          channels: 3,
          background: { r: 10, g: 100, b: 200 },
        },
      })
        .webp()
        .toBuffer();

      expect(verifyImageMagicBytes(pngBuffer)).toBe("png");
      expect(verifyImageMagicBytes(jpegBuffer)).toBe("jpeg");
      expect(verifyImageMagicBytes(webpBuffer)).toBe("webp");

      const pngResult = await processAndStoreLecturerPhoto({
        buffer: pngBuffer,
        declaredMimeType: "image/png",
        storageRootDir: tempUploadDir,
      });
      expect(pngResult.photoPath).toMatch(
        /^\/uploads\/lecturers\/lecturer-[0-9a-f-]{36}\.webp$/,
      );
      const writtenPath = path.join(tempUploadDir, pngResult.fileName);
      expect(fs.existsSync(writtenPath)).toBe(true);

      const storedMeta = await sharp(fs.readFileSync(writtenPath)).metadata();
      expect(storedMeta.format).toBe("webp");
      expect(storedMeta.width).toBe(300);
      expect(storedMeta.height).toBe(300);

      const jpegResult = await processAndStoreLecturerPhoto({
        buffer: jpegBuffer,
        declaredMimeType: "image/jpeg",
        storageRootDir: tempUploadDir,
      });
      expect(jpegResult.fileName).not.toBe(pngResult.fileName);
    });

    it("rejects SVG uploads, Windows PE/MZ executables, ELF binaries, and HTML scripts", async () => {
      const svgBuffer = Buffer.from(
        `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`,
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

      expect(() => verifyImageMagicBytes(svgBuffer)).toThrow(
        PhotoUploadValidationError,
      );
      expect(() => verifyImageMagicBytes(mzExecutableBuffer)).toThrow(
        PhotoUploadValidationError,
      );
      expect(() => verifyImageMagicBytes(elfBinaryBuffer)).toThrow(
        PhotoUploadValidationError,
      );

      await expect(
        processAndStoreLecturerPhoto({
          buffer: svgBuffer,
          storageRootDir: tempUploadDir,
        }),
      ).rejects.toThrow(PhotoUploadValidationError);

      await expect(
        processAndStoreLecturerPhoto({
          buffer: mzExecutableBuffer,
          storageRootDir: tempUploadDir,
        }),
      ).rejects.toThrow(PhotoUploadValidationError);

      await expect(
        processAndStoreLecturerPhoto({
          buffer: elfBinaryBuffer,
          storageRootDir: tempUploadDir,
        }),
      ).rejects.toThrow(PhotoUploadValidationError);
    });

    it("rejects oversized files exceeding the 2 MB limit", async () => {
      const oversizedBuffer = Buffer.alloc(
        MAX_LECTURER_PHOTO_BYTES + 1024,
        0xff,
      );

      await expect(
        processAndStoreLecturerPhoto({
          buffer: oversizedBuffer,
          storageRootDir: tempUploadDir,
        }),
      ).rejects.toThrow(/melebihi batas maksimal 2 MB/);
    });

    it("rejects spoofed JPEG magic bytes containing corrupted/non-image payload", async () => {
      const spoofedJpeg = Buffer.concat([
        Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
        Buffer.from("not-an-actual-jpeg-stream-payload", "utf8"),
      ]);

      expect(verifyImageMagicBytes(spoofedJpeg)).toBe("jpeg");

      await expect(
        processAndStoreLecturerPhoto({
          buffer: spoofedJpeg,
          storageRootDir: tempUploadDir,
        }),
      ).rejects.toThrow(PhotoUploadValidationError);
    });
  });

  describe("2. Admin Overview Statistics, Search, Filtering, and NIP Privacy Enforcement", () => {
    it("returns accurate published vs draft statistics, supports admin search/filtering, and masks NIP from EDITOR", async () => {
      const bootstrapRes = await bootstrapInitialSuperAdmin(
        testDb as unknown as Parameters<typeof bootstrapInitialSuperAdmin>[0],
        {
          name: "Super Admin",
          email: "super@unissula.ac.id",
          password: "SuperSecurePassword123!",
        },
      );

      const superCaller = makeCallerForUser({
        id: bootstrapRes.user.id,
        name: bootstrapRes.user.name,
        email: bootstrapRes.user.email,
        role: bootstrapRes.user.role,
        isActive: true,
        mfaVerified: true,
        sessionVersion: 1,
      });

      const editorUser = await superCaller.users.create({
        name: "Editor Lab",
        email: "editor@unissula.ac.id",
        password: "EditorSecurePassword123!",
        role: "EDITOR",
        isActive: true,
      });

      const editorCaller = makeCallerForUser({
        ...editorUser,
        mfaVerified: false,
        sessionVersion: 1,
      });

      // Verify users.me returns current profile
      const meEditor = await editorCaller.users.me();
      expect(meEditor.email).toBe("editor@unissula.ac.id");
      expect(meEditor.role).toBe("EDITOR");

      // Create graduates via EDITOR (starts as draft)
      const grad1 = await editorCaller.graduates.create({
        fullName: "Rizky Pratama, S.Kom.",
        entryYear: 2020,
        graduationYear: 2024,
        isPublished: false,
      });
      await editorCaller.graduates.create({
        fullName: "Nadia Putri, S.Kom.",
        entryYear: 2021,
        graduationYear: 2025,
        isPublished: false,
      });

      // Publish 1 graduate via SUPER_ADMIN
      await superCaller.graduates.setPublished({
        id: grad1.id,
        isPublished: true,
      });

      const gradStats = await superCaller.graduates.stats();
      expect(gradStats).toMatchObject({
        total: 2,
        published: 1,
        draft: 1,
      });
      expect(gradStats.recentChanges).toHaveLength(2);

      // Test search and graduationYear filtering
      const searchRizky = await superCaller.graduates.list({
        search: "Rizky",
        limit: 10,
        offset: 0,
      });
      expect(searchRizky).toHaveLength(1);
      expect(searchRizky[0]?.fullName).toBe("Rizky Pratama, S.Kom.");

      const filterYear2025 = await superCaller.graduates.count({
        graduationYear: 2025,
      });
      expect(filterYear2025.total).toBe(1);

      // Create lecturer with NIP via SUPER_ADMIN
      const lecturer = await superCaller.lecturers.create({
        fullName: "Dr. Budi Santoso, M.Kom.",
        nidn: "0611028201",
        nip: "198202112008011005",
        position: "Lektor Kepala",
        expertise: "Kecerdasan Buatan",
        education: "S3 Ilmu Komputer",
        biography: "Peneliti visi komputer",
        photoPath:
          "/uploads/lecturers/lecturer-11111111-2222-4333-8444-555555555555.webp",
        isPublished: true,
      });

      // SUPER_ADMIN sees NIP
      const adminLecturers = await superCaller.lecturers.list({
        search: "Budi",
        limit: 10,
        offset: 0,
      });
      expect(adminLecturers).toHaveLength(1);
      expect(adminLecturers[0]?.nip).toBe("198202112008011005");

      // EDITOR is masked from viewing NIP and cannot overwrite NIP on update
      const editorLecturers = await editorCaller.lecturers.list({
        search: "Budi",
        limit: 10,
        offset: 0,
      });
      expect(editorLecturers).toHaveLength(1);
      expect(editorLecturers[0]?.nip).toBeNull();

      await editorCaller.lecturers.update({
        id: lecturer.id,
        fullName: "Dr. Budi Santoso, S.Kom., M.Kom.",
        position: "Lektor Kepala",
        expertise: "Kecerdasan Buatan",
        nip: "ATTEMPTED_OVERWRITE",
      });

      const verifyAfterEditorUpdate = await superCaller.lecturers.getById({
        id: lecturer.id,
      });
      expect(verifyAfterEditorUpdate.fullName).toBe(
        "Dr. Budi Santoso, S.Kom., M.Kom.",
      );
      // Original NIP must remain intact
      expect(verifyAfterEditorUpdate.nip).toBe("198202112008011005");

      // Create publication linked to lecturer
      await superCaller.publications.create({
        title: "Deteksi Objek Real-Time Menggunakan Vision Transformer",
        kind: "JOURNAL",
        journalName: "Jurnal Nasional Teknik Elektro dan Teknologi Informasi",
        publicationYear: 2025,
        doi: "10.22146/jnteti.2025",
        url: "https://jurnal.ugm.ac.id/jnteti",
        isPublished: true,
        lecturerIds: [lecturer.id],
      });

      const pubStats = await superCaller.publications.stats();
      expect(pubStats).toMatchObject({
        total: 1,
        published: 1,
        draft: 0,
      });
      expect(pubStats.recentChanges).toHaveLength(1);

      const lecturerWithPubCount = await superCaller.lecturers.list({
        limit: 10,
        offset: 0,
      });
      expect(lecturerWithPubCount[0]?.publicationCount).toBe(1);
    });
  });
});
