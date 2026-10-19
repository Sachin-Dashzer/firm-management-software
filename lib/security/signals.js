// @ts-check

import AuditLog from "../../models/AuditLog.js";
import User from "../../models/User.js";
import { ACTIONS } from "../audit/index.js";

/**
 * Breach detection (spec section 16).
 *
 * The firm does not need an intrusion-detection system; it needs four
 * questions answered on one screen, from the audit log it already keeps:
 *
 *  - is somebody being guessed at? (failed sign-ins)
 *  - is somebody reading more client passwords than their work explains?
 *  - has anyone downloaded an unusual number of client documents?
 *  - is the audit log itself still intact?
 *
 * None of these is proof of anything. They are the things worth a second
 * look, which is all detection means at this size — and each one links to
 * the entries behind it so the look is one click rather than a request to
 * the developer.
 *
 * Thresholds are deliberately generous. A screen that cries wolf gets
 * ignored, and an ignored screen is worse than none.
 */

const DAY = 24 * 60 * 60 * 1000;

/** @param {{ since?: Date, now?: Date }} [options] */
export async function securitySignals(options = {}) {
  const now = options.now ?? new Date();
  const since = options.since ?? new Date(now.getTime() - 7 * DAY);

  const [failures, reveals, downloads, people] = await Promise.all([
    AuditLog.find({ action: ACTIONS.loginFailed, ts: { $gte: since } })
      .select("userName ip ts note")
      .limit(2000)
      .lean(),
    AuditLog.find({ action: ACTIONS.credentialReveal, ts: { $gte: since } })
      .select("userId userName clientId ts")
      .limit(5000)
      .lean(),
    AuditLog.find({
      action: ACTIONS.documentDownload,
      ts: { $gte: since },
    })
      .select("userId userName ts")
      .limit(10000)
      .lean(),
    User.find({ active: true }).select("name role").lean(),
  ]);

  const signals = [];

  // --- somebody being guessed at ----------------------------------------
  const byAccount = tally(failures, (row) => row.userName || "unknown");
  for (const [who, count] of byAccount) {
    if (count < 10) continue;
    signals.push({
      key: `failed:${who}`,
      level: count >= 25 ? "serious" : "watch",
      what: `${count} failed sign-ins for ${who} in the last seven days`,
      why: "Five wrong passwords locks the account for fifteen minutes, so a number this high means somebody is still trying.",
      href: "/audit?action=login_failed",
    });
  }

  const byIp = tally(
    failures.filter((row) => row.ip),
    (row) => row.ip,
  );
  for (const [ip, count] of byIp) {
    if (count < 20) continue;
    signals.push({
      key: `failedIp:${ip}`,
      level: "serious",
      what: `${count} failed sign-ins from one address (${ip})`,
      why: "One machine trying many accounts looks different from somebody forgetting their own password.",
      href: "/audit?action=login_failed",
    });
  }

  // --- credential reveals ------------------------------------------------
  const revealsBy = tally(reveals, (row) => row.userName || "someone");
  for (const [who, count] of revealsBy) {
    if (count < 20) continue;
    signals.push({
      key: `reveal:${who}`,
      level: count >= 50 ? "serious" : "watch",
      what: `${who} revealed ${count} client portal passwords in seven days`,
      why: "Revealing a password is normal; revealing dozens in a week is worth asking about.",
      href: "/audit?action=credential_reveal",
    });
  }

  // --- document downloads ------------------------------------------------
  const downloadsBy = tally(downloads, (row) => row.userName || "someone");
  for (const [who, count] of downloadsBy) {
    if (count < 200) continue;
    signals.push({
      key: `download:${who}`,
      level: count >= 500 ? "serious" : "watch",
      what: `${who} downloaded ${count} client documents in seven days`,
      why: "A busy filing week looks like this. So does somebody taking the client list with them.",
      href: "/audit?action=document_download",
    });
  }

  return {
    since,
    signals: signals.sort((a, b) =>
      a.level === b.level ? 0 : a.level === "serious" ? -1 : 1,
    ),
    counts: {
      failures: failures.length,
      reveals: reveals.length,
      downloads: downloads.length,
      staff: people.length,
    },
  };
}

/**
 * Group rows and count them, biggest first.
 * @template T
 * @param {T[]} rows
 * @param {(row: T) => string} keyOf
 * @returns {Array<[string, number]>}
 */
function tally(rows, keyOf) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}
