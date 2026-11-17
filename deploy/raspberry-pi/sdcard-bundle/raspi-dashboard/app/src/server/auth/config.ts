import { type DefaultSession, type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { env } from "~/env";
import { authenticateUserCredentials } from "~/server/auth/credentials";
import { db } from "~/server/db";
import { type UserRole } from "~/server/db/schema";

const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60; // 8 hours

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      role: UserRole;
      isActive: boolean;
      mfaVerified: boolean;
      sessionVersion: number;
    } & DefaultSession["user"];
  }

  interface User {
    role: UserRole;
    isActive: boolean;
    mfaVerified: boolean;
    sessionVersion: number;
  }
}

const useSecureCookies =
  env.NODE_ENV === "production" &&
  process.env.AUTH_SECURE_COOKIES !== "false";

export const authConfig = {
  trustHost: true,
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE_SECONDS,
    updateAge: 60 * 60, // 1 hour
  },
  pages: {
    signIn: "/admin/login",
  },
  cookies: {
    sessionToken: {
      name: useSecureCookies
        ? "__Secure-authjs.session-token"
        : "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
  },
  providers: [
    Credentials({
      id: "credentials",
      name: "Admin Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        mfaCode: { label: "MFA Code", type: "text" },
      },
      async authorize(credentials) {
        const result = await authenticateUserCredentials(db, credentials);
        if (!result.ok) {
          return null;
        }
        return result.user;
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user && typeof user.id === "string") {
        token.sub = user.id;
        token.role = user.role;
        token.isActive = user.isActive;
        token.mfaVerified = user.mfaVerified;
        token.sessionVersion = user.sessionVersion;
      }
      return token;
    },
    session({ session, token }) {
      return {
        ...session,
        user: {
          ...session.user,
          id: typeof token.sub === "string" ? token.sub : "",
          role: (token.role as UserRole | undefined) ?? "EDITOR",
          isActive: (token.isActive as boolean | undefined) ?? false,
          mfaVerified: (token.mfaVerified as boolean | undefined) ?? false,
          sessionVersion: (token.sessionVersion as number | undefined) ?? 1,
        },
      };
    },
  },
} satisfies NextAuthConfig;
