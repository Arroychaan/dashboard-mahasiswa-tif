import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { users } from "~/server/db/schema";
import { writeAuditLog } from "~/server/security/audit";
import { canManageContent } from "~/server/security/rbac";
import {
  PhotoUploadValidationError,
  processAndStoreLecturerPhoto,
} from "~/server/storage/lecturer-photo";

export async function POST(request: Request) {
  const session = await auth();
  const sessionUser = session?.user;

  if (!sessionUser?.id) {
    return NextResponse.json(
      { error: "Otentikasi diperlukan." },
      { status: 401 },
    );
  }

  // Re-verify live account status, role, sessionVersion, and MFA in PostgreSQL
  const [dbUser] = await db
    .select({
      id: users.id,
      role: users.role,
      isActive: users.isActive,
      mfaEnabled: users.mfaEnabled,
      mfaSecretEncrypted: users.mfaSecretEncrypted,
      sessionVersion: users.sessionVersion,
    })
    .from(users)
    .where(eq(users.id, sessionUser.id))
    .limit(1);

  if (
    !dbUser?.isActive ||
    dbUser.role !== sessionUser.role ||
    dbUser.sessionVersion !== sessionUser.sessionVersion
  ) {
    return NextResponse.json(
      { error: "Sesi tidak valid atau telah kedaluwarsa." },
      { status: 401 },
    );
  }

  if (
    (dbUser.role === "SUPER_ADMIN" || dbUser.mfaEnabled) &&
    (!dbUser.mfaEnabled ||
      !dbUser.mfaSecretEncrypted ||
      sessionUser.mfaVerified !== true)
  ) {
    return NextResponse.json(
      { error: "Verifikasi MFA diperlukan." },
      { status: 403 },
    );
  }

  if (!canManageContent(dbUser.role)) {
    return NextResponse.json(
      { error: "Anda tidak memiliki izin untuk mengunggah foto dosen." },
      { status: 403 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Permintaan harus berformat multipart/form-data." },
      { status: 400 },
    );
  }

  const fileEntry = formData.get("file");
  if (!(fileEntry instanceof File)) {
    return NextResponse.json(
      { error: "File foto tidak ditemukan dalam permintaan." },
      { status: 400 },
    );
  }

  try {
    const arrayBuffer = await fileEntry.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const stored = await processAndStoreLecturerPhoto({
      buffer,
      declaredMimeType: fileEntry.type,
    });

    await writeAuditLog(db, {
      actorUserId: dbUser.id,
      action: "LECTURER_PHOTO_UPLOAD",
      entityType: "LECTURER",
      entityId: null,
      metadata: {
        photoPath: stored.photoPath,
        byteLength: stored.byteLength,
        width: stored.width,
        height: stored.height,
      },
    });

    return NextResponse.json(
      {
        photoPath: stored.photoPath,
        width: stored.width,
        height: stored.height,
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof PhotoUploadValidationError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode },
      );
    }

    return NextResponse.json(
      { error: "Gagal memproses unggahan foto dosen." },
      { status: 500 },
    );
  }
}

