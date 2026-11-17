import { auditLogs } from "~/server/db/schema";

const FORBIDDEN_METADATA_KEYS = new Set([
  "password",
  "passwordhash",
  "password_hash",
  "newpassword",
  "currentpassword",
  "secret",
  "mfasecret",
  "mfasecretencrypted",
  "mfa_secret_encrypted",
  "recoverycodes",
  "mfarecoverycodeshashed",
  "mfa_recovery_codes_hashed",
  "token",
  "accesstoken",
  "refreshtoken",
  "totp",
  "mfacode",
  "nim",
]);

export function sanitizeAuditMetadata(
  input: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!input) return {};

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (FORBIDDEN_METADATA_KEYS.has(normalizedKey)) {
      continue;
    }

    if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
      result[key] = sanitizeAuditMetadata(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export interface AuditLogInput {
  actorUserId: string | null;
  action: string;
  entityType:
    | "GRADUATE"
    | "LECTURER"
    | "PUBLICATION"
    | "USER"
    | "AUTH"
    | "SYSTEM_SETTING"
    | "ANNOUNCEMENT";
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

type DbInsertExecutor = {
  insert: (table: typeof auditLogs) => {
    values: (val: {
      actorUserId: string | null;
      action: string;
      entityType: string;
      entityId: string | null;
      metadata: Record<string, unknown>;
    }) => Promise<unknown>;
  };
};

export async function writeAuditLog(
  dbOrTx: DbInsertExecutor,
  entry: AuditLogInput,
): Promise<void> {
  const sanitized = sanitizeAuditMetadata(entry.metadata);
  await dbOrTx.insert(auditLogs).values({
    actorUserId: entry.actorUserId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    metadata: sanitized,
  });
}

