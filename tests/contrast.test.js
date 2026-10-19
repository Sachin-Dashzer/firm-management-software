import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { contrast, parseThemes } from "../lib/contrast.js";

/**
 * WCAG 2.2 AA contrast, measured rather than asserted (spec section 15's
 * quality bars).
 *
 * This reads the real token values out of `app/globals.css` and computes
 * the ratios, so it fails if somebody later nudges a colour past the line.
 * A note in a document saying "we checked" would not do that.
 *
 * The bars: 4.5:1 for body text, 3:1 for large text and for the boundary
 * of a control or a focus ring.
 */

const css = readFileSync(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);
const themes = parseThemes(css);

const BODY = 4.5;
const LARGE = 3;

describe.each(Object.keys(themes))("%s theme", (name) => {
  const t = themes[name];

  it("has all ten tokens", () => {
    for (const token of [
      "paper",
      "surface",
      "ink",
      "ink-muted",
      "rule",
      "carbon",
      "brass",
      "filed",
      "waiting",
      "redpen",
    ]) {
      expect(t[token], `${token} in ${name}`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("reads body text against both backgrounds", () => {
    expect(contrast(t.ink, t.paper)).toBeGreaterThanOrEqual(BODY);
    expect(contrast(t.ink, t.surface)).toBeGreaterThanOrEqual(BODY);
  });

  it("reads muted labels against both backgrounds", () => {
    expect(contrast(t["ink-muted"], t.paper)).toBeGreaterThanOrEqual(BODY);
    expect(contrast(t["ink-muted"], t.surface)).toBeGreaterThanOrEqual(BODY);
  });

  it("reads links and primary buttons", () => {
    // carbon on paper is a link; white on carbon is the primary button
    expect(contrast(t.carbon, t.paper)).toBeGreaterThanOrEqual(BODY);
    expect(contrast(t.carbon, t.surface)).toBeGreaterThanOrEqual(BODY);
  });

  it("reads every status colour as text on a surface", () => {
    for (const token of ["filed", "waiting", "redpen"]) {
      expect(
        contrast(t[token], t.surface),
        `${token} on surface`,
      ).toBeGreaterThanOrEqual(BODY);
      expect(
        contrast(t[token], t.paper),
        `${token} on paper`,
      ).toBeGreaterThanOrEqual(BODY);
    }
  });

  it("shows the focus ring against both backgrounds", () => {
    // brass is a boundary, not text: 3:1 is the bar it has to clear
    expect(contrast(t.brass, t.paper)).toBeGreaterThanOrEqual(LARGE);
    expect(contrast(t.brass, t.surface)).toBeGreaterThanOrEqual(LARGE);
  });

  it("has a brass that can be read as text, for the places it is", () => {
    expect(contrast(t["brass-ink"], t.paper)).toBeGreaterThanOrEqual(BODY);
    expect(contrast(t["brass-ink"], t.surface)).toBeGreaterThanOrEqual(BODY);
  });

  it("keeps a status colour legible on its own wash", () => {
    // a chip is its colour on a 12% tint of itself over the surface
    for (const token of ["filed", "waiting", "redpen"]) {
      const wash = over(t[token], t.surface, 0.12);
      expect(contrast(t[token], wash), `${token} chip`).toBeGreaterThanOrEqual(
        BODY,
      );
    }
  });
});

describe("the white on primary buttons", () => {
  it("is legible in both themes, or the button is not white-on-carbon", () => {
    // the light theme's carbon is dark enough for white text; the dark
    // theme's is a pale blue, so a white label on it would fail — this is
    // the test that would catch a button styled the same way in both
    expect(contrast("#ffffff", themes.light.carbon)).toBeGreaterThanOrEqual(
      BODY,
    );
    expect(contrast("#1b2233", themes.dark.carbon)).toBeGreaterThanOrEqual(
      BODY,
    );
  });
});

/** A colour laid over a background at some opacity. */
function over(colour, background, alpha) {
  const hex = (value) => parseInt(value, 16);
  const parts = (text) => [
    hex(text.slice(1, 3)),
    hex(text.slice(3, 5)),
    hex(text.slice(5, 7)),
  ];
  const [r1, g1, b1] = parts(colour);
  const [r2, g2, b2] = parts(background);
  const mix = (a, b) => Math.round(a * alpha + b * (1 - alpha));
  const pad = (value) => value.toString(16).padStart(2, "0");
  return `#${pad(mix(r1, r2))}${pad(mix(g1, g2))}${pad(mix(b1, b2))}`;
}
