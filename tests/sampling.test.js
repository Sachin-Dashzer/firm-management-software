import { describe, expect, it } from "vitest";
import {
  draw,
  METHOD_KEYS,
  progress,
  projected,
  readPopulation,
  rng,
  csvFromPaste,
} from "../lib/practice/sampling.js";
import { parseCSVObjects } from "../lib/csv.js";

/**
 * Sampling (P3-30, SA 530).
 *
 * The property that matters is **reproducibility**: the same population
 * and the same seed give the same rows, because the only question a peer
 * reviewer asks about a sample is whether it is the one that was drawn.
 * Everything else here is about not quietly losing rows.
 */

/** A population with a long tail and three big entries. */
const population = Array.from({ length: 60 }, (_, index) => ({
  ref: `V-${index + 1}`,
  party: `Supplier ${index + 1}`,
  amountPaise: (index < 3 ? 900_000 : 1_000 + index * 37) * 100,
}));

describe("the generator", () => {
  it("gives the same sequence for the same seed, and a different one otherwise", () => {
    const a = Array.from({ length: 5 }, rng(12345));
    const b = Array.from({ length: 5 }, rng(12345));
    const c = Array.from({ length: 5 }, rng(12346));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("stays inside [0, 1)", () => {
    const next = rng(7);
    for (let i = 0; i < 500; i += 1) {
      const value = next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe.each(METHOD_KEYS)("drawing by %s", (method) => {
  const options = { rows: population, method, size: 12, seed: 4242 };

  it("ends up examining the number asked for", () => {
    /* `items`, not `sampled`: monetary unit promotes anything worth a
       whole interval to a key item, and those are examined too. Twelve
       entries get looked at either way, which is what was asked. */
    expect(draw(options).items).toHaveLength(12);
  });

  it("draws distinct rows", () => {
    const refs = draw(options).items.map((row) => row.ref);
    expect(new Set(refs).size).toBe(refs.length);
  });

  it("draws the same rows again from the same seed", () => {
    expect(draw(options).items).toEqual(draw(options).items);
  });

  it("draws different rows from a different seed", () => {
    const a = draw(options).items.map((row) => row.ref);
    const b = draw({ ...options, seed: 99 }).items.map((row) => row.ref);
    expect(a).not.toEqual(b);
  });

  it("never asks for more than there is", () => {
    const small = draw({ ...options, size: 500 });
    expect(small.items.length).toBeLessThanOrEqual(population.length);
  });

  it("draws nothing when nothing is asked for", () => {
    expect(draw({ ...options, size: 0 }).items).toEqual([]);
  });
});

describe("key items", () => {
  const result = draw({
    rows: population,
    method: "monetary-unit",
    size: 10,
    seed: 1,
    keyAbovePaise: 500_000 * 100,
  });

  it("are taken whole and leave the population", () => {
    expect(result.key).toHaveLength(3);
    /* Nothing above the threshold may also appear in the drawn sample —
       otherwise the same entry is counted twice. */
    for (const row of result.sampled) {
      expect(row.amountPaise).toBeLessThan(500_000 * 100);
    }
  });

  it("are part of what was examined", () => {
    expect(result.items).toHaveLength(13);
  });

  it("are said plainly in the note", () => {
    expect(result.note).toMatch(/3 key items.*examined in full/);
  });
});

describe("monetary unit selection", () => {
  it("favours the large entries", () => {
    /* Two entries carry almost all the value, so a value-weighted draw
       must find them and an unweighted one usually will not. */
    const skewed = [
      { ref: "big-1", party: "A", amountPaise: 50_000_00 },
      { ref: "big-2", party: "B", amountPaise: 50_000_00 },
      ...Array.from({ length: 200 }, (_, i) => ({
        ref: `small-${i}`,
        party: "C",
        amountPaise: 100,
      })),
    ];
    const value = draw({
      rows: skewed,
      method: "monetary-unit",
      size: 4,
      seed: 11,
    }).items.map((row) => row.ref);
    expect(value).toContain("big-1");
    expect(value).toContain("big-2");
  });

  it("promotes an entry worth a whole interval, rather than losing the hits", () => {
    /* Without the promotion the two large entries absorb several hits
       each, the hits collapse to one row apiece, and a draw asked for
       four returns two. */
    const skewed = [
      { ref: "big-1", party: "A", amountPaise: 50_000_00 },
      { ref: "big-2", party: "B", amountPaise: 50_000_00 },
      ...Array.from({ length: 200 }, (_, i) => ({
        ref: `small-${i}`,
        party: "C",
        amountPaise: 100,
      })),
    ];
    const result = draw({
      rows: skewed,
      method: "monetary-unit",
      size: 4,
      seed: 11,
    });
    expect(result.autoKey.map((row) => row.ref)).toEqual(["big-1", "big-2"]);
    expect(result.items).toHaveLength(4);
    expect(result.note).toMatch(/whole sampling interval/);
  });

  it("reports the interval and covers most of the value", () => {
    const result = draw({
      rows: population,
      method: "monetary-unit",
      size: 10,
      seed: 3,
    });
    expect(result.interval).toBeGreaterThan(0);
    expect(result.coverage).toBeGreaterThan(0);
    expect(result.coverage).toBeLessThanOrEqual(100);
  });
});

describe("the population", () => {
  it("ignores zero-value rows rather than sampling them", () => {
    const result = draw({
      rows: [
        { ref: "a", party: "A", amountPaise: 1000 },
        { ref: "b", party: "B", amountPaise: 0 },
      ],
      method: "random",
      size: 2,
      seed: 1,
    });
    expect(result.populationCount).toBe(1);
  });

  it("totals the value it was given", () => {
    const result = draw({
      rows: population,
      method: "random",
      size: 1,
      seed: 1,
    });
    expect(result.populationPaise).toBe(
      population.reduce((sum, row) => sum + row.amountPaise, 0),
    );
  });
});

describe("progress through the grid", () => {
  const attributes = 3;

  it("counts a row with every attribute ticked as cleared", () => {
    expect(progress([{ marks: [1, 1, 1] }], attributes)).toMatchObject({
      cleared: 1,
      exceptions: 0,
      pending: 0,
    });
  });

  it("counts a row with any cross as an exception, finished or not", () => {
    expect(progress([{ marks: [1, 0, null] }], attributes)).toMatchObject({
      exceptions: 1,
      cleared: 0,
      pending: 0,
    });
  });

  it("counts a half-done row as pending", () => {
    expect(progress([{ marks: [1, null, null] }], attributes)).toMatchObject({
      pending: 1,
      cleared: 0,
    });
  });
});

describe("projecting what was found", () => {
  it("scales the error up to the population it came from", () => {
    /* ₹1,000 of error in a ₹10,000 sample of a ₹1,00,000 population
       projects to ₹10,000 — the ratio estimate SA 530 asks for. */
    const result = projected(
      [
        { marks: [0], amountPaise: 100_000, errorPaise: 100_000 },
        { marks: [1], amountPaise: 900_000 },
      ],
      10_000_000,
    );
    expect(result.foundPaise).toBe(100_000);
    expect(result.projectedPaise).toBe(1_000_000);
  });

  it("does not project a key item, because it was examined in full", () => {
    const result = projected(
      [{ key: true, marks: [0], amountPaise: 500_000 }],
      10_000_000,
    );
    expect(result.foundPaise).toBe(500_000);
    expect(result.projectedPaise).toBe(500_000);
  });

  it("projects nothing when nothing was found", () => {
    const result = projected([{ marks: [1], amountPaise: 1000 }], 100_000);
    expect(result).toEqual({ foundPaise: 0, projectedPaise: 0 });
  });
});

describe("reading a pasted population", () => {
  it("finds the columns whatever they are called", () => {
    const { rows, refused } = readPopulation([
      {
        vchno: "PV-1",
        supplier: "Kumar Packaging",
        vchdate: "04-04-2026",
        amount: "4,85,000.00",
      },
      {
        invoiceno: "B-2",
        particulars: "Sharma Steel",
        date: "",
        value: "₹1200",
      },
    ]);
    expect(refused).toEqual([]);
    expect(rows[0]).toEqual({
      ref: "PV-1",
      party: "Kumar Packaging",
      on: "04-04-2026",
      amountPaise: 48_500_000,
    });
    expect(rows[1].amountPaise).toBe(120_000);
  });

  it("refuses a row and says which line, rather than dropping it", () => {
    const { rows, refused } = readPopulation([
      { party: "A", amount: "100" },
      { party: "B", amount: "" },
      { party: "", amount: "100" },
      { party: "D", amount: "n/a" },
    ]);
    expect(rows).toHaveLength(1);
    expect(refused).toEqual([
      { line: 3, why: "no amount" },
      { line: 4, why: "no party or particulars" },
      { line: 5, why: '"n/a" is not an amount' },
    ]);
  });
});

describe("what Excel actually pastes", () => {
  it("reads a tab-separated paste without splitting a party on its comma", () => {
    const pasted = [
      "Voucher no\tParty\tDate\tAmount",
      "PV-1\tKumar Packaging, Noida\t04-04-2026\t485000",
    ].join("\n");

    const { rows, refused } = readPopulation(
      parseCSVObjects(csvFromPaste(pasted)).rows,
    );
    expect(refused).toEqual([]);
    expect(rows[0].party).toBe("Kumar Packaging, Noida");
    expect(rows[0].amountPaise).toBe(48_500_000);
  });

  it("leaves comma-separated text alone", () => {
    const text = "party,amount\nA,100";
    expect(csvFromPaste(text)).toBe(text);
  });
});
