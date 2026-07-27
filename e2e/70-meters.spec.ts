import { test, expect, type Page } from "@playwright/test";
import { CREDS, ensureBaseData } from "./fixtures";

async function login(page: Page, creds: { username: string; password: string }) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  if (!page.url().includes("/login")) {
    await page.getByRole("button", { name: /sign out/i }).click();
    await page.waitForURL("**/login");
    await page.waitForLoadState("networkidle");
  }
  await page.getByLabel(/username/i).fill(creds.username);
  await page.getByLabel(/^password/i).fill(creds.password);
  await submit(page);
  await page.waitForURL("**/dashboard");
}

async function submit(page: Page) {
  await page.locator('main form button[type="submit"]').first().click();
}

test.beforeAll(async () => {
  await ensureBaseData();
});

test.describe.serial("meters — Scenario C", () => {
  test("manager creates a meter and a threshold trigger", async ({ page }) => {
    await login(page, CREDS.manager);
    await page.getByRole("link", { name: /^meters$/i }).click();
    await page.waitForURL("**/meters");
    await page.getByRole("link", { name: /add meter/i }).first().click();

    await page.getByLabel(/meter name/i).fill("Compressor run hours");
    await page.getByLabel(/^unit/i).fill("hours");
    const assetOptions = await page
      .getByLabel(/^asset/i)
      .locator("option")
      .allTextContents();
    const target =
      assetOptions.find((o) => o.includes("Air Compressor")) ?? assetOptions[1];
    await page.getByLabel(/^asset/i).selectOption({ label: target });
    await submit(page);
    await page.waitForURL(/\/meters\/\d+$/);

    // Add threshold trigger at 500 hours.
    await page.getByRole("button", { name: /add trigger/i }).click();
    await page.getByLabel(/trigger name/i).fill("500h inspection");
    await page.getByLabel(/fire when reading reaches/i).fill("500");
    await page.getByLabel(/work-order title/i).fill("Inspect compressor at 500h");
    await page.getByRole("button", { name: /create trigger/i }).click();
    await page.waitForURL(/\/meters\/\d+$/);
    await expect(page.getByText("500h inspection")).toBeVisible();
  });

  test("readings below the threshold create no work order", async ({ page }) => {
    await login(page, CREDS.tech);
    await page.goto("/meters");
    await page.getByRole("link", { name: /Compressor run hours/ }).click();
    await page.waitForURL(/\/meters\/\d+$/);

    await page.getByLabel(/new reading/i).fill("300");
    await page.getByRole("button", { name: /save reading/i }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/300 hours/).first()).toBeVisible();

    await page.goto("/work-orders");
    await expect(
      page.getByRole("link", { name: /Inspect compressor at 500h/ }),
    ).toHaveCount(0);
  });

  test("a qualifying reading creates exactly one WO; monotonic guard works", async ({
    page,
  }) => {
    await login(page, CREDS.tech);
    await page.goto("/meters");
    await page.getByRole("link", { name: /Compressor run hours/ }).click();
    await page.waitForURL(/\/meters\/\d+$/);

    // Decreasing reading rejected.
    await page.getByLabel(/new reading/i).fill("250");
    await page.getByRole("button", { name: /save reading/i }).click();
    await expect(page.getByTestId("form-error")).toContainText(/only counts up/i);

    // Crossing reading fires the trigger.
    await page.getByLabel(/new reading/i).fill("510");
    await page.getByRole("button", { name: /save reading/i }).click();
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("link", { name: /Inspect compressor at 500h/ }),
    ).toBeVisible();

    // Exactly one WO; a further reading above threshold does not re-fire.
    await page.getByLabel(/new reading/i).fill("520");
    await page.getByRole("button", { name: /save reading/i }).click();
    await page.waitForLoadState("networkidle");
    await page.goto("/work-orders");
    await expect(
      page.getByRole("link", { name: /Inspect compressor at 500h/ }),
    ).toHaveCount(1);

    // The WO links back to the meter and asset.
    await page.getByRole("link", { name: /Inspect compressor at 500h/ }).click();
    await page.waitForURL(/\/work-orders\/\d+$/);
    await expect(page.getByText(/Compressor run hours/).first()).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Air Compressor/ }).first(),
    ).toBeVisible();
  });

  test("manager corrects a bad reading with an audit note", async ({ page }) => {
    await login(page, CREDS.manager);
    await page.goto("/meters");
    await page.getByRole("link", { name: /Compressor run hours/ }).click();
    await page.waitForURL(/\/meters\/\d+$/);

    const row = page.locator("tr", { hasText: "520 hours" }).first();
    await row.getByRole("button", { name: /correct/i }).click();
    await row.getByLabel(/corrected value/i).fill("515");
    await row.getByLabel(/correction note/i).fill("fat-fingered");
    await row.getByRole("button", { name: /^fix$/i }).click();
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("(correction)").first()).toBeVisible();
    await expect(page.getByText(/515 hours/).first()).toBeVisible();
  });
});
