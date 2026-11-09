import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

/**
 * The working lists have to be visible (QA 09-11-2026, #5 and #6).
 *
 * On a 1366×630 laptop the head, the tiles and the filters filled the
 * canvas and the list was left with 0px on Potentials and 35px on To-dos.
 * The cause was `md:h-full`: the fixed-canvas layout asked whether the
 * screen was wide, never whether it was tall.
 *
 * This is a CSS rule, so what can be checked here is that the rule is
 * still written down — which is worth doing, because the way it comes
 * back is somebody adding `md:h-full` to a new screen without knowing why
 * the height is in the query. Measured in a browser at 1366×630,
 * 1440×900 and 400×800 when it was fixed: the list is the whole page on a
 * short laptop, a scrolling region under fixed filters on a tall one, and
 * unchanged on a phone.
 */

/** Both conditions, as Tailwind spells them. */
const CANVAS = "[@media(min-width:48rem)_and_(min-height:44rem)]";

const screen = readFileSync("components/ui/Screen.jsx", "utf8");

describe("the fixed-canvas layout", () => {
  it("asks for height as well as width before it divides the canvas", () => {
    expect(screen).toContain(`${CANVAS}:h-full`);
  });

  it("no longer clamps on width alone", () => {
    // `md:h-full` is the whole bug: a 630px-tall laptop is "md"
    expect(screen).not.toContain("md:h-full");
  });

  it("scrolls the region only when the canvas is being divided", () => {
    expect(screen).toContain(`${CANVAS}:overflow-auto`);
    expect(screen).not.toContain("md:overflow-auto");
  });

  it("puts a floor under the list so it cannot be squeezed to nothing", () => {
    expect(screen).toContain(`${CANVAS}:min-h-56`);
    // and keeps min-h-0, without which a flex child will not shrink at all
    expect(screen).toContain("min-h-0 flex-1");
  });
});

describe("the screens built on it", () => {
  /** Everything that lays itself out with Screen, from git. */
  const users = execFileSync(
    "git",
    ["grep", "-l", 'from "@/components/ui/Screen"', "--", "app"],
    { encoding: "utf8" },
  )
    .split("\n")
    .filter(Boolean);

  it("is a list worth checking", () => {
    expect(users.length).toBeGreaterThan(4);
  });

  it("none of them clamps its own height on width alone", () => {
    for (const file of users) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/\bmd:h-full\b/);
      // a hand-rolled scroll region needs the same floor, or it collapses
      // the same way — see practice/notices, which has one
      if (/\bmd:overflow-y-auto\b/.test(text)) {
        expect(text, `${file}: scrolls on width alone`).toContain(CANVAS);
      }
    }
  });
});
