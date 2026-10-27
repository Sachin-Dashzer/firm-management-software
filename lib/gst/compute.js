// @ts-check

/**
 * An indicative GST computation from the client's own sheet (P3-12).
 *
 * **Every figure this produces is indicative and the screens say so on all
 * of them.** The return the firm files is prepared from the GSTR-2B
 * reconciliation; this is prepared from what the client typed. The two
 * differ, routinely, and the point of showing this number early is to tell
 * the client roughly what to keep aside — not to decide what goes on a
 * return.
 *
 * Two rules do real work here and both are law, so both are in
 * `SET_OFF_ORDER` with their sections and neither is treated as settled
 * until a partner confirms it (CLAUDE.md rule 8, the same stance as the
 * notice-law table at P3-11 and the due-date master at step 7):
 *
 *  - credit is taken only where the client marked it eligible **and** the
 *    goods or service have actually arrived
 *  - the order credit is used in, and in particular that CGST credit is
 *    never used against an SGST liability or the other way round
 *
 * Without the confirmation the computation still runs — a bookkeeper needs
 * the arithmetic — but it is returned marked `confirmed: false`, and the
 * screen does not offer it to a client in that state.
 */

/**
 * The order credit is used in, as the prototype states it.
 *
 * Read it as: IGST credit against IGST first, then CGST, then SGST; CGST
 * credit against CGST then IGST; SGST credit against SGST then IGST. There
 * is deliberately no CGST→SGST or SGST→CGST step.
 */
export const SET_OFF_ORDER = {
  key: "setOff",
  steps: [
    ["igst", "igst"],
    ["igst", "cgst"],
    ["igst", "sgst"],
    ["cgst", "cgst"],
    ["cgst", "igst"],
    ["sgst", "sgst"],
    ["sgst", "igst"],
  ],
  rules: [
    {
      key: "order",
      text: "IGST credit is used first, against IGST and then against CGST and SGST; CGST and SGST credit is used against its own head and then against IGST",
      cite: "s.49(5) and s.49A CGST Act, with Rule 88A — a partner must confirm the order as it now stands",
    },
    {
      key: "cross",
      text: "CGST credit is never used against an SGST liability, nor SGST credit against a CGST liability",
      cite: "s.49(5) CGST Act",
    },
    {
      key: "eligibility",
      text: "Credit is taken only where it is eligible and the goods or service have been received",
      cite: "s.16(2) CGST Act",
    },
  ],
};

const heads = () => ({ igst: 0, cgst: 0, sgst: 0 });

const num = (value) => {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(String(value).replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const isReceived = (value) =>
  value instanceof Date ? !Number.isNaN(value.valueOf()) : Boolean(value);

/**
 * @param {Record<string, Array<Record<string, any>>>} sheets
 * @param {Array<{key: string, confirmedAt?: Date|null}>} [confirmations]
 */
export function computeGst(sheets, confirmations = []) {
  const output = heads();
  const credit = heads();
  /** Rows whose credit was not taken, and why — named, never silently dropped. */
  const excluded = [];

  for (const key of ["salesB2B", "salesB2C"]) {
    for (const row of sheets?.[key] ?? []) {
      output.igst += num(row.igst);
      output.cgst += num(row.cgst);
      output.sgst += num(row.sgst);
    }
  }

  for (const row of sheets?.purchases ?? []) {
    const eligible = ["Y", "YES"].includes(
      String(row.eligible ?? "")
        .trim()
        .toUpperCase(),
    );
    const received = isReceived(row.receivedOn);

    if (!eligible || !received) {
      excluded.push({
        invoiceNo: row.invoiceNo ?? "",
        why: !eligible
          ? "not marked eligible"
          : "the goods or service had not arrived",
        amount: num(row.igst) + num(row.cgst) + num(row.sgst),
      });
      continue;
    }

    credit.igst += num(row.igst);
    credit.cgst += num(row.cgst);
    credit.sgst += num(row.sgst);
  }

  // the set-off, in the order above and no other
  const owed = { ...output };
  const left = { ...credit };
  const used = heads();

  for (const [from, to] of SET_OFF_ORDER.steps) {
    const amount = Math.min(left[from], owed[to]);
    if (amount <= 0) continue;
    left[from] -= amount;
    owed[to] -= amount;
    used[from] += amount;
  }

  const confirmedKeys = new Set(
    confirmations.filter((row) => row.confirmedAt).map((row) => row.key),
  );
  const confirmed = SET_OFF_ORDER.rules.every((rule) =>
    confirmedKeys.has(rule.key),
  );

  return {
    output,
    credit,
    /** What is left to pay in cash, head by head. */
    cash: {
      igst: round(owed.igst),
      cgst: round(owed.cgst),
      sgst: round(owed.sgst),
    },
    /** Credit left over, which carries forward. */
    carried: {
      igst: round(left.igst),
      cgst: round(left.cgst),
      sgst: round(left.sgst),
    },
    used,
    excluded,
    total: round(owed.igst + owed.cgst + owed.sgst),
    confirmed,
    unconfirmed: SET_OFF_ORDER.rules
      .filter((rule) => !confirmedKeys.has(rule.key))
      .map((rule) => ({ key: rule.key, text: rule.text, cite: rule.cite })),
    /** The sentence that travels with every figure above. */
    caveat:
      "Indicative, worked out from the sheet the client sent: credit only where it is marked eligible and has arrived. The return the firm files is prepared from the GSTR-2B reconciliation, not from this sheet.",
  };
}

const round = (value) => Math.round(value);

/**
 * The computation as whole rupees in paise, for anything that stores money.
 *
 * The sheet is in rupees because that is what a client types; everything
 * this system stores is integer paise (CLAUDE.md rule 5), and the boundary
 * between the two is here rather than in four screens.
 *
 * @param {ReturnType<typeof computeGst>} result
 */
export function toPaise(result) {
  return {
    outputPaise: round(
      (result.output.igst + result.output.cgst + result.output.sgst) * 100,
    ),
    creditPaise: round(
      (result.credit.igst + result.credit.cgst + result.credit.sgst) * 100,
    ),
    cashPaise: round(result.total * 100),
    carriedPaise: round(
      (result.carried.igst + result.carried.cgst + result.carried.sgst) * 100,
    ),
  };
}
