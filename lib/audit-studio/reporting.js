// @ts-check

import { isUnresolved } from "./exceptions.js";
import { flagsWithoutExceptions, LEDGER_TESTS } from "./tests.js";
import { areaProgress } from "./standards.js";

/**
 * CARO, 3CD, the opinion, and the fact that a signed report is a snapshot
 * (P3-14).
 *
 * The three things this file is careful about:
 *
 *  1. **The opinion has three layers and they can disagree.** What the
 *     matters on the file suggest, the reviewer's own overall conclusion,
 *     and the opinion actually signed. Most systems record only the third,
 *     which is how a qualified matter ends up under a clean opinion with
 *     nobody having said anything about it. So the overall conclusion is
 *     recorded against a **signature of its inputs**: change a matter or
 *     the opinion type and the conclusion goes stale and has to be given
 *     again.
 *  2. **A signed report is locked.** It becomes a snapshot — version,
 *     date, UDIN, opinion, the matters as they read, the text. Changing
 *     anything afterwards is an *amendment*, which needs a fresh review and
 *     **a new UDIN**, and the old snapshot stays.
 *  3. **CARO and 3CD answers are pre-filled from the tests, not invented.**
 *     Where a test feeds a clause, the clause says which test and what it
 *     found. Nothing is filled in from nowhere, and every clause still has
 *     to be answered by a person.
 *
 * Every clause reference below is a pointer to something a partner reads,
 * the same stance as the notice-law table and the auditing standards.
 */

export const CONFIRM_KIND = "AUDIT-REPORT";

/** SA 700 / SA 705: what an opinion can be. */
export const OPINION_TYPES = [
  "Unmodified",
  "Qualified",
  "Adverse",
  "Disclaimer of opinion",
];

/** The twenty-one CARO 2020 clauses, as the prototype lists them. */
export const CARO_CLAUSES = [
  ["(i)", "Property, plant and equipment and intangible assets"],
  ["(ii)", "Inventory, and quarterly statements given to banks"],
  ["(iii)", "Investments, loans and guarantees given to others"],
  ["(iv)", "Sections 185 and 186"],
  ["(v)", "Deposits accepted"],
  ["(vi)", "Cost records"],
  ["(vii)", "Statutory dues, and disputed dues"],
  ["(viii)", "Income surrendered in tax assessments"],
  ["(ix)", "Repayment of borrowings, and the use of loans"],
  ["(x)", "IPO, private placement, preferential allotment"],
  ["(xi)", "Fraud, and whistle-blower complaints"],
  ["(xii)", "Nidhi company"],
  ["(xiii)", "Related party transactions (s.177, s.188)"],
  ["(xiv)", "Internal audit system"],
  ["(xv)", "Non-cash transactions with directors (s.192)"],
  ["(xvi)", "Registration under s.45-IA of the RBI Act"],
  ["(xvii)", "Cash losses"],
  ["(xviii)", "Resignation of the statutory auditors"],
  ["(xix)", "Material uncertainty on meeting liabilities"],
  ["(xx)", "CSR — unspent amount"],
  ["(xxi)", "Qualifications in the CARO of group companies"],
].map(([no, what]) => ({ key: `CARO ${no}`, no, what }));

/** The 3CD clauses the tests above can pre-fill. */
export const CD3_CLAUSES = [
  ["8", "The relevant clause of s.44AB"],
  ["16", "Amounts not credited to the profit and loss account"],
  ["18", "Depreciation under the Income-tax Act"],
  ["21(a)", "Personal or capital expenses debited"],
  ["21(b)", "Disallowance under s.40(a) — TDS not deducted or paid"],
  ["21(d)", "Cash payments above the s.40A(3) limit"],
  ["22", "Interest inadmissible under s.23 of the MSMED Act"],
  ["26", "Sums covered by s.43B"],
  ["31", "Loans taken or repaid in cash (s.269SS / s.269T)"],
  ["34", "TDS and TCS compliance"],
  ["44", "Break-up of expenditure by GST registration status"],
].map(([no, what]) => ({ key: `3CD ${no}`, no, what }));

/** Blank answers for a new file. */
export function buildReportAnswers() {
  return [...CARO_CLAUSES, ...CD3_CLAUSES].map((clause) => ({
    key: clause.key,
    no: clause.no,
    what: clause.what,
    kind: clause.key.startsWith("CARO") ? "CARO" : "3CD",
    answer: "",
    notApplicable: false,
    answeredBy: null,
    answeredByName: "",
    answeredAt: null,
  }));
}

/** Test key → the clauses it feeds, built once. */
const TEST_FEEDS = new Map(LEDGER_TESTS.map((test) => [test.key, test.feeds]));

/**
 * What the tests have to say about one clause, so the answer is pre-filled
 * from evidence rather than typed from memory.
 *
 * @param {string} answerKey
 * @param {Array<any>} tests  as stored on the file
 * @param {Array<any>} exceptions
 */
export function prefillFor(answerKey, tests = [], exceptions = []) {
  const feeding = tests.filter((test) =>
    (TEST_FEEDS.get(test.key) ?? []).includes(answerKey),
  );
  if (!feeding.length) return null;

  const lines = feeding.map((test) => {
    const found = exceptions.filter((row) => row.test === test.key);
    if (!test.ranAt) {
      return `${test.key} (${test.name}) has not been run.`;
    }
    if ((test.flags ?? 0) === 0) {
      return `${test.key}: nothing found over ${test.population || "the population"}.`;
    }
    return `${test.key}: ${test.flags} found over ${test.population || "the population"}${
      found.length
        ? ` — ${found.map((row) => row.what).join("; ")}`
        : " — not yet raised as exceptions"
    }.`;
  });

  return {
    tests: feeding.map((test) => test.key),
    lines,
    /** True when the evidence is complete enough to answer from. */
    ready: feeding.every((test) => test.ranAt),
  };
}

/**
 * Layer one: what the matters on the file suggest the opinion should be.
 *
 * Deliberately crude, and deliberately not binding. It reads the report
 * conclusions somebody has written against the exceptions, and says what
 * they add up to. The reviewer may disagree — that is layer two, and the
 * disagreement being visible is the point.
 *
 * @param {Array<any>} exceptions
 */
export function suggestedOpinion(exceptions = []) {
  const carried = exceptions.filter((row) => row.reportEffect);
  const unresolved = exceptions.filter(isUnresolved);

  if (unresolved.length) {
    return {
      type: null,
      why: `${unresolved.length} ${unresolved.length === 1 ? "matter is" : "matters are"} unresolved, so the matters cannot suggest anything yet.`,
      matters: [],
    };
  }

  const matters = carried.map((row) => ({
    what: row.what,
    effect: row.reportEffect,
  }));

  const adverse = matters.some((row) => row.effect === "Adverse");
  const qualify = matters.some((row) => row.effect === "Qualify");

  return {
    type: adverse ? "Adverse" : qualify ? "Qualified" : "Unmodified",
    why: matters.length
      ? `${matters.length} ${matters.length === 1 ? "matter carries" : "matters carry"} into the report.`
      : "No matter on the file carries into the report.",
    matters,
  };
}

/**
 * The fingerprint of everything the overall conclusion was given against.
 *
 * If any of it moves, the conclusion is about something that no longer
 * exists. This is the same device as P3-5's version on an approval, and it
 * is here for the same reason: a judgement recorded is not a judgement that
 * still stands.
 *
 * @param {any} file
 */
export function conclusionSignature(file) {
  const matters = (file?.exceptions ?? [])
    .filter((row) => row.reportEffect)
    .map((row) => `${row._id ?? row.what}:${row.reportEffect}`)
    .sort();

  return JSON.stringify([
    matters,
    file?.opinion?.type ?? "",
    Boolean(file?.opinion?.emphasis),
  ]);
}

/** Does the recorded overall conclusion still describe this file? */
export function conclusionStands(file) {
  const overall = file?.overall;
  if (!overall?.text) return false;
  return overall.signature === conclusionSignature(file);
}

/** A signed report that nobody has opened an amendment on is locked. */
export function isLocked(file) {
  return Boolean(file?.signed?.signedAt && !file?.amending);
}

/**
 * Everything that has to be true before a report is signed, each with
 * whether it is.
 *
 * One list, used by the screen to show the state and by the action to
 * refuse — so the button and the server can never disagree about why.
 *
 * @param {any} file
 * @returns {Array<{what: string, ok: boolean}>}
 */
export function readiness(file) {
  const exceptions = file?.exceptions ?? [];
  const tests = file?.tests ?? [];
  const answers = file?.reportAnswers ?? [];

  const openFlags = flagsWithoutExceptions(tests, exceptions);
  const caro = answers.filter((row) => row.kind === "CARO");
  const unanswered = caro.filter(
    (row) => !row.notApplicable && !String(row.answer ?? "").trim(),
  );
  const areasIncomplete = (file?.areas ?? []).filter(
    (area) =>
      !areaProgress(
        area,
        exceptions.filter((row) => isUnresolved(row) && row.area === area.key)
          .length,
      ).complete,
  );

  return [
    {
      what: "Every matter the audit found is verified or explained",
      ok: exceptions.every((row) => !isUnresolved(row)),
    },
    {
      what: "Every test that found something has its findings on the file",
      ok: openFlags.length === 0,
    },
    {
      what: "Every working-paper area is complete",
      ok: areasIncomplete.length === 0,
    },
    {
      what: "Materiality is set, with its basis",
      ok: Boolean(file?.materialityPaise && file?.materialityBasis),
    },
    {
      what: "Every CARO clause is answered, or marked not applicable",
      ok: unanswered.length === 0,
    },
    {
      what: "An opinion type has been chosen",
      ok: Boolean(file?.opinion?.type),
    },
    {
      what: "The reviewer's overall conclusion is recorded for this version of the file",
      ok: conclusionStands(file),
    },
    {
      what: "A UDIN has been generated for the report",
      ok: Boolean(String(file?.opinion?.udin ?? "").trim()),
    },
  ];
}

/** What is stopping it being signed, in words. */
export function blockingSign(file) {
  if (isLocked(file)) {
    return [
      `Version ${file.signed.version} is signed and locked. Open an amendment to sign again.`,
    ];
  }
  return readiness(file)
    .filter((row) => !row.ok)
    .map((row) => row.what);
}

/**
 * Sign it: the file becomes a snapshot, and the snapshot is what the firm
 * issued.
 *
 * The UDIN is **not** reused on an amendment. ICAI's whole point in
 * requiring one is that a particular document signed on a particular day
 * can be identified; a revised report carrying the first report's UDIN
 * defeats that, so the new version demands a new one.
 *
 * @param {any} file
 * @param {{ id: string, name: string, role: string }} actor
 * @param {{ text?: string }} input
 * @param {Date} [now]
 */
export function signReport(file, actor, input = {}, now = new Date()) {
  const blocked = blockingSign(file);
  if (blocked.length) {
    return { ok: false, error: blocked[0], blocked };
  }
  if (actor.role !== "partner") {
    return {
      ok: false,
      error: "Only a partner signs an audit report.",
    };
  }

  const version = (file.signedHistory?.length ?? 0) + 1;
  const udin = String(file.opinion?.udin ?? "").trim();

  const used = (file.signedHistory ?? []).some((row) => row.udin === udin);
  if (used) {
    return {
      ok: false,
      error:
        "That UDIN is already on an earlier version of this report. An amended report needs its own UDIN.",
    };
  }

  const snapshot = {
    version,
    signedAt: now,
    signedBy: actor.id,
    signedByName: actor.name,
    udin,
    opinionType: file.opinion.type,
    emphasis: file.opinion.emphasis ?? "",
    matters: (file.exceptions ?? [])
      .filter((row) => row.reportEffect)
      .map((row) => `${row.what} — ${row.reportEffect}`),
    overall: file.overall?.text ?? "",
    text: String(input.text ?? "").trim(),
  };

  file.signedHistory = file.signedHistory ?? [];
  file.signedHistory.push(snapshot);
  file.signed = snapshot;
  file.amending = false;

  return { ok: true, version, snapshot };
}

/**
 * Open an amendment on a signed report.
 *
 * Unlocks the file, keeps every snapshot, and clears the UDIN — so the next
 * signature cannot go out carrying the last one's number. The reason is
 * mandatory: a revised report is a thing the firm has to be able to explain.
 *
 * @param {any} file
 * @param {string} reason
 * @param {{ id: string, name: string, role: string }} actor
 */
export function openAmendment(file, reason, actor) {
  if (!file?.signed?.signedAt) {
    return { ok: false, error: "Nothing has been signed to amend." };
  }
  if (file.amending) {
    return { ok: false, error: "An amendment is already open." };
  }
  if (actor.role !== "partner") {
    return {
      ok: false,
      error: "Only a partner opens an amendment to a signed report.",
    };
  }
  const why = String(reason ?? "").trim();
  if (why.length < 10) {
    return {
      ok: false,
      error:
        "Say why the signed report is being amended. A revised report is something the firm has to be able to explain.",
    };
  }

  file.amending = true;
  file.amendmentReason = why;
  file.amendmentOpenedBy = actor.id;
  file.amendmentOpenedByName = actor.name;
  file.amendmentOpenedAt = new Date();
  // the overall conclusion and the UDIN belong to the version that was
  // signed, not to the one being written
  file.overall = undefined;
  if (file.opinion) file.opinion.udin = "";

  return { ok: true, version: (file.signedHistory?.length ?? 0) + 1 };
}

/**
 * How long the file has been open since the report was signed.
 *
 * SA 230 gives a period for assembling the final file. The number of days
 * is a rule, so it is not asserted here: the clock counts, and the file
 * says the count with the standard beside it for a partner to judge.
 *
 * @param {any} file
 * @param {Date} [now]
 */
export function closureClock(file, now = new Date()) {
  const signedAt = file?.signed?.signedAt;
  if (!signedAt) return null;

  const days = Math.floor(
    (now.getTime() - new Date(signedAt).getTime()) / 86_400_000,
  );

  return {
    days,
    signedAt: new Date(signedAt),
    closed: file.stage === "File closure",
    note: `${days} ${days === 1 ? "day" : "days"} since the report was signed. SA 230 sets a period for assembling the final file; the firm's own deadline is a partner's to set, so this counts rather than judges.`,
  };
}
