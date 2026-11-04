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

/**
 * Choose from a `components/ui/Combobox` — the dropdowns you type into
 * (D109): the client and the service on /engagements/new.
 *
 * It is a real combobox over a listbox, not a select, so there is nothing
 * to `selectOption`: type enough to narrow the list, then click the
 * option. The id it posts is a hidden input the test never has to know
 * about.
 *
 * @param {import("@playwright/test").Page} page
 * @param {string} label the field's own label, e.g. "Client"
 * @param {RegExp|string} text what to type, and what the option says
 */
/**
 * Choose the client on /invoices/new, which is a searchable list of the
 * clients with work waiting rather than a dropdown (02-11-2026).
 *
 * The search box reaches every client, including one with nothing
 * waiting, which is what a billing test usually needs.
 *
 * @param {import("@playwright/test").Page} page
 * @param {string} name
 */
export async function chooseClient(page, name) {
  await page.getByLabel("Any client, by name or code").fill(name);
  await page.getByRole("button").filter({ hasText: name }).first().click();
}

export async function pickFrom(page, label, text) {
  const box = page.getByLabel(label).first();
  await box.click();
  await box.fill(text instanceof RegExp ? text.source : String(text));
  await page.getByRole("option").filter({ hasText: text }).first().click();
}
