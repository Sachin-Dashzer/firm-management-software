// @ts-check

/**
 * What kind of sheet this is, and what to do with it (the owner's screen
 * of 02-11-2026).
 *
 * The lab's old stance was that it profiles and never interprets, because
 * a tool that guesses analyses the wrong column with confidence. That
 * stance survives here, with one change: it is allowed to **recognise**
 * and **suggest**, and a person still confirms.
 *
 *  - `detectKind` reads the headers and says "this looks like a sales
 *    register". It is shown as a sentence with the word *looks*, and there
 *    is a dropdown to say otherwise.
 *  - `guessMapping` fills the which-column-is-which boxes from the
 *    headers. They are still boxes, still shown, still editable — the
 *    difference is that the common case does not have to be typed.
 *  - `CHECKLISTS` is the part that matters: for each kind of sheet, what
 *    a person should actually look at, and **how**. Some of it the lab can
 *    do itself (`auto`), and the rest is somebody's work with the sheet
 *    open — written out so a new joiner does not have to be told.
 *
 * Nothing in the checklists states a statutory date, a rate or a limit
 * (CLAUDE.md rule 8). Where a threshold matters the line says to check it,
 * because the figure belongs in the firm's own confirmed rules and not in
 * a helper file.
 */

export const KINDS = [
  { key: "tb", label: "Trial balance" },
  { key: "sales", label: "Sales register" },
  { key: "bank", label: "Bank statement" },
  { key: "generic", label: "Something else" },
];

export const kindLabel = (key) =>
  KINDS.find((kind) => kind.key === key)?.label ?? "Something else";

/** Does any header contain this word? */
const has = (headers, word) =>
  headers.some((header) => header.toLowerCase().includes(word));

/**
 * Which of the three it looks like, or "generic".
 *
 * Deliberately unclever: the three shapes are recognised by the words
 * their columns are always called. A sheet that does not match is
 * *generic*, which is a real answer — it gets the column profile and the
 * two checks that need no mapping, rather than being forced into a shape
 * it is not.
 *
 * @param {string[]} headers
 * @returns {"tb"|"sales"|"bank"|"generic"}
 */
export function detectKind(headers = []) {
  const list = headers.map((header) => String(header ?? ""));

  if (has(list, "ledger") && (has(list, "closing") || has(list, "balance"))) {
    return "tb";
  }
  if (
    has(list, "invoice") &&
    (has(list, "taxable") || has(list, "amount") || has(list, "value"))
  ) {
    return "sales";
  }
  if (
    (has(list, "narration") ||
      has(list, "description") ||
      has(list, "particular")) &&
    (has(list, "withdrawal") || has(list, "debit")) &&
    (has(list, "deposit") || has(list, "credit"))
  ) {
    return "bank";
  }
  return "generic";
}

/** The first column whose header matches, as a string index. */
function find(columns, words, kinds) {
  const match = columns.find(
    (column) =>
      (!kinds || kinds.includes(column.kind)) &&
      words.some((word) => column.header.toLowerCase().includes(word)),
  );
  return match ? String(match.index) : "";
}

/**
 * The which-column-is-which boxes, filled in from the headers.
 *
 * @param {Array<{index: number, header: string, kind: string}>} columns
 * @param {string} kind
 * @returns {Record<string, string>}
 */
export function guessMapping(columns = [], kind = "generic") {
  const date = find(columns, ["date"], ["date"]);
  const party = find(
    columns,
    ["customer", "party", "ledger", "narration", "supplier", "name"],
    ["text"],
  );
  const reference = find(columns, [
    "invoice no",
    "invoice number",
    "voucher",
    "reference",
    "ref",
    "cheque",
  ]);

  if (kind === "bank") {
    return {
      date,
      party,
      reference,
      debit: find(columns, ["withdrawal", "debit", "paid"], ["number"]),
      credit: find(columns, ["deposit", "credit", "received"], ["number"]),
    };
  }

  if (kind === "tb") {
    return {
      party,
      amount: find(columns, ["closing", "balance"], ["number"]),
      debit: find(columns, ["debit"], ["number"]),
      credit: find(columns, ["credit"], ["number"]),
    };
  }

  return {
    date,
    party,
    reference,
    amount: find(columns, ["taxable", "amount", "value", "total"], ["number"]),
  };
}

/**
 * What to look at, by kind of sheet.
 *
 * `auto` names the finding the lab produces by itself, so the screen can
 * put the lab's answer against the line instead of leaving somebody to
 * match them up. Everything else is a person's work, and `how` is how.
 */
export const CHECKLISTS = {
  tb: [
    {
      key: "balance",
      title: "The trial balance totals to zero",
      how: "Add every closing balance. Anything other than nil means the export is incomplete — usually one row with the amount in the wrong column, or an opening balance that was left out.",
      auto: "balance",
    },
    {
      key: "movement",
      title: "Movement against last year",
      how: "Compare each ledger with the same ledger last year and ask about anything that has moved more than a quarter. Do it before fieldwork, not during: the explanations take days to arrive.",
    },
    {
      key: "margins",
      title: "Gross margin and the expense ratios",
      how: "Revenue less cost of materials, over revenue. Compare with last year and with what the client says happened. A margin that moves without a reason is the first thread to pull.",
    },
    {
      key: "suspense",
      title: "Suspense and clearing ledgers",
      how: "Any balance in a suspense, difference or clearing account has to be cleared or explained before the accounts are finalised. It is never a real asset.",
    },
    {
      key: "wrongside",
      title: "Balances on the wrong side",
      how: "A creditor with a debit balance and a debtor with a credit balance are usually advances, and occasionally an error. Either way they are reclassified rather than netted.",
    },
    {
      key: "cash",
      title: "Is the cash balance believable",
      how: "A large year-end cash balance needs a certificate from the client and a physical count. Compare it with the usual month-end level through the year.",
    },
    {
      key: "related",
      title: "Ledgers named after a person",
      how: "A ledger in a director's, partner's or relative's name is a related party until somebody shows it is not — which matters for the disclosures and for approvals.",
    },
    {
      key: "working",
      title: "Working capital and the ratios",
      how: "Current assets over current liabilities, and the ratios the bank's sanction letter asks for. A breach the client has not mentioned is worth knowing before the bank mentions it.",
    },
    {
      key: "schedule3",
      title: "Map the ledgers to the statements",
      how: "The grouping the financial statements need is done once and remembered; this sheet is the input to it, not the output.",
    },
  ],
  sales: [
    {
      key: "returns",
      title: "Agree the register with the returns filed",
      how: "Total it by month and compare with what went in the GST returns for the same months. The monthly totals are in the chart above. Differences go into the reconciliation, not into a note.",
    },
    {
      key: "series",
      title: "The invoice series runs unbroken",
      how: "A missing number is either a cancelled invoice or a sale nobody recorded, and only the client can say which. Ask for the cancelled list.",
      auto: "series",
    },
    {
      key: "duplicates",
      title: "No number used twice",
      how: "The same number on two rows is usually the file exported twice, sometimes a credit note, occasionally two invoices. Open all of them.",
      auto: "duplicates",
    },
    {
      key: "concentration",
      title: "How much of this is one customer",
      how: "Total by customer and look at the top three as a share. A business where one customer is most of the revenue has a credit risk and sometimes a going-concern question.",
    },
    {
      key: "round",
      title: "Round-sum invoices",
      how: "Large amounts landing on an exact figure can be advances or adjustments written as sales. A dozen identical round figures in a register of hundreds is worth a question.",
      auto: "round",
    },
    {
      key: "period",
      title: "Everything falls in the period",
      how: "Invoices dated outside the month are either the wrong file or entries that belong in another return. Check the ones near the two ends of the month first.",
      auto: "period",
    },
    {
      key: "place",
      title: "The place of supply and the tax charged",
      how: "An inter-state sale carries integrated tax and a local one carries the two halves. A row with both, or with neither, is wrong whichever way round it is.",
    },
  ],
  bank: [
    {
      key: "reconcile",
      title: "Reconcile the statement with the books",
      how: "Tick the statement against the bank ledger and list what is on one side only. Anything outstanding for months — a cheque issued and never presented — is followed up rather than carried forward again.",
      auto: "balance",
    },
    {
      key: "cash",
      title: "Cash withdrawals",
      how: "Large or frequent cash out of the bank needs a purpose and a record. Look at where it goes in the books, and at the rules on cash payments before accepting it.",
    },
    {
      key: "returns",
      title: "Cheque returns",
      how: "A returned cheque is a customer who did not pay or a supplier who was not paid, and sometimes the start of a dispute. Search the narration for a return and check what happened after each one.",
    },
    {
      key: "dues",
      title: "The statutory dues, and when they were paid",
      how: "Find the tax, provident fund and insurance payments and note the dates. Whether any of them was late is answered against the firm's confirmed due-date rules, not from memory.",
    },
    {
      key: "roundtransfers",
      title: "Round-sum transfers",
      how: "A large round transfer to another party is often a loan rather than a payment, which changes how it is shown and sometimes whether it was allowed.",
      auto: "round",
    },
  ],
  generic: [
    {
      key: "blanks",
      title: "Blank cells in the columns that matter",
      how: "A column with gaps in it makes every total below it wrong by whatever is missing. The profile above counts them.",
    },
    {
      key: "totals",
      title: "Totals by column",
      how: "Add each number column and compare it with whatever the client said the figure was — the totals are in the column profile. That one comparison finds most bad exports.",
    },
  ],
};

/** @param {string} kind */
export function checklistFor(kind) {
  return CHECKLISTS[kind] ?? CHECKLISTS.generic;
}
