import { test, expect } from "@playwright/test";

/**
 * The sign-in gate. These run without a database, because nothing here gets
 * as far as a query.
 */

test("a signed-out visitor is sent to the login page", async ({ page }) => {
  await page.goto("/today");
  await expect(page).toHaveURL(/\/login/);
  await expect(
    page.getByRole("heading", { name: "PHMG & Associates" }),
  ).toBeVisible();
});

test("the login page remembers where you were going", async ({ page }) => {
  await page.goto("/settings/users");
  await expect(page).toHaveURL(/\/login\?next=%2Fsettings%2Fusers/);
});

test("sign-in asks for the password before the code", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  // the 6-digit code only appears after the password is accepted
  await expect(page.getByLabel("6-digit code")).toBeHidden();
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
});

test("the login form works with the keyboard alone", async ({ page }) => {
  await page.goto("/login");
  // the cursor starts in the email box, so typing can begin straight away
  await expect(page.getByLabel("Email")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Password")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Continue" })).toBeFocused();
});
