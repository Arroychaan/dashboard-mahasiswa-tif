import { hash, verify, type Options } from "@node-rs/argon2";

/**
 * OWASP ASVS 5.0 compliant Argon2id parameters:
 * - algorithm: 2 (Argon2id)
 * - memoryCost: 19456 KiB (~19 MiB)
 * - timeCost: 2 iterations
 * - parallelism: 1 lane
 * - outputLen: 32 bytes
 */
const ARGON2ID_OPTIONS: Options = {
  algorithm: 2,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
};

let cachedDummyHash: string | null = null;

async function getDummyHash(): Promise<string> {
  cachedDummyHash ??= await hash(
    "dummy-password-for-constant-time-mitigation",
    ARGON2ID_OPTIONS,
  );
  return cachedDummyHash;
}

export async function hashPassword(plainPassword: string): Promise<string> {
  return hash(plainPassword, ARGON2ID_OPTIONS);
}

export async function verifyPassword(
  passwordHash: string,
  plainPassword: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, plainPassword);
  } catch {
    return false;
  }
}

/**
 * Executes an Argon2id verification against a dummy hash when an account
 * is missing or inactive to prevent timing-based user enumeration.
 */
export async function verifyPasswordDummy(
  plainPassword: string,
): Promise<void> {
  const dummy = await getDummyHash();
  await verifyPassword(dummy, plainPassword);
}
