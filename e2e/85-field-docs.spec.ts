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
  await page.locator('main form button[type="submit"]').first().click();
  await page.waitForURL("**/dashboard");
}

test.beforeAll(async () => {
  await ensureBaseData();
});

test.describe.serial("Phase 14 — field documentation from a phone-sized flow", () => {
  test("manager schedules work; technician sees it on their own calendar", async ({
    page,
  }) => {
    await login(page, CREDS.manager);
    await page.goto("/work-orders/new");
    await page.getByLabel(/^title/i).fill("Field service round");
    await page.getByLabel(/^site/i).selectOption({ label: "West Depot" });
    await page
      .locator("label", { hasText: "Air Compressor" })
      .locator('input[name="assetIds"]')
      .check();
    // The tech1 fixture user is renamed "Terry Tech" by the 00-auth spec's
    // UI run — locate by the visible display name (same as 96-…spec).
    await page
      .locator("label", { hasText: "Terry Tech" })
      .locator('input[name="assigneeIds"]')
      .check();
    const today = new Date().toISOString().slice(0, 10);
    await page.getByLabel(/planned start/i).fill(`${today}T09:00`);
    // The month calendar plots by DUE date (views.tsx), so give it one.
    await page.getByLabel(/^due/i).fill(`${today}T17:00`);
    await page.locator('main form button[type="submit"]').first().click();
    await page.waitForURL(/\/work-orders\/\d+$/);

    // The technician's schedule: own work only, no manager chrome.
    await login(page, CREDS.tech);
    await page.goto("/schedule?view=calendar");
    await expect(
      page.getByRole("heading", { name: "My schedule" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Field service round/ }),
    ).toBeVisible();
    await expect(page.getByText(/needs attention/i)).toHaveCount(0);
    // Table view offers no assignee filter — the scope is enforced.
    await page.goto("/schedule");
    await expect(page.locator('select[name="assignee"]')).toHaveCount(0);
  });

  test("technician documents parts, cost, and a meter reading on the work order", async ({
    page,
  }) => {
    // A meter on the same asset, so the WO page offers reading entry.
    await login(page, CREDS.admin);
    await page.goto("/meters/new");
    await page.getByLabel(/meter name/i).fill("Truck odometer (field)");
    await page.getByLabel(/^unit/i).fill("miles");
    const assetOptions = await page.getByLabel(/^asset/i).locator("option").allTextContents();
    const target = assetOptions.find((o) => o.includes("Air Compressor"))!;
    await page.getByLabel(/^asset/i).selectOption({ label: target });
    await page.locator('main form button[type="submit"]').first().click();
    await page.waitForURL(/\/meters\/\d+$/);

    await login(page, CREDS.tech);
    await page.goto("/work-orders?mine=1");
    await page.getByRole("link", { name: /Field service round/ }).click();
    await page.waitForURL(/\/work-orders\/\d+$/);

    // Costed part line.
    await page.getByLabel(/part or material/i).fill("Oil filter WIX-51348");
    await page.getByLabel(/^qty/i).fill("2");
    await page.getByLabel(/cost each/i).fill("12.50");
    await page.getByRole("button", { name: /add part/i }).click();
    await expect(page.getByText("2 × Oil filter WIX-51348")).toBeVisible();
    await expect(page.getByText("Parts total: $25.00")).toBeVisible();

    // Uncosted part still listed; total unchanged.
    await page.getByLabel(/part or material/i).fill("Shop towels");
    await page.getByRole("button", { name: /add part/i }).click();
    await expect(page.getByText(/1 × Shop towels/)).toBeVisible();
    await expect(page.getByText("Parts total: $25.00")).toBeVisible();

    // Mistake? The author can remove their own line.
    await page
      .locator("li", { hasText: "Shop towels" })
      .getByRole("button", { name: /remove part line/i })
      .click();
    await expect(page.getByText(/1 × Shop towels/)).toHaveCount(0);
    await expect(page.getByText("Parts total: $25.00")).toBeVisible();

    // Meter reading recorded right on the job page.
    await page.getByLabel("New reading (miles)").fill("48210");
    await page
      .locator("form", { has: page.getByLabel("New reading (miles)") })
      .getByRole("button", { name: /record/i })
      .click();
    await expect(page.getByText(/Last: 48210 miles/)).toBeVisible();
  });

  test("@mobile technician documents a part from a phone without horizontal scroll", async ({
    page,
  }) => {
    await login(page, CREDS.tech);
    await page.goto("/work-orders?mine=1");
    await page.getByRole("link", { name: /Field service round/ }).click();
    await page.waitForURL(/\/work-orders\/\d+$/);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await page.getByLabel(/part or material/i).fill("Zip ties (bag)");
    await page.getByLabel(/cost each/i).fill("4.99");
    await page.getByRole("button", { name: /add part/i }).click();
    await expect(page.getByText(/1 × Zip ties \(bag\)/)).toBeVisible();
    await expect(page.getByText("Parts total: $29.99")).toBeVisible();
  });
});
