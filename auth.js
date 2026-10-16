// @ts-check

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import { decryptField } from "@/lib/crypto";
import { readChallenge, verifyTotp } from "@/lib/twoFactor";
import { audited } from "@/lib/audit/request";
import { recordAudit, ACTIONS } from "@/lib/audit";

/**
 * Auth.js configuration.
 *
 * Sessions are JWTs rather than database rows: there is no OAuth provider to
 * reconcile, the users already live in our own `users` collection, and it
 * keeps every request from hitting Atlas just to read a session.
 *
 * A session is only ever issued after *both* the password and a valid TOTP
 * code have been checked — see `lib/twoFactor.js` for why that happens in two
 * steps. The password step is in `app/(auth)/login/actions.js`; this provider
 * handles only the second step.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: {
    strategy: "jwt",
    maxAge: 30 * 60, // 30 minutes idle, then signed out (spec section 16)
    updateAge: 60, // active use pushes the deadline out, at most once a minute
  },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [
    Credentials({
      // the password was already checked; this exchanges challenge + code
      credentials: { challenge: {}, code: {} },
      async authorize({ challenge, code }) {
        const userId = readChallenge(String(challenge ?? ""));
        if (!userId) return null;

        await connectDB();
        const user = await User.findById(userId).select(
          "+totpSecret +lastTotpCounter",
        );
        if (!user || !user.active || !user.totpSecret) return null;

        const result = verifyTotp({
          secret: decryptField(user.totpSecret),
          email: user.email,
          code: String(code ?? ""),
          lastCounter: user.lastTotpCounter,
        });
        if (!result.ok) return null;

        const actor = {
          id: String(user._id),
          name: user.name,
          role: user.role,
          branchIds: user.branchIds.map(String),
        };

        // Burning the used time step and logging the sign-in happen in one
        // transaction: a login that is not in the audit log did not happen
        // (spec section 11).
        await audited(actor, async (session) => {
          await User.updateOne(
            { _id: user._id },
            {
              $set: {
                lastTotpCounter: result.counter,
                lastLoginAt: new Date(),
                failedLogins: 0,
                lockedUntil: null,
              },
            },
            { session },
          );
          await recordAudit(
            {
              action: ACTIONS.login,
              entityType: "User",
              entityId: actor.id,
            },
            session,
          );
        });

        return {
          id: String(user._id),
          name: user.name,
          email: user.email,
          role: user.role,
          branchIds: user.branchIds.map(String),
          isIntern: user.isIntern,
          mustChangePassword: user.mustChangePassword,
        };
      },
    }),
  ],
  events: {
    /** Signing out is logged too (spec section 11). */
    async signOut(message) {
      const userId = message?.token?.sub;
      if (!userId) return;
      try {
        await audited(
          {
            id: userId,
            name: message.token.name ?? "",
            role: message.token.role,
          },
          (session) =>
            recordAudit(
              { action: ACTIONS.logout, entityType: "User", entityId: userId },
              session,
            ),
        );
      } catch {
        // never leave someone stuck signed in because the log write failed
      }
    },
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.branchIds = user.branchIds;
        token.isIntern = user.isIntern;
        token.mustChangePassword = user.mustChangePassword;
      }
      return token;
    },
    session({ session, token }) {
      // the shape lib/permissions.js expects as its Actor
      session.user.id = String(token.sub);
      session.user.role = token.role;
      session.user.branchIds = token.branchIds ?? [];
      session.user.isIntern = token.isIntern ?? false;
      session.user.mustChangePassword = token.mustChangePassword ?? false;
      session.user.active = true;
      return session;
    },
  },
});

/**
 * The signed-in user as lib/permissions.js wants it, or null.
 * Server actions call `requireUser()` instead, which throws.
 */
export async function currentUser() {
  const session = await auth();
  return session?.user ?? null;
}

/**
 * @returns {Promise<import("@/lib/permissions").Actor & { name: string, email: string }>}
 */
export async function requireUser() {
  const user = await currentUser();
  if (!user) {
    const err = new Error("Not signed in");
    err.code = "UNAUTHENTICATED";
    throw err;
  }
  return user;
}
