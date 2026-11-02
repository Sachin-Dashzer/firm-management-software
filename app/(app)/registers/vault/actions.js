"use server";

import { requireUser } from "@/auth";
import { assertCan } from "@/lib/permissions";
import { issueChallenge, verifyChallenge } from "@/lib/captcha";
import { revealCredential } from "../../clients/actions";

/**
 * Revealing a password from the firm-wide vault (P3-22b).
 *
 * The decryption itself is **not** written again here. `revealCredential()`
 * in the clients actions is the one door: it re-reads the credential, checks
 * `clientCredentials` against that client's own branch, writes the
 * `credentialReveal` audit entry inside the transaction and stamps
 * `lastRevealedAt`. A second copy of that on this screen would be a second
 * place for the check to drift out of.
 *
 * What this file adds is the gate in front of it: a code typed by hand, so a
 * list of two hundred logins cannot hand one over to a mis-click. See
 * `lib/captcha.js` for what that is and is not.
 */

/** A fresh code to type. Only somebody who may read the vault gets one. */
export async function newVaultChallenge() {
  const actor = await requireUser();
  assertCan(actor, "view", "clientCredentials");
  return issueChallenge();
}

/**
 * @param {string} credentialId
 * @param {string} token the token that came with the code
 * @param {string} answer what they typed
 */
export async function revealFromVault(credentialId, token, answer) {
  const actor = await requireUser();
  // the branch-level check is inside revealCredential, against this
  // credential's own client; this one refuses the page outright
  assertCan(actor, "view", "clientCredentials");

  if (!verifyChallenge(token, answer)) {
    return { error: "That is not the code on screen. Here is a new one." };
  }

  return revealCredential(credentialId);
}
