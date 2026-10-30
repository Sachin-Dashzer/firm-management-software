import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * The contrast the tokens promise, kept by the markup (P3-21b).
 *
 * `tests/contrast.test.js` already proved the pair was right: it measures
 * `--on-carbon` against `--carbon` in both themes and asserts the two
 * themes do not share a value, with a comment saying in so many words that
 * "the dark theme's is a pale blue, so white on it would fail".
 *
 * It was right and it did not help. **101 places in the markup wrote
 * `text-white` instead of `text-on-carbon`**, so every primary button in
 * the application sat at 2.8:1 in the dark theme, and the token test could
 * not see it because it looks at tokens and not at class names.
 *
 * It was found by starting the production server and pointing a real
 * browser at the login page — the first time anything in this repository
 * had been rendered. So this file exists to make the next instance of it
 * cheap: the rule is now about the markup, where the mistake lives.
 */

const ROOTS = ["app", "components"];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      walk(full, out);
    } else if (/\.jsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Every line of every screen, with where it came from. */
function allLines() {
  const lines = [];
  for (const root of ROOTS) {
    for (const file of walk(root)) {
      fs.readFileSync(file, "utf8")
        .split("\n")
        .forEach((text, index) => {
          lines.push({ file, line: index + 1, text });
        });
    }
  }
  return lines;
}

const LINES = allLines();

describe("a colour on a themed ground comes from the token, not from a literal", () => {
  /**
   * The pairs that flip between the themes. A literal on either side of one
   * of these is right in one theme and wrong in the other, and the one it
   * is wrong in is the one nobody looks at.
   */
  const BANNED = [
    {
      ground: /bg-carbon\b/,
      literal: /\btext-white\b/,
      use: "text-on-carbon",
      why: "the accent is dark blue in the light theme and pale blue in the dark one, so white is 2.8:1 on half of them",
    },
    {
      ground: /bg-ink\b/,
      literal: /\btext-white\b/,
      use: "text-paper or text-surface",
      why: "the ink is near-black in the light theme and near-white in the dark one",
    },
    {
      ground: /bg-surface\b|bg-paper\b/,
      literal: /\btext-black\b/,
      use: "text-ink",
      why: "the surface is white in the light theme and near-black in the dark one",
    },
  ];

  for (const rule of BANNED) {
    it(`never writes ${rule.literal.source} on ${rule.ground.source}`, () => {
      const offenders = LINES.filter(
        (row) => rule.ground.test(row.text) && rule.literal.test(row.text),
      ).map((row) => `${row.file}:${row.line}`);

      expect(
        offenders,
        `${offenders.length} line(s) hardcode a colour on a themed ground. Use ${rule.use}: ${rule.why}.\n${offenders.slice(0, 10).join("\n")}`,
      ).toEqual([]);
    });
  }
});

describe("no screen reaches past the tokens for a colour (P3-34 phase 2)", () => {
  /**
   * The four pairings above catch a literal written on a themed ground.
   * They did not catch a literal written on its own — and the rail was
   * full of them: `bg-indigo-50 text-indigo-700 ring-indigo-100` on the
   * avatar, `bg-rose-500` and `bg-amber-500` on the compact dots,
   * `bg-rose-50 text-rose-600` and `bg-amber-50 text-amber-700` on the
   * badges, `ring-white` around a dot. Every one of them is a fixed
   * colour on a surface that inverts between the themes, which is the
   * same bug the pairings above describe, arrived at from the other side.
   *
   * Tailwind's own palette is the thing being banned, not colour: this
   * application has `redpen`, `waiting`, `filed` and `carbon` for exactly
   * these jobs, and they are measured.
   */
  const PALETTE =
    /\b(?:bg|text|border|ring|fill|stroke|from|to|via|decoration|outline|shadow|accent|caret|divide|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|\d00)\b/;

  it("never names a colour from Tailwind's palette", () => {
    const offenders = LINES.filter((row) => PALETTE.test(row.text)).map(
      (row) => `${row.file}:${row.line}  ${row.text.trim().slice(0, 90)}`,
    );

    expect(
      offenders,
      `${offenders.length} line(s) use a fixed colour that cannot follow the theme. Use the tokens: redpen, waiting, filed, carbon, ink, faint, rule, sunk, surface, paper.\n${offenders.slice(0, 12).join("\n")}`,
    ).toEqual([]);
  });

  it("never rings or fills with plain white or black", () => {
    // `ring-white` on a dot is invisible on a dark rail; the ring wants
    // the surface it is cut out of, which is `ring-surface`
    const offenders = LINES.filter((row) =>
      /\b(?:ring|border|divide|outline)-(?:white|black)\b/.test(row.text),
    ).map((row) => `${row.file}:${row.line}`);

    expect(offenders).toEqual([]);
  });
});

describe("the prototype's four radii stay four", () => {
  /**
   * One token was doing all four jobs before P3-21b, which is how a chip
   * came to have a card's corner. Each class now means one shape, and a
   * line that asks for two of them has had a sweep run over it twice.
   */
  const RADII = [
    "rounded-ledger",
    "rounded-control",
    "rounded-table",
    "rounded-chip",
  ];

  it("never puts two of them on one element", () => {
    const offenders = LINES.filter(
      (row) => RADII.filter((name) => row.text.includes(name)).length > 1,
    ).map((row) => `${row.file}:${row.line}`);

    expect(offenders).toEqual([]);
  });

  it("still uses every one of them, so none has quietly been swept away", () => {
    for (const name of RADII) {
      const count = LINES.filter((row) => row.text.includes(name)).length;
      expect(count, `${name} is unused`).toBeGreaterThan(0);
    }
  });

  it("keeps chips on the pill and cards on the card radius", () => {
    // a chip is `px-2 py-0.5` in this application; a card is `p-3`/`p-4`
    const chipsWrong = LINES.filter(
      (row) => /py-0\.5/.test(row.text) && row.text.includes("rounded-ledger"),
    ).map((row) => `${row.file}:${row.line}`);
    expect(chipsWrong).toEqual([]);
  });
});
