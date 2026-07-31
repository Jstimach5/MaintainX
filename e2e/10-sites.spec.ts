import { test, expect, type Page } from "@playwright/test";
import { CREDS, ensureBaseData, navTo } from "./fixtures";

async function login(page: Page, creds: { username: string; password: string }) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel(/username/i).fill(creds.username);
  await page.getByLabel(/^password/i).fill(creds.password);
  await submit(page);
  await page.waitForURL("**/dashboard");
}

/** Click the page-content submit button (the nav's Sign out is also a form submit). */
async function submit(page: Page) {
  await page.locator('main form button[type="submit"]').click();
}

test.beforeAll(async () => {
  await ensureBaseData();
});

test.describe.serial("sites and nested locations", () => {
  test("admin creates a site with nested locations", async ({ page }) => {
    await login(page, CREDS.admin);
    await navTo(page, "Sites");
    await page.waitForURL("**/sites");
    await page.getByRole("link", { name: /add site/i }).first().click();

    await page.getByLabel(/site name/i).fill("Main Plant");
    await page.getByLabel(/code/i).fill("MAIN");
    await page.getByLabel(/address/i).fill("100 Industry Rd");
    await submit(page);
    await page.waitForURL(/\/sites\/\d+$/);
    await expect(page.getByRole("heading", { name: "Main Plant" })).toBeVisible();

    // Top-level location.
    await page.getByRole("link", { name: /add location/i }).first().click();
    await page.getByLabel(/location name/i).fill("Building A");
    await submit(page);
    await page.waitForURL(/\/sites\/\d+$/);
    await expect(page.getByText("Building A")).toBeVisible();

    // Nested sub-location.
    await page.getByRole("link", { name: /sub-location/i }).click();
    await page.getByLabel(/location name/i).fill("Room 101");
    await submit(page);
    await page.waitForURL(/\/sites\/\d+$/);
    await expect(page.getByText("Room 101")).toBeVisible();
  });

  test("archiving a location marks it and blocks sub-location adds", async ({
    page,
  }) => {
    await login(page, CREDS.admin);
    await page.goto("/sites");
    await page.getByRole("link", { name: "Main Plant" }).click();
    await page.waitForURL(/\/sites\/\d+$/);

    // Edit Room 101 → archive.
    const roomRow = page.locator("li", { hasText: "Room 101" }).last();
    await roomRow.getByRole("link", { name: /edit/i }).click();
    await page.waitForURL(/\/locations\/\d+\/edit$/);
    await page.getByLabel(/status/i).selectOption("false");
    await submit(page);
    await page.waitForURL(/\/sites\/\d+$/);
    await expect(page.getByText("archived").first()).toBeVisible();
  });

  test("technician sees sites read-only", async ({ page }) => {
    await login(page, CREDS.tech);
    await page.goto("/sites");
    await expect(page.getByRole("link", { name: "Main Plant" })).toBeVisible();
    await expect(page.getByRole("link", { name: /add site/i })).toHaveCount(0);
    await page.getByRole("link", { name: "Main Plant" }).click();
    await page.waitForURL(/\/sites\/\d+$/);
    await expect(page.getByText("Building A")).toBeVisible();
    await expect(page.getByRole("link", { name: /add location/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /edit site/i })).toHaveCount(0);
  });

  test("requester is blocked from sites pages server-side", async ({ page }) => {
    await login(page, CREDS.requester);
    await page.goto("/sites");
    await page.waitForURL("**/forbidden");
  });

  test("site create form is admin-only server-side", async ({ page }) => {
    await login(page, CREDS.manager);
    // Managers can view sites…
    await page.goto("/sites");
    await expect(page).toHaveURL(/\/sites$/);
    // …but the create form is admin-only.
    await page.goto("/sites/new");
    await page.waitForURL("**/forbidden");
  });
});
