// @ts-check

/**
 * A trial balance to the financial statements (P3-32).
 *
 * Three things live here, all pure: the **heads** a ledger can be mapped
 * to, the **mapping** of one trial balance onto them, and the
 * **statements** that fall out once everything is mapped.
 *
 * **CLAUDE.md rule 8 governs this file.** The head list below is the
 * Schedule III Division I summary, written down as a first draft that a
 * partner confirms before the firm relies on it — the same shape as the
 * due-date master and the notice limitation periods: the table lives in
 * code so nobody can edit it into something plausible-looking, and the
 * *confirmation* lives in `ruleConfirmations` because it is a fact about a
 * person and a date. Until a partner has confirmed it, every screen that
 * reads it says so.
 *
 * What is **not** here, deliberately: any rule about which head a ledger
 * belongs under. A suggestion is made from last year's mapping and from
 * the Tally group's own words, both of which are the firm's own data; the
 * decision is always a person's, and a suggestion is marked as a
 * suggestion until somebody confirms it.
 */

/** The kind under which a confirmation of this table is stored. */
export const CONFIRM_KIND = "SCHEDULE-III-DIV-I";
export const CONFIRM_KEY = "heads";

/**
 * @typedef {object} Head
 * @property {string} key
 * @property {string} name
 * @property {"liability"|"asset"|"income"|"expense"} side
 * @property {string} group   the subtotal it rolls into
 * @property {string} cite    where in Schedule III it comes from
 */

/**
 * The summary heads of Schedule III, Division I.
 *
 * `side` is what makes the statements fall out: a liability and an income
 * are credits, so a credit balance on them is a positive figure in the
 * statement, and the sign is handled once here rather than at every
 * subtotal.
 *
 * @type {Head[]}
 */
export const HEADS = [
  // --- Equity and liabilities ---------------------------------------------
  {
    key: "share-capital",
    name: "Share capital",
    side: "liability",
    group: "Shareholders' funds",
    cite: "Part I, I(1)(a)",
  },
  {
    key: "reserves",
    name: "Reserves and surplus",
    side: "liability",
    group: "Shareholders' funds",
    cite: "Part I, I(1)(b)",
  },
  {
    key: "long-borrowings",
    name: "Long-term borrowings",
    side: "liability",
    group: "Non-current liabilities",
    cite: "Part I, I(3)(a)",
  },
  {
    key: "long-provisions",
    name: "Long-term provisions",
    side: "liability",
    group: "Non-current liabilities",
    cite: "Part I, I(3)(d)",
  },
  {
    key: "short-borrowings",
    name: "Short-term borrowings",
    side: "liability",
    group: "Current liabilities",
    cite: "Part I, I(4)(a)",
  },
  {
    key: "trade-payables",
    name: "Trade payables",
    side: "liability",
    group: "Current liabilities",
    cite: "Part I, I(4)(b)",
  },
  {
    key: "other-current-liabilities",
    name: "Other current liabilities",
    side: "liability",
    group: "Current liabilities",
    cite: "Part I, I(4)(c)",
  },
  {
    key: "short-provisions",
    name: "Short-term provisions",
    side: "liability",
    group: "Current liabilities",
    cite: "Part I, I(4)(d)",
  },

  // --- Assets --------------------------------------------------------------
  {
    key: "ppe",
    name: "Property, plant and equipment",
    side: "asset",
    group: "Non-current assets",
    cite: "Part I, II(1)(a)",
  },
  {
    key: "intangibles",
    name: "Intangible assets",
    side: "asset",
    group: "Non-current assets",
    cite: "Part I, II(1)(a)(ii)",
  },
  {
    key: "non-current-investments",
    name: "Non-current investments",
    side: "asset",
    group: "Non-current assets",
    cite: "Part I, II(1)(b)",
  },
  {
    key: "long-loans-advances",
    name: "Long-term loans and advances",
    side: "asset",
    group: "Non-current assets",
    cite: "Part I, II(1)(d)",
  },
  {
    key: "inventories",
    name: "Inventories",
    side: "asset",
    group: "Current assets",
    cite: "Part I, II(2)(b)",
  },
  {
    key: "trade-receivables",
    name: "Trade receivables",
    side: "asset",
    group: "Current assets",
    cite: "Part I, II(2)(c)",
  },
  {
    key: "cash",
    name: "Cash and cash equivalents",
    side: "asset",
    group: "Current assets",
    cite: "Part I, II(2)(d)",
  },
  {
    key: "short-loans-advances",
    name: "Short-term loans and advances",
    side: "asset",
    group: "Current assets",
    cite: "Part I, II(2)(e)",
  },
  {
    key: "other-current-assets",
    name: "Other current assets",
    side: "asset",
    group: "Current assets",
    cite: "Part I, II(2)(f)",
  },

  // --- Profit and loss -----------------------------------------------------
  {
    key: "revenue",
    name: "Revenue from operations",
    side: "income",
    group: "Income",
    cite: "Part II, 1",
  },
  {
    key: "other-income",
    name: "Other income",
    side: "income",
    group: "Income",
    cite: "Part II, 2",
  },
  {
    key: "materials",
    name: "Cost of materials consumed",
    side: "expense",
    group: "Expenses",
    cite: "Part II, 4(a)",
  },
  {
    key: "purchases-traded",
    name: "Purchases of stock-in-trade",
    side: "expense",
    group: "Expenses",
    cite: "Part II, 4(b)",
  },
  {
    key: "stock-change",
    name: "Changes in inventories of finished goods and work in progress",
    side: "expense",
    group: "Expenses",
    cite: "Part II, 4(c)",
  },
  {
    key: "employee-benefits",
    name: "Employee benefits expense",
    side: "expense",
    group: "Expenses",
    cite: "Part II, 4(d)",
  },
  {
    key: "finance-costs",
    name: "Finance costs",
    side: "expense",
    group: "Expenses",
    cite: "Part II, 4(e)",
  },
  {
    key: "depreciation",
    name: "Depreciation and amortisation expense",
    side: "expense",
    group: "Expenses",
    cite: "Part II, 4(f)",
  },
  {
    key: "other-expenses",
    name: "Other expenses",
    side: "expense",
    group: "Expenses",
    cite: "Part II, 4(g)",
  },
  {
    key: "tax",
    name: "Tax expense",
    side: "expense",
    group: "Tax",
    cite: "Part II, 6",
  },
];

export const HEAD_KEYS = HEADS.map((head) => head.key);

/** @type {Map<string, Head>} */
export const HEAD_BY_KEY = new Map(HEADS.map((head) => [head.key, head]));

/** The order the balance sheet and the P&L are read in. */
export const BALANCE_GROUPS = [
  "Shareholders' funds",
  "Non-current liabilities",
  "Current liabilities",
  "Non-current assets",
  "Current assets",
];
export const PROFIT_GROUPS = ["Income", "Expenses", "Tax"];

/**
 * Reading a pasted trial balance.
 *
 * A TB out of Tally, Busy or Zoho has a ledger name, the group it sits
 * under, and some combination of opening, debit, credit and closing. Only
 * two things are needed: the ledger and a closing balance — and where
 * there is no closing column it is worked out from debit minus credit,
 * which is what every one of those exports means by those columns.
 *
 * **Debits positive, credits negative**, consistently, because that is the
 * only convention under which a trial balance adds to zero and the check
 * below means anything.
 *
 * Every refused row is named with its line number. A trial balance that
 * quietly loses three ledgers produces a balance sheet that does not
 * balance and gives no hint why.
 *
 * @param {Record<string, string>[]} objects from `parseCSVObjects`
 */
export function readTrialBalance(objects) {
  /** @type {{ledger: string, group: string, closingPaise: number}[]} */
  const rows = [];
  /** @type {{line: number, why: string}[]} */
  const refused = [];

  objects.forEach((raw, index) => {
    const line = index + 2; // the header is line 1

    const pick = (...keys) => {
      for (const key of keys) {
        const value = raw[key];
        if (value !== undefined && String(value).trim()) {
          return String(value).trim();
        }
      }
      return "";
    };

    const ledger = pick("ledger", "particulars", "account", "name", "head");
    if (!ledger) {
      refused.push({ line, why: "no ledger name" });
      return;
    }

    /* A total row is not a ledger. Tally and Busy both print one, and
       mapping it would double the whole trial balance. */
    if (/^(grand\s+)?total\b/i.test(ledger)) {
      refused.push({ line, why: `"${ledger}" is a total row` });
      return;
    }

    /**
     * The three ways these exports write a credit, read as one number.
     *
     * A minus sign, brackets, or a trailing "Cr" — Tally writes the third,
     * Busy the second, an Excel column the first. The sign is settled
     * before the digits are parsed, because the alternative is a regex
     * that turns "500000Cr" into "50000-0", which is what the first
     * version of this did and what the test below exists to catch.
     */
    const money = (text) => {
      let digits = String(text ?? "").replace(/[₹,\s]/g, "");
      if (!digits) return 0;

      let sign = 1;
      if (/^\(.*\)$/.test(digits)) {
        sign = -1;
        digits = digits.slice(1, -1);
      }
      const suffix = digits.match(/(cr|dr)$/i);
      if (suffix) {
        if (suffix[1].toLowerCase() === "cr") sign = -1;
        digits = digits.slice(0, -2);
      }

      const value = Number(digits);
      if (!Number.isFinite(value)) return NaN;
      /* A plain minus sign is the third way a credit is written, and it
         survives the stripping above — so it has to be read here as well,
         or "-500000" comes back positive. */
      if (value < 0) sign = -sign;
      return sign * Math.round(Math.abs(value) * 100);
    };

    const closingText = pick("closing", "closingbalance", "balance");
    let closingPaise;

    if (closingText) {
      closingPaise = money(closingText);
    } else {
      const debit = money(pick("debit", "dr"));
      const credit = money(pick("credit", "cr"));
      if (Number.isNaN(debit) || Number.isNaN(credit)) {
        refused.push({ line, why: "the debit or credit is not an amount" });
        return;
      }
      closingPaise = debit - credit;
    }

    if (Number.isNaN(closingPaise)) {
      refused.push({ line, why: `"${closingText}" is not an amount` });
      return;
    }
    if (closingPaise === 0) {
      refused.push({ line, why: `"${ledger}" has a nil balance` });
      return;
    }

    rows.push({
      ledger,
      group: pick("group", "tallygroup", "primarygroup", "under", "category"),
      closingPaise,
    });
  });

  return { rows, refused };
}

/**
 * Does the trial balance add to zero?
 *
 * Returned as the difference rather than a boolean, because the figure is
 * the only useful thing to show: "out by ₹2" is a rounding column somebody
 * dropped, and "out by ₹4,85,000" is a missing ledger.
 */
export function outOfBalance(rows) {
  return rows.reduce((sum, row) => sum + row.closingPaise, 0);
}

/**
 * What to suggest for each ledger, and how confident the suggestion is.
 *
 * Two sources, both the firm's own data and neither of them a rule:
 *
 *  - **Last year.** The same ledger name on this client's previous trial
 *    balance, mapped by a person. This is the one that makes the second
 *    year's work ten minutes instead of an afternoon, and it is marked
 *    `remembered`.
 *  - **The Tally group.** Where the client's own group name contains the
 *    words of a head, it is offered as a `suggested` mapping — a guess
 *    from the client's own chart of accounts, which a person confirms.
 *
 * Everything else is `unmapped` and says so. Nothing is ever silently
 * mapped: a wrong head moves money between the balance sheet and the P&L.
 *
 * @param {{ledger: string, group: string}[]} rows
 * @param {Map<string, string>} lastYear ledger name (lowercased) to head key
 */
export function suggestHeads(rows, lastYear = new Map()) {
  return rows.map((row) => {
    const remembered = lastYear.get(row.ledger.trim().toLowerCase());
    if (remembered && HEAD_BY_KEY.has(remembered)) {
      return { headKey: remembered, status: "remembered" };
    }

    const guess = fromGroup(row.group) ?? fromGroup(row.ledger);
    if (guess) return { headKey: guess, status: "suggested" };

    return { headKey: "", status: "unmapped" };
  });
}

/**
 * The words a client's own group names use, and the head each points at.
 *
 * Longest phrase first, so "sundry creditors" is not matched by
 * "creditors" alone when both would do — and so "current liabilities",
 * which is a group and not a head, never wins over the specific line
 * inside it.
 *
 * This is a reading aid for the firm's own chart of accounts, not a rule
 * about Schedule III. Every match is offered as a suggestion to confirm.
 */
const GROUP_WORDS = [
  ["share capital", "share-capital"],
  ["reserves and surplus", "reserves"],
  ["reserves", "reserves"],
  ["secured loan", "long-borrowings"],
  ["unsecured loan", "long-borrowings"],
  ["bank od", "short-borrowings"],
  ["bank overdraft", "short-borrowings"],
  ["cash credit", "short-borrowings"],
  ["sundry creditors", "trade-payables"],
  ["trade payables", "trade-payables"],
  ["duties and taxes", "other-current-liabilities"],
  ["provisions", "short-provisions"],
  ["fixed assets", "ppe"],
  ["plant and machinery", "ppe"],
  ["furniture", "ppe"],
  ["intangible", "intangibles"],
  ["investments", "non-current-investments"],
  ["stock-in-hand", "inventories"],
  ["stock in hand", "inventories"],
  ["inventor", "inventories"],
  ["sundry debtors", "trade-receivables"],
  ["trade receivables", "trade-receivables"],
  ["cash-in-hand", "cash"],
  ["cash in hand", "cash"],
  ["bank account", "cash"],
  ["bank balance", "cash"],
  ["loans and advances (asset)", "short-loans-advances"],
  ["deposits (asset)", "long-loans-advances"],
  ["sales account", "revenue"],
  ["sales", "revenue"],
  ["direct income", "revenue"],
  ["indirect income", "other-income"],
  ["purchase account", "materials"],
  ["purchase", "materials"],
  ["direct expense", "materials"],
  ["salar", "employee-benefits"],
  ["wages", "employee-benefits"],
  ["interest", "finance-costs"],
  ["bank charges", "finance-costs"],
  ["depreciation", "depreciation"],
  ["indirect expense", "other-expenses"],
];

function fromGroup(text) {
  const haystack = String(text ?? "").toLowerCase();
  if (!haystack) return null;
  for (const [words, key] of GROUP_WORDS) {
    if (haystack.includes(words)) return key;
  }
  return null;
}

/**
 * The balance sheet and the profit and loss, from the mapped lines.
 *
 * **Signs.** The lines keep the trial balance's own convention — debits
 * positive, credits negative — all the way through, and the sign is turned
 * once here, at the head's `side`. A liability is reported as a positive
 * figure, and so is income; both are credits in the books. Doing it this
 * way means a mapping mistake shows up as a figure in the wrong place
 * rather than as a figure with the wrong sign.
 *
 * **The profit goes into reserves.** The P&L's result for the year is part
 * of the closing reserves on the balance sheet it sits beside; a trial
 * balance is struck before that entry is passed, so leaving it out is what
 * makes the two sides differ by exactly the profit.
 *
 * @param {{headKey: string, closingPaise: number}[]} lines
 * @param {{description: string, amountPaise: number, headKey: string, counterHeadKey: string, state: string}[]} [adjustments]
 */
export function statements(lines, adjustments = []) {
  /** @type {Map<string, number>} */
  const byHead = new Map();

  const add = (headKey, paise) => {
    if (!headKey) return;
    byHead.set(headKey, (byHead.get(headKey) ?? 0) + paise);
  };

  for (const line of lines) add(line.headKey, line.closingPaise);

  /* Only entries actually passed move the figures. A proposed entry is a
     proposal, and an unadjusted one is a misstatement the firm has decided
     to live with — neither belongs in the statements. */
  for (const entry of adjustments) {
    if (entry.state !== "Passed in books") continue;
    add(entry.headKey, entry.amountPaise);
    add(entry.counterHeadKey, -entry.amountPaise);
  }

  /** Reported figure for a head: credits shown positive on the credit side. */
  const figure = (head) => {
    const raw = byHead.get(head.key) ?? 0;
    return head.side === "liability" || head.side === "income" ? -raw : raw;
  };

  const rows = HEADS.filter((head) => byHead.has(head.key)).map((head) => ({
    key: head.key,
    name: head.name,
    group: head.group,
    side: head.side,
    cite: head.cite,
    paise: figure(head),
  }));

  const sumOf = (sides) =>
    rows
      .filter((row) => sides.includes(row.side))
      .reduce((sum, row) => sum + row.paise, 0);

  const income = sumOf(["income"]);
  const expenses = sumOf(["expense"]);
  const profitBeforeTax =
    income -
    rows
      .filter((row) => row.side === "expense" && row.key !== "tax")
      .reduce((sum, row) => sum + row.paise, 0);
  const taxExpense = rows
    .filter((row) => row.key === "tax")
    .reduce((sum, row) => sum + row.paise, 0);
  const profit = profitBeforeTax - taxExpense;

  const liabilities = sumOf(["liability"]);
  const assets = sumOf(["asset"]);

  return {
    rows,
    income,
    expenses,
    profitBeforeTax,
    taxExpense,
    profit,
    /** The profit for the year is part of closing reserves. */
    liabilitiesWithProfit: liabilities + profit,
    assets,
    difference: assets - (liabilities + profit),
    balanced: assets - (liabilities + profit) === 0,
  };
}

/**
 * How far through the mapping the firm is.
 *
 * `blocked` is what the next step reads: an unmapped ledger means the
 * statements would be wrong by its balance, so it stops the step rather
 * than producing a balance sheet with a hole in it.
 */
export function mappingProgress(lines) {
  const unmapped = lines.filter((line) => !line.headKey);
  const suggested = lines.filter(
    (line) => line.headKey && line.status === "suggested",
  );
  const remembered = lines.filter((line) => line.status === "remembered");
  const confirmed = lines.filter((line) => line.status === "confirmed");

  return {
    total: lines.length,
    unmapped: unmapped.length,
    unmappedPaise: unmapped.reduce((sum, line) => sum + line.closingPaise, 0),
    suggested: suggested.length,
    remembered: remembered.length,
    confirmed: confirmed.length,
    blocked: unmapped.length > 0,
  };
}

/**
 * Which notes this company needs (P3-32).
 *
 * **Nine standard notes are always needed**, because every set of
 * statements under Schedule III has them; the rest depend on what the
 * company actually did, which is what the questions ask. Each question
 * names the note and the authority for it.
 *
 * What this does **not** do is write a note. The figures for the nine come
 * from the mapped trial balance and are shown with them; the wording of a
 * note is the firm's, and generating one would put sentences into a
 * signed financial statement that nobody had drafted.
 */
export const STANDARD_NOTES = [
  { key: "share-capital", name: "Share capital", cite: "Schedule III, Part I" },
  {
    key: "reserves",
    name: "Reserves and surplus",
    cite: "Schedule III, Part I",
  },
  {
    key: "ppe",
    name: "Property, plant and equipment",
    cite: "Schedule III, Part I; AS 10",
  },
  {
    key: "inventories",
    name: "Inventories",
    cite: "Schedule III, Part I; AS 2",
  },
  {
    key: "trade-receivables",
    name: "Trade receivables, with ageing",
    cite: "Schedule III, Part I",
  },
  {
    key: "cash",
    name: "Cash and cash equivalents",
    cite: "Schedule III, Part I",
  },
  {
    key: "revenue",
    name: "Revenue from operations",
    cite: "Schedule III, Part II",
  },
  { key: "expenses", name: "Other expenses", cite: "Schedule III, Part II" },
  { key: "tax", name: "Tax expense", cite: "Schedule III, Part II; AS 22" },
];

/**
 * The questions whose answers add a note, each with the authority.
 *
 * Phrased so that **yes adds a note**: a question whose "no" adds
 * something is a question people answer wrong.
 */
export const NOTE_QUESTIONS = [
  {
    key: "msme",
    question: "Is anything owed to micro or small enterprises?",
    note: "Trade payables — MSME and others separately, with ageing",
    cite: "Schedule III, Part I; MSMED Act s.22",
  },
  {
    key: "relatedParty",
    question: "Any loans from directors or their relatives?",
    note: "Related party disclosures, and borrowings from directors",
    cite: "AS 18",
  },
  {
    key: "secured",
    question: "Any secured borrowing from a bank?",
    note: "Borrowings — security, terms, and the quarterly statements filed with the bank against the books",
    cite: "Schedule III, Part I",
  },
  {
    key: "csr",
    question: "Is the company covered by CSR?",
    note: "CSR — the amount required, spent and unspent",
    cite: "Companies Act s.135",
  },
  {
    key: "forex",
    question: "Any transaction in a foreign currency?",
    note: "Earnings and expenditure in foreign currency",
    cite: "AS 11; Schedule III, Part II",
  },
  {
    key: "contingent",
    question: "Any contingent liability, or a guarantee given?",
    note: "Contingent liabilities and commitments",
    cite: "AS 29; Schedule III, Part I",
  },
  {
    key: "gratuity",
    question: "Are employees eligible for gratuity?",
    note: "Employee benefits — the gratuity provision and its assumptions",
    cite: "AS 15",
  },
  {
    key: "lease",
    question: "Are any premises held on lease?",
    note: "Leases — operating lease payments",
    cite: "AS 19",
  },
];

/** The notes this set of answers produces, standard ones first. */
export function notesNeeded(answers = {}) {
  return [
    ...STANDARD_NOTES.map((note) => ({ ...note, always: true })),
    ...NOTE_QUESTIONS.filter((row) => answers[row.key] === true).map((row) => ({
      key: row.key,
      name: row.note,
      cite: row.cite,
      always: false,
    })),
  ];
}
