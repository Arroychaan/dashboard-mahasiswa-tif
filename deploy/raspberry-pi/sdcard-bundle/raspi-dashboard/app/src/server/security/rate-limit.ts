import { TRPCError } from "@trpc/server";

interface RateLimitEntry {
  failures: number[];
  lockedUntil: number | null;
}

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;

const authAttempts = new Map<string, RateLimitEntry>();

function normalizeKey(rawKey: string): string {
  return rawKey.trim().toLowerCase();
}

function pruneEntry(entry: RateLimitEntry, now: number): RateLimitEntry {
  const failures = entry.failures.filter((ts) => now - ts < WINDOW_MS);
  const lockedUntil =
    entry.lockedUntil && entry.lockedUntil > now ? entry.lockedUntil : null;
  return { failures, lockedUntil };
}

export function isAuthRateLimited(
  rawKey: string,
  now = Date.now(),
): { limited: boolean; retryAfterSeconds: number } {
  const key = normalizeKey(rawKey);
  const existing = authAttempts.get(key);
  if (!existing) {
    return { limited: false, retryAfterSeconds: 0 };
  }

  const entry = pruneEntry(existing, now);
  authAttempts.set(key, entry);

  if (entry.lockedUntil && entry.lockedUntil > now) {
    return {
      limited: true,
      retryAfterSeconds: Math.ceil((entry.lockedUntil - now) / 1000),
    };
  }

  return { limited: false, retryAfterSeconds: 0 };
}

export function assertAuthRateLimit(rawKey: string, now = Date.now()): void {
  const status = isAuthRateLimited(rawKey, now);
  if (status.limited) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message:
        "Terlalu banyak percobaan otentikasi yang gagal. Silakan coba kembali beberapa saat lagi.",
    });
  }
}

export function recordAuthFailure(rawKey: string, now = Date.now()): void {
  const key = normalizeKey(rawKey);
  const existing = authAttempts.get(key) ?? { failures: [], lockedUntil: null };
  const entry = pruneEntry(existing, now);

  entry.failures.push(now);
  if (entry.failures.length >= MAX_ATTEMPTS) {
    entry.lockedUntil = now + LOCKOUT_MS;
  }

  authAttempts.set(key, entry);
}

export function clearAuthFailures(rawKey: string): void {
  const key = normalizeKey(rawKey);
  authAttempts.delete(key);
}

export function resetRateLimiterForTests(): void {
  authAttempts.clear();
}

