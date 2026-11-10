// @ts-check

import { remove } from "../storage/index.js";

/**
 * Let go of bytes the app has decided not to record (spec section 6).
 *
 * An upload is deliberately two steps: the browser sends the file straight
 * to the gateway, and only then does the app record it. So when the app
 * refuses the file — because the gateway read it as something other than
 * what it is called — the bytes are already sitting in the vault with no
 * document row pointing at them. Nobody can reach them, and nothing would
 * ever clean them up.
 *
 * This moves them to the recycle folder, where the ninety-day purge takes
 * them like anything else. Nothing is erased: soft delete is soft delete,
 * even for a file the app never admitted having.
 *
 * It never throws. The person is already being told their file was refused,
 * and that message matters more than the tidying behind it; a gateway that
 * is briefly unreachable must not turn a clear refusal into a crash.
 *
 * @param {string} key
 */
export async function discardStored(key) {
  if (!key) return;
  try {
    await remove(key);
  } catch {
    // left for the purge to find; the refusal itself is what the caller reports
  }
}
