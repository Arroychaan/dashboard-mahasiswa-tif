"use server";

import { AuthError } from "next-auth";

import { signIn, signOut } from "~/server/auth";
import {
  GENERIC_AUTH_ERROR_MESSAGE,
  loginCredentialsSchema,
  RATE_LIMIT_AUTH_ERROR_MESSAGE,
} from "~/server/auth/credentials";
import { isAuthRateLimited } from "~/server/security/rate-limit";

export interface LoginActionResult {
  ok: boolean;
  message?: string;
}

export async function loginAdminAction(input: {
  email: string;
  password: string;
  mfaCode?: string;
}): Promise<LoginActionResult> {
  const parsed = loginCredentialsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: GENERIC_AUTH_ERROR_MESSAGE,
    };
  }

  const rateLimitKey = `login:${parsed.data.email}:default`;
  if (isAuthRateLimited(rateLimitKey).limited) {
    return {
      ok: false,
      message: RATE_LIMIT_AUTH_ERROR_MESSAGE,
    };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      mfaCode: parsed.data.mfaCode ?? "",
      redirect: false,
    });

    return { ok: true };
  } catch (err) {
    if (isAuthRateLimited(rateLimitKey).limited) {
      return {
        ok: false,
        message: RATE_LIMIT_AUTH_ERROR_MESSAGE,
      };
    }

    if (err instanceof AuthError) {
      return {
        ok: false,
        message: GENERIC_AUTH_ERROR_MESSAGE,
      };
    }

    // Re-throw Next.js redirect errors if any
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      typeof (err as { digest?: unknown }).digest === "string" &&
      (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw err;
    }

    return {
      ok: false,
      message: GENERIC_AUTH_ERROR_MESSAGE,
    };
  }
}

export async function logoutAdminAction(): Promise<void> {
  await signOut({ redirectTo: "/admin/login" });
}

