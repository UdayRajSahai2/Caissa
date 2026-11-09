import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("landing page has no serious accessibility violations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("See where your games are really lost.");
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
  expect(blocking).toEqual([]);
});

test("an invalid username is rejected in the page", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Chess.com username").fill("no");
  await page.getByRole("button", { name: "Analyze my games" }).click();
  await expect(page.getByRole("alert")).toContainText("3 to 25 characters");
});

test("accessibility statement is its own page", async ({ page }) => {
  await page.goto("/accessibility");
  await expect(page).toHaveTitle(/Accessibility statement — Caissa/);
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
  expect(blocking).toEqual([]);
});

for (const path of ["/learn", "/learn/forks", "/learn/opposition"]) {
  test(`${path} has no serious accessibility violations`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
    expect(blocking).toEqual([]);
  });
}

test("a player page asks a signed-out visitor to sign in and never echoes the address", async ({ page }) => {
  await page.goto("/player/%3Cscript%3E");
  await expect(page).toHaveURL(/\/signin\?callbackUrl=/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in to Caissa");
  await expect(page.locator("body")).not.toContainText("<script>");
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
  expect(blocking).toEqual([]);
});
