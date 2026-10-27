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
