/**
 * The page's own alert, and nothing else.
 *
 * Next.js renders `<div role="alert" aria-live="assertive"
 * id="__next-route-announcer__">` on every page to announce navigation, so
 * `getByRole("alert")` matches two elements and Playwright refuses the
 * ambiguity — which is how every spec in this suite failed the first time
 * it was ever run against a database.
 *
 * The announcer is excluded by id rather than by "the one with text in
 * it", because an empty app alert is a thing a test may legitimately wait
 * for.
 *
 * @param {import("@playwright/test").Page} page
 */
export function alertBox(page) {
  return page.locator('[role="alert"]:not(#__next-route-announcer__)');
}

/**
 * Choose the option whose text matches, by its value.
 *
 * `selectOption({ label: /NOI/ })` reads naturally and Playwright refuses
 * it: a label has to be an exact string. The option's value is a database
 * id the test does not know, so the text is matched first and the value
 * read off it — which is what the regex was always trying to say.
 *
 * @param {import("@playwright/test").Locator} select
 * @param {RegExp|string} text
 */
export async function pick(select, text) {
  const option = select.locator("option").filter({ hasText: text }).first();
  await select.selectOption(await option.getAttribute("value"));
}
