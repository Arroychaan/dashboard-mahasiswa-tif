import crypto from "node:crypto";
import * as OTPAuth from "otpauth";

import { env } from "~/env";
import { hashPassword, verifyPassword } from "~/server/security/password";

const TOTP_ISSUER = "Lab Informatika UNISSULA";
const TOTP_DIGITS = 6;
const TOTP_PERIOD = 30;
const ENCRYPTION_VERSION = "v1";
const RECOVERY_CODE_COUNT = 8;

function deriveEncryptionKey(): Buffer {
  const baseSecret =
    env.AUTH_SECRET ?? "dev-only-fallback-secret-key-at-least-32-chars";
  const keyBytes = crypto.hkdfSync(
    "sha256",
    Buffer.from(baseSecret, "utf8"),
    Buffer.from("unissula-informatics-mfa-salt-v1", "utf8"),
    Buffer.from("aes-256-gcm-totp-secret-encryption", "utf8"),
    32,
  );
  return Buffer.from(keyBytes);
}

/**
 * Encrypts a Base32 TOTP secret using AES-256-GCM.
 */
export function encryptTotpSecret(plainSecretBase32: string): string {
  const key = deriveEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plainSecretBase32, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    ENCRYPTION_VERSION,
    iv.toString("hex"),
    authTag.toString("hex"),
    ciphertext.toString("hex"),
  ].join(":");
}

/**
 * Decrypts an AES-256-GCM encrypted Base32 TOTP secret.
 */
export function decryptTotpSecret(encryptedPayload: string): string {
  const parts = encryptedPayload.split(":");
  if (parts.length !== 4 || parts[0] !== ENCRYPTION_VERSION) {
    throw new Error("Format rahasia MFA terenkripsi tidak valid.");
  }

  const [, ivHex, tagHex, ciphertextHex] = parts as [
    string,
    string,
    string,
    string,
  ];
  const key = deriveEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(tagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

function createTotpInstance(secretBase32: string, accountEmail: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: TOTP_ISSUER,
    label: accountEmail,
    algorithm: "SHA1",
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
}

export function generateTotpEnrollment(accountEmail: string): {
  secretBase32: string;
  encryptedSecret: string;
  otpauthUri: string;
} {
  const secret = new OTPAuth.Secret({ size: 20 });
  const secretBase32 = secret.base32;
  const totp = createTotpInstance(secretBase32, accountEmail);

  return {
    secretBase32,
    encryptedSecret: encryptTotpSecret(secretBase32),
    otpauthUri: totp.toString(),
  };
}

export function generateCurrentTotpToken(
  secretBase32: string,
  accountEmail = "admin@unissula.ac.id",
): string {
  const totp = createTotpInstance(secretBase32, accountEmail);
  return totp.generate();
}

export function verifyTotpToken(
  encryptedSecret: string,
  tokenInput: string,
  accountEmail = "admin@unissula.ac.id",
): boolean {
  const normalizedToken = tokenInput.trim().replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalizedToken)) {
    return false;
  }

  try {
    const secretBase32 = decryptTotpSecret(encryptedSecret);
    const totp = createTotpInstance(secretBase32, accountEmail);
    const delta = totp.validate({ token: normalizedToken, window: 1 });
    return delta !== null;
  } catch {
    return false;
  }
}

function normalizeRecoveryCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function generateMfaRecoveryCodes(
  count = RECOVERY_CODE_COUNT,
): Promise<{
  plainRecoveryCodes: string[];
  hashedRecoveryCodes: string[];
}> {
  const plainRecoveryCodes: string[] = [];
  const hashedRecoveryCodes: string[] = [];

  for (let i = 0; i < count; i++) {
    const rawHex = crypto.randomBytes(5).toString("hex").toUpperCase();
    const formatted = `${rawHex.slice(0, 5)}-${rawHex.slice(5, 10)}`;
    plainRecoveryCodes.push(formatted);
    const normalized = normalizeRecoveryCode(formatted);
    hashedRecoveryCodes.push(await hashPassword(normalized));
  }

  return { plainRecoveryCodes, hashedRecoveryCodes };
}

export async function verifyAndConsumeRecoveryCode(
  hashedRecoveryCodes: readonly string[],
  recoveryCodeInput: string,
): Promise<{ matched: boolean; remainingHashes: string[] }> {
  const normalized = normalizeRecoveryCode(recoveryCodeInput);
  if (normalized.length < 8) {
    return { matched: false, remainingHashes: [...hashedRecoveryCodes] };
  }

  for (let i = 0; i < hashedRecoveryCodes.length; i++) {
    const hashCandidate = hashedRecoveryCodes[i];
    if (hashCandidate && (await verifyPassword(hashCandidate, normalized))) {
      const remainingHashes = hashedRecoveryCodes.filter((_, idx) => idx !== i);
      return { matched: true, remainingHashes };
    }
  }

  return { matched: false, remainingHashes: [...hashedRecoveryCodes] };
}

