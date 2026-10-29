// @ts-check

/**
 * Choosing a sample, and choosing it the same way twice (P3-30, SA 530).
 *
 * Pure arithmetic. Handed a population and a seed it returns which rows
 * were selected and why; the queries and the saving live in the screen.
 *
 * **The seed is the whole point.** A peer reviewer's question about a
 * sample is never "is twenty-five enough" — it is "show me that this is
 * the sample you actually drew". A selection made with `Math.random()`
 * cannot answer that, so every method here runs off a seeded generator and
 * the seed is stored on the sample. Given the same population and the same
 * seed, the same rows come out, for ever.
 *
 * **What this module deliberately does not do is compute a sample size.**
 * SA 530 gives no formula; a size comes from the firm's own judgement,
 * usually off a table, weighing risk, tolerable misstatement and what
 * other procedures already cover. Deriving "25" from a confidence level
 * would be inventing a professional rule, which `CLAUDE.md` rule 8
 * forbids. So the firm enters the size, and the confidence and tolerable
 * misstatement are **recorded as the reasoning** beside it — exactly the
 * way `materialityBasis` records the reasoning for materiality.
 */

/** The three methods, in the plain words the screen shows. */
export const METHODS = [
  {
    key: "monetary-unit",
    name: "Monetary unit",
    what: "Every rupee has the same chance of being picked, so a large entry is far more likely to be in the sample than a small one. Use it when the worry is overstatement of value.",
  },
  {
    key: "random",
    name: "Random",
    what: "Every entry has the same chance, whatever it is worth. Use it when the worry is whether a control was applied, not how much money is involved.",
  },
  {
    key: "systematic",
    name: "Systematic",
    what: "Count down the list and take every nth entry from a random start. Use it on a list with no pattern of its own — and never on one sorted by amount or by month, because the gap would hide a whole stretch of the year.",
  },
];

export const METHOD_KEYS = METHODS.map((row) => row.key);

/**
 * A seeded generator.
 *
 * mulberry32: thirty-two bits of state, four lines, and the same sequence
 * on every machine and every version of Node — which is the requirement.
 * `Math.random()` is unseeded and so cannot reproduce a selection, and a
 * cryptographic generator is the same problem with more ceremony.
 *
 * @param {number} seed
 * @returns {() => number} the next value in [0, 1)
 */
export function rng(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seed somebody can read out over the phone. */
export function newSeed() {
  return Math.floor(Math.random() * 1_000_000_000);
}

/**
 * Draw the sample.
 *
 * Two stages, and the first is not sampling at all:
 *
 *  1. **Key items are taken whole.** Anything at or above
 *     `keyAbovePaise` is examined 100% and leaves the population — it is
 *     not a sample of those, it is all of them. Doing this first is also
 *     what stops monetary-unit selection from picking one enormous entry
 *     three times.
 *  2. **The rest is sampled** by the chosen method.
 *
 * @param {object} input
 * @param {{ref?: string, party?: string, on?: any, amountPaise: number}[]} input.rows
 * @param {string} input.method one of `METHOD_KEYS`
 * @param {number} input.size how many to draw from the remainder
 * @param {number} input.seed
 * @param {number} [input.keyAbovePaise] 0 means no key-item threshold
 * @returns {{
 *   key: any[], sampled: any[], items: any[],
 *   interval: number, start: number,
 *   populationCount: number, populationPaise: number,
 *   sampledPaise: number, coverage: number|null,
 *   note: string,
 * }}
 */
export function draw({ rows, method, size, seed, keyAbovePaise = 0 }) {
  const population = rows.filter((row) => (row.amountPaise ?? 0) !== 0);
  const populationPaise = population.reduce(
    (sum, row) => sum + Math.abs(row.amountPaise ?? 0),
    0,
  );

  const key = keyAbovePaise
    ? population.filter((row) => Math.abs(row.amountPaise) >= keyAbovePaise)
    : [];
  let rest = keyAbovePaise
    ? population.filter((row) => Math.abs(row.amountPaise) < keyAbovePaise)
    : population;

  let want = Math.max(0, Math.min(Math.trunc(size), rest.length));
  const next = rng(seed);

  /**
   * Monetary unit only: anything worth a whole sampling interval or more
   * is **certain** to be selected, so it is examined in full and taken out
   * of the sample.
   *
   * This is not a refinement, it is the method. Without it a single entry
   * wider than the interval absorbs several hits, they collapse to one
   * row, and the draw silently returns four items when it was asked for
   * twelve — which is the one failure in this feature that would look like
   * a smaller sample rather than like a bug. Promoting changes the
   * remaining value and so the interval, so it repeats until nothing else
   * qualifies; a population of equal amounts settles on the first pass.
   */
  const autoKey = [];
  if (method === "monetary-unit" && want > 0) {
    for (let pass = 0; pass < 50; pass += 1) {
      const left = want - autoKey.length;
      if (left <= 0) break;
      const restPaise = rest.reduce(
        (sum, row) => sum + Math.abs(row.amountPaise),
        0,
      );
      const interval = restPaise / left;
      const big = rest.filter((row) => Math.abs(row.amountPaise) >= interval);
      if (big.length === 0) break;
      autoKey.push(...big);
      rest = rest.filter((row) => Math.abs(row.amountPaise) < interval);
      if (rest.length === 0) break;
    }
    want = Math.max(0, Math.min(want - autoKey.length, rest.length));
  }

  /** @type {any[]} */
  let sampled = [];
  let interval = 0;
  let start = 0;

  if (want === 0) {
    sampled = [];
  } else if (method === "random") {
    /* A seeded Fisher–Yates over the indices: distinct rows, and the same
       rows every time for a given seed. Shuffling indices rather than
       drawing-and-retrying means it terminates even when `want` is the
       whole population. */
    const order = rest.map((_, index) => index);
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(next() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    sampled = order
      .slice(0, want)
      .sort((a, b) => a - b)
      .map((index) => rest[index]);
  } else if (method === "systematic") {
    interval = rest.length / want;
    start = next() * interval;
    const picked = new Set();
    for (let k = 0; k < want; k += 1) {
      picked.add(Math.min(rest.length - 1, Math.floor(start + k * interval)));
    }
    sampled = [...picked].sort((a, b) => a - b).map((index) => rest[index]);
  } else {
    /* Monetary unit (probability proportional to size), drawn
       systematically through the cumulative value: the interval is the
       remaining value over the sample size, the start is somewhere random
       inside the first interval, and each hit selects the row its rupee
       falls in. A row wider than one interval would be hit twice; it is
       counted once, which is why the key-item threshold exists above. */
    const restPaise = rest.reduce(
      (sum, row) => sum + Math.abs(row.amountPaise),
      0,
    );
    interval = restPaise / want;
    start = next() * interval;

    const picked = new Set();
    let cumulative = 0;
    let hit = start;
    for (const [index, row] of rest.entries()) {
      cumulative += Math.abs(row.amountPaise);
      while (hit < cumulative && picked.size < want) {
        picked.add(index);
        hit += interval;
      }
    }
    sampled = [...picked].sort((a, b) => a - b).map((index) => rest[index]);
  }

  /**
   * What will be examined, each row saying whether it is a key item and
   * why. The reason is stored rather than recomputed, because "taken in
   * full because it was over the threshold" and "taken in full because it
   * was worth a whole interval" are different answers to a reviewer, and
   * the second depends on an interval the next draw would change.
   */
  const items = [
    ...key.map((row) => ({
      ...row,
      key: true,
      keyReason: "at or above the key-item threshold",
    })),
    ...autoKey.map((row) => ({
      ...row,
      key: true,
      keyReason: "worth a whole sampling interval, so certain of selection",
    })),
    ...sampled.map((row) => ({ ...row, key: false, keyReason: "" })),
  ];

  const sampledPaise = items.reduce(
    (sum, row) => sum + Math.abs(row.amountPaise),
    0,
  );

  /** The value the drawn sample stands for: key items are not part of it. */
  const sampledFromPaise = rest.reduce(
    (sum, row) => sum + Math.abs(row.amountPaise),
    0,
  );

  return {
    key: [...key, ...autoKey],
    autoKey,
    sampled,
    items,
    interval,
    start,
    populationCount: population.length,
    populationPaise,
    sampledFromPaise,
    sampledPaise,
    coverage: populationPaise
      ? Math.round((sampledPaise / populationPaise) * 100)
      : null,
    note: describe({
      method,
      key,
      autoKey,
      sampled,
      interval,
      keyAbovePaise,
    }),
  };
}

/**
 * How the sample was drawn, in a sentence the file can keep.
 *
 * It is stored, not computed on the way to the screen, because the words
 * have to still be true in three years when the code has moved on.
 */
function describe({ method, key, autoKey, sampled, interval, keyAbovePaise }) {
  const name = METHODS.find((row) => row.key === method)?.name ?? method;
  const parts = [];
  if (key.length) {
    parts.push(
      `${key.length} key ${key.length === 1 ? "item" : "items"} at or above the threshold, examined in full`,
    );
  }
  if (autoKey?.length) {
    parts.push(
      `${autoKey.length} further ${autoKey.length === 1 ? "entry" : "entries"} worth a whole sampling interval, so certain of selection and examined in full`,
    );
  }
  parts.push(`${sampled.length} drawn by ${name.toLowerCase()} selection`);
  if (interval > 0 && method !== "random") {
    parts.push(
      method === "monetary-unit"
        ? `sampling interval ${Math.round(interval / 100).toLocaleString("en-IN")} rupees of value`
        : `every ${interval.toFixed(1)} entries from a random start`,
    );
  }
  if (!keyAbovePaise) parts.push("no key-item threshold set");
  return `${parts.join("; ")}.`;
}

/** Where the vouching has got to. */
export function progress(items, attributeCount) {
  let cleared = 0;
  let exceptions = 0;
  let pending = 0;

  for (const item of items) {
    const marks = item.marks ?? [];
    const answered = marks.filter((mark) => mark === 0 || mark === 1).length;
    if (marks.includes(0)) exceptions += 1;
    else if (answered >= attributeCount && attributeCount > 0) cleared += 1;
    else pending += 1;
  }

  return { cleared, exceptions, pending, total: items.length };
}

/**
 * What the exceptions found say about the population as a whole.
 *
 * **Projected, and labelled as projected.** A sample that found ₹4.85 lakh
 * wrong in 12% of the value is not evidence of ₹4.85 lakh of error — it is
 * evidence of something nearer ₹40 lakh, and that is the figure SA 530 ¶14
 * asks the auditor to compare with tolerable misstatement. The arithmetic
 * is the simple ratio estimate, which is the one every firm uses and the
 * only one that can be explained on a working paper.
 *
 * Key items are excluded from the projection: they were examined in full,
 * so what was found in them is the error, not a sample of it.
 *
 * @param {{marks: any[], amountPaise: number, key?: boolean, errorPaise?: number}[]} items
 * @param {number} populationPaise the sampled population, key items removed
 */
export function projected(items, populationPaise) {
  const sample = items.filter((item) => !item.key);
  const samplePaise = sample.reduce(
    (sum, item) => sum + Math.abs(item.amountPaise ?? 0),
    0,
  );
  const foundPaise = sample
    .filter((item) => (item.marks ?? []).includes(0))
    .reduce(
      (sum, item) => sum + Math.abs(item.errorPaise || item.amountPaise || 0),
      0,
    );

  /* In the key items, what was found is what there is. */
  const keyPaise = items
    .filter((item) => item.key && (item.marks ?? []).includes(0))
    .reduce(
      (sum, item) => sum + Math.abs(item.errorPaise || item.amountPaise || 0),
      0,
    );

  if (!samplePaise) {
    return { foundPaise: foundPaise + keyPaise, projectedPaise: keyPaise };
  }

  return {
    foundPaise: foundPaise + keyPaise,
    projectedPaise:
      keyPaise + Math.round((foundPaise / samplePaise) * populationPaise),
  };
}

/**
 * What comes out of Excel when somebody selects a range and copies it is
 * **tab-separated**, not comma-separated, and that is how a population
 * will actually arrive: nobody exports a CSV to paste four columns.
 *
 * Tabs are not simply swapped for commas, because a party is often
 * "Kumar Packaging, Noida" and that would split it in two. Each field is
 * quoted instead, which is what a CSV writer does, and the ordinary comma
 * parser then reads it correctly.
 *
 * Text with no tab in its first line is left exactly as it is.
 *
 * @param {string} text
 * @returns {string}
 */
export function csvFromPaste(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  if (!lines[0]?.includes("\t")) return text;

  return lines
    .map((line) =>
      line
        .split("\t")
        .map((field) => `"${field.trim().replace(/"/g, '""')}"`)
        .join(","),
    )
    .join("\n");
}

/**
 * Reading a pasted or uploaded population.
 *
 * Four columns, named rather than positional, because a ledger dump out
 * of Tally, Busy or Zoho never has them in the same order: a reference, a
 * party, a date and an amount. Anything else on the row is ignored rather
 * than refused — a trial-balance export carries half a dozen columns
 * nobody needs here.
 *
 * Every refused row is reported with its line number. A population that
 * silently loses nine rows is a sample drawn from the wrong population,
 * which is the one mistake in this whole feature that nobody would catch.
 *
 * @param {Record<string, string>[]} objects from `parseCSVObjects`
 * @returns {{rows: any[], refused: {line: number, why: string}[]}}
 */
export function readPopulation(objects) {
  /** @type {any[]} */
  const rows = [];
  /** @type {{line: number, why: string}[]} */
  const refused = [];

  objects.forEach((raw, index) => {
    const line = index + 2; // the header is line 1
    const pick = (...names) => {
      for (const name of names) {
        const value = raw[name];
        if (value !== undefined && String(value).trim()) {
          return String(value).trim();
        }
      }
      return "";
    };

    const amountText = pick(
      "amount",
      "value",
      "debit",
      "credit",
      "amountrs",
      "grossamount",
      "invoiceamount",
    );
    if (!amountText) {
      refused.push({ line, why: "no amount" });
      return;
    }

    const amount = Number(amountText.replace(/[₹,\s]/g, ""));
    if (!Number.isFinite(amount) || amount === 0) {
      refused.push({ line, why: `"${amountText}" is not an amount` });
      return;
    }

    const party = pick(
      "party",
      "supplier",
      "customer",
      "name",
      "particulars",
      "ledger",
      "narration",
    );
    if (!party) {
      refused.push({ line, why: "no party or particulars" });
      return;
    }

    rows.push({
      ref: pick("ref", "reference", "voucherno", "vchno", "invoiceno", "no"),
      party,
      on: pick("date", "on", "vchdate", "voucherdate", "invoicedate"),
      amountPaise: Math.round(amount * 100),
    });
  });

  return { rows, refused };
}
