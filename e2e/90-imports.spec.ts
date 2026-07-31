import { test, expect, type Page } from "@playwright/test";
import { CREDS, ensureBaseData, navTo } from "./fixtures";

const CSV = [
  "External ID,Title,Status,Priority,Site,Due Date",
  "E2E-1,Imported pump check,done,high,West Depot,2026-06-01",
  "E2E-2,Imported valve fix,open,medium,West Depot,2026-09-01",
  "E2E-3,Bad site row,open,low,Atlantis,2026-09-01",
  "E2E-4,Bad status row,sorta,low,West Depot,",
].join("\n");

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

test.describe.serial("bulk imports — Scenario D", () => {
  test("admin uploads, maps, validates: dry run separates good and bad rows", async ({
    page,
  }) => {
    await login(page, CREDS.admin);
    await navTo(page, "Imports");
    await page.waitForURL("**/imports");
    await page.getByRole("link", { name: /new import/i }).first().click();

    await page.locator('input[type="file"]').setInputFiles({
      name: "legacy.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(CSV),
    });
    await page.getByRole("button", { name: /upload and continue/i }).click();
    await page.waitForURL(/\/imports\/\d+$/);

    // Columns were auto-mapped (Title, Status, Site, Due Date…); validate.
    await expect(page.getByText(/map the columns/i)).toBeVisible();
    await page.getByRole("button", { name: /validate file/i }).click();
    await page.waitForURL(/\/imports\/\d+$/);

    await expect(page.getByText("2 valid")).toBeVisible();
    await expect(page.getByText("2 rejected")).toBeVisible();
    await expect(page.getByText(/atlantis.*does not exist/i)).toBeVisible();
    await expect(page.getByText(/sorta.*not recognized/i)).toBeVisible();

    // Issues CSV downloads.
    const url = page.url();
    const res = await page.request.get(`${url}/issues.csv`);
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain("Atlantis");
  });

  test("import runs, report shows counts, work orders appear", async ({ page }) => {
    await login(page, CREDS.admin);
    await page.goto("/imports");
    await page.getByRole("link", { name: /legacy\.csv/i }).first().click();
    await page.waitForURL(/\/imports\/\d+$/);
    await page.getByRole("button", { name: /start import/i }).click();

    // Small file completes almost instantly; wait for the result card.
    await expect(page.getByText("2 created")).toBeVisible({ timeout: 20_000 });

    await page.goto("/work-orders?done=1");
    await expect(page.getByRole("link", { name: /Imported pump check/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Imported valve fix/ })).toBeVisible();

    // The completed import kept its completion date + import source.
    await page.getByRole("link", { name: /Imported pump check/ }).click();
    await page.waitForURL(/\/work-orders\/\d+$/);
    await expect(page.getByText("Completed").first()).toBeVisible();
    await expect(page.getByText("import").first()).toBeVisible();
  });

  test("re-importing the same file skips duplicates", async ({ page }) => {
    await login(page, CREDS.admin);
    await page.goto("/imports/new");
    await page.locator('input[type="file"]').setInputFiles({
      name: "legacy.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(CSV),
    });
    await page.getByRole("button", { name: /upload and continue/i }).click();
    await page.waitForURL(/\/imports\/\d+$/);
    await page.getByRole("button", { name: /validate file/i }).click();
    await page.waitForURL(/\/imports\/\d+$/);
    await expect(page.getByText(/will be skipped/i).first()).toBeVisible();
    await page.getByRole("button", { name: /start import/i }).click();
    await expect(page.getByText("2 skipped")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("0 created")).toBeVisible();

    // Still exactly one of each imported WO.
    await page.goto("/work-orders?done=1&q=Imported pump check");
    await expect(page.getByRole("link", { name: /Imported pump check/ })).toHaveCount(1);
  });

  test("technicians cannot reach imports", async ({ page }) => {
    await login(page, CREDS.tech);
    await page.goto("/imports");
    await page.waitForURL("**/forbidden");
  });
});
