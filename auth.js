// @ts-check

import { cache } from "react";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import ClientUser from "@/models/ClientUser";
import { decryptField } from "@/lib/crypto";
import { readChallenge, verifyTotp, skip2fa } from "@/lib/twoFactor";
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
        // a portal challenge is prefixed `client:` and is not a staff
        // challenge however valid its signature is (P2-9a)
        if (!userId || userId.includes(":")) return null;

        await connectDB();
        const user = await User.findById(userId).select(
          "+totpSecret +lastTotpCounter",
        );
        if (!user || !user.active) return null;

        const result = skip2fa()
          ? { ok: true, counter: user.lastTotpCounter }
          : user.totpSecret
            ? verifyTotp({
                secret: decryptField(user.totpSecret),
                email: user.email,
                code: String(code ?? ""),
                lastCounter: user.lastTotpCounter,
              })
            : { ok: false };
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

    /**
     * The client portal (P2-9a).
     *
     * A separate provider against a separate collection, issuing a token
     * marked `kind: "client"`. It can never produce a staff session: the id
     * in it belongs to `clientUsers`, `currentUser()` refuses the kind
     * outright, and `can()` refuses it again on its first line.
     *
     * The password was checked by `startClientSignIn`; this is the second
     * step, which is a TOTP code when the firm has turned 2FA on for the
     * account and nothing when it has not.
     */
    Credentials({
      id: "client",
      name: "Client portal",
      credentials: { challenge: {}, code: {} },
      async authorize({ challenge, code }) {
        const raw = readChallenge(String(challenge ?? ""));
        if (!raw || !raw.startsWith("client:")) return null;
        const id = raw.slice("client:".length);

        await connectDB();
        const person = await ClientUser.findById(id).select(
          "+totpSecret +lastTotpCounter",
        );
        if (!person || !person.active) return null;

        let counter = person.lastTotpCounter;
        if (person.totpRequired) {
          // 2FA is on for this account, so a code is not optional however
          // the form was submitted
          if (!person.totpSecret) return null;
          const result = verifyTotp({
            secret: decryptField(person.totpSecret),
            email: person.email,
            code: String(code ?? ""),
            lastCounter: person.lastTotpCounter,
          });
          if (!result.ok) return null;
          counter = result.counter;
        }

        const actor = {
          id: String(person._id),
          name: person.name,
          role: "client",
          kind: "client",
        };

        await audited(actor, async (session) => {
          await ClientUser.updateOne(
            { _id: person._id },
            {
              $set: {
                lastTotpCounter: counter,
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
              entityType: "ClientUser",
              entityId: actor.id,
              note: `client portal, ${person.email}`,
            },
            session,
          );
        });

        return {
          id: String(person._id),
          name: person.name,
          email: person.email,
          kind: "client",
          clientId: String(person.clientId),
          mustChangePassword: person.mustChangePassword,
        };
      },
    }),
  ],
  events: {
    /** Signing out is logged too (spec section 11). */
    async signOut(message) {
      const userId = message?.token?.sub;
      if (!userId) return;
      // a portal sign-out is logged against `clientUsers`, so the entry
      // names the right record rather than a staff id that does not exist
      const isClient = message?.token?.kind === "client";
      try {
        await audited(
          {
            id: userId,
            name: message.token.name ?? "",
            role: isClient ? "client" : message.token.role,
            ...(isClient ? { kind: "client" } : {}),
          },
          (session) =>
            recordAudit(
              {
                action: ACTIONS.logout,
                entityType: isClient ? "ClientUser" : "User",
                entityId: userId,
              },
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
        // a portal token says so, and carries no role and no branches:
        // there is nothing in the staff matrix for it to match (P2-9a)
        token.kind = user.kind ?? "staff";
        token.role = user.role;
        token.branchIds = user.branchIds;
        token.isIntern = user.isIntern;
        token.clientId = user.clientId;
        token.mustChangePassword = user.mustChangePassword;
      }
      return token;
    },
    session({ session, token }) {
      // the shape lib/permissions.js expects as its Actor
      session.user.id = String(token.sub);
      session.user.kind = token.kind ?? "staff";
      session.user.role = token.role;
      session.user.branchIds = token.branchIds ?? [];
      session.user.isIntern = token.isIntern ?? false;
      session.user.clientId = token.clientId ?? null;
      session.user.mustChangePassword = token.mustChangePassword ?? false;
      session.user.active = true;
      return session;
    },
  },
});

/**
 * Both lookups below start by decrypting the session cookie, and one page
 * render calls them from a dozen server components. Same request, same
 * cookie, same answer: decrypt it once.
 */
const sessionOnce = cache(auth);

/**
 * The user record behind the session, read once per request.
 *
 * `cache()` is React's per-request memo, so twenty server components and
 * five server actions in one request share a single lookup. One indexed
 * `findById` against Atlas Mumbai from a function in the same region is a
 * couple of milliseconds; the alternative is the bug below.
 */
const liveUser = cache(async (id) => {
  await connectDB();
  return User.findById(id)
    .select("name email role branchIds isIntern active mustChangePassword")
    .lean();
});

/**
 * The signed-in user as lib/permissions.js wants it, or null.
 * Server actions call `requireUser()` instead, which throws.
 *
 * **The session is not trusted for anything but identity.** A JWT is a
 * frozen copy of whatever was true when it was issued, so a token says
 * someone is still a Partner for up to thirty minutes after they were
 * demoted, and still says they work here for thirty minutes after they
 * left. Spec section 16 requires the opposite — "force logout of a user
 * instantly when they leave the firm" — so the role, the branches and the
 * right to be here all come from the database on every request, and only
 * the user id comes from the cookie.
 */
export async function currentUser() {
  const session = await sessionOnce();
  const id = session?.user?.id;
  if (!id) return null;

  /**
   * A portal token is not a weak staff token, it is not a staff token. It
   * would fail the lookup below anyway — the id belongs to `clientUsers` —
   * but a check that works by accident is one refactor from not working
   * (P2-9a).
   */
  if (session.user.kind === "client") return null;

  const live = await liveUser(String(id));
  // deactivated, or deleted outright: the session stops working now, not
  // when its thirty minutes happen to run out
  if (!live || live.active === false) return null;

  return {
    id: String(live._id),
    name: live.name,
    email: live.email,
    role: live.role,
    branchIds: (live.branchIds ?? []).map(String),
    isIntern: Boolean(live.isIntern),
    mustChangePassword: Boolean(live.mustChangePassword),
    active: true,
  };
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

/**
 * The signed-in portal user, read live from `clientUsers` on every request
 * (P2-9a).
 *
 * The same stance as `currentUser()` and for the same reason: a JWT is a
 * frozen copy of what was true when it was issued, and an account the firm
 * has just closed must stop working now rather than in thirty minutes.
 * `clientId` comes from the record, never from the cookie — a token that
 * claimed another company would otherwise open it.
 */
const liveClientUser = cache(async (id) => {
  await connectDB();
  return ClientUser.findById(id)
    .select(
      "name email designation clientId branchId active mustChangePassword",
    )
    .lean();
});

export async function currentClientUser() {
  const session = await sessionOnce();
  const id = session?.user?.id;
  if (!id || session.user.kind !== "client") return null;

  const live = await liveClientUser(String(id));
  if (!live || live.active === false) return null;

  return {
    id: String(live._id),
    kind: "client",
    name: live.name,
    email: live.email,
    designation: live.designation ?? "",
    clientId: String(live.clientId),
    branchId: String(live.branchId),
    mustChangePassword: Boolean(live.mustChangePassword),
    active: true,
  };
}

/** The portal's `requireUser()`: throws rather than returning null. */
export async function requireClientUser() {
  const person = await currentClientUser();
  if (!person) {
    const err = new Error("Not signed in");
    err.code = "UNAUTHENTICATED";
    throw err;
  }
  return person;
}
