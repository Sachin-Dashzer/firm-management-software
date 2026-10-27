// @ts-check

/**
 * Contrast ratios, so the quality bar in spec section 15 can be measured
 * instead of asserted.
 *
 * Small on purpose. It exists for the test that reads the real tokens out
 * of `app/globals.css` and fails if one of them is ever nudged past the
 * WCAG line — which is the only way a contrast promise stays true after
 * the person who made it has moved on.
 */

/** @param {string} hex `#rrggbb` */
export function toRgb(hex) {
  const text = String(hex).trim().replace("#", "");
  const full =
    text.length === 3
      ? text
          .split("")
          .map((c) => c + c)
          .join("")
      : text;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** Relative luminance, per WCAG. */
export function luminance(hex) {
  const [r, g, b] = toRgb(hex).map((value) => {
    const channel = value / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The ratio between two colours, 1 to 21.
 * @param {string} a
 * @param {string} b
 */
export function contrast(a, b) {
  const first = luminance(a);
  const second = luminance(b);
  const light = Math.max(first, second);
  const dark = Math.min(first, second);
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Pull the two themes' token values out of the stylesheet.
 *
 * It reads the file rather than taking a copy of the colours, because a
 * copy is the thing that goes stale.
 *
 * There are three, because dark is written twice: once for the operating
 * system's preference and once for the toggle. Both are returned so both
 * are measured, and so a test can hold them to being the same.
 *
 * @param {string} css
 * @returns {Record<string, Record<string, string>>}
 */
export function parseThemes(css) {
  const light = block(css, /:root\s*\{([\s\S]*?)\}/);
  // the explicit dark theme, the one a user picks with the toggle
  const dark = block(css, /:root\[data-theme="dark"\]\s*\{([\s\S]*?)\}/);
  // the same colours again, for someone who has never touched the toggle
  const darkAuto = block(
    css,
    /:root:not\(\[data-theme="light"\]\)\s*\{([\s\S]*?)\}/,
  );
  return { light, dark, darkAuto };
}

/** @param {string} css @param {RegExp} pattern */
function block(css, pattern) {
  const match = pattern.exec(css);
  if (!match) return {};

  /** @type {Record<string, string>} */
  const tokens = {};
  /** @type {Record<string, string>} */
  const aliases = {};
  for (const line of match[1].split("\n")) {
    const declaration = /--([a-z-]+)\s*:\s*([^;]+);/.exec(line);
    if (!declaration) continue;
    const [, name, value] = declaration;
    const colour = value.trim();
    // only the six-digit colours: the washes carry an alpha and the rest
    // are numbers
    if (/^#[0-9a-f]{6}$/i.test(colour)) {
      tokens[name] = colour;
      continue;
    }
    // An alias — `--brass: var(--carbon)` — is whatever colour it points
    // at, and has to be measured as that colour rather than skipped, or a
    // token can be taken out of this test's sight by pointing it elsewhere.
    const reference = /^var\(\s*--([a-z-]+)\s*\)$/.exec(colour);
    if (reference) aliases[name] = reference[1];
  }
  // ponytail: one hop only. An alias to an alias resolves to nothing and
  // the test reports the token as missing, which is the right failure.
  for (const [name, target] of Object.entries(aliases)) {
    if (tokens[target]) tokens[name] = tokens[target];
  }
  return tokens;
}
