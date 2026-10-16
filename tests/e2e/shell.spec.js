import { test, expect } from "@playwright/test";

test("the app opens on Today", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/today$/);
  await expect(
    page.getByRole("heading", { name: "Today", level: 1 }),
  ).toBeVisible();
  for (const column of [
    "Due today",
    "Waiting on clients",
    "Awaiting my review",
  ]) {
    await expect(page.getByRole("heading", { name: column })).toBeVisible();
  }
});

test("navigation and the branch switcher are reachable", async ({ page }) => {
  await page.goto("/today");
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  await expect(page.getByLabel("Branch")).toBeVisible();
});

test("the theme toggle switches and survives a reload", async ({ page }) => {
  await page.goto("/today");
  const html = page.locator("html");
  const before = await html.getAttribute("data-theme");

  await page.getByRole("button", { name: /Switch to .* theme/ }).click();
  const after = await html.getAttribute("data-theme");
  expect(after).not.toBe(before);

  await page.reload();
  await expect(html).toHaveAttribute("data-theme", after);
});

test("the density toggle switches and survives a reload", async ({ page }) => {
  await page.goto("/today");
  const html = page.locator("html");

  await page
    .getByRole("button", { name: /Switch to compact row density/ })
    .click();
  await expect(html).toHaveAttribute("data-density", "compact");

  await page.reload();
  await expect(html).toHaveAttribute("data-density", "compact");
});

test("the shell works with the keyboard alone", async ({ page }) => {
  await page.goto("/today");
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
});
