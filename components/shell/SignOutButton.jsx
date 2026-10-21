"use client";

import { signOut } from "next-auth/react";

/**
 * Sign out, back to a named front door (P2-9a).
 *
 * The staff top bar has its own menu item; the portal needs the same thing
 * on its own, and sending a client to `/login` after signing out would put
 * them on the firm's screen with no way back to theirs.
 */
export default function SignOutButton({
  className = "",
  to = "/client/login",
  children = "Sign out",
}) {
  return (
    <button
      type="button"
      onClick={() => signOut({ redirectTo: to })}
      className={className}
    >
      {children}
    </button>
  );
}
