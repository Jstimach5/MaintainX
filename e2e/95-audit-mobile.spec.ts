import { test, expect, type Page } from "@playwright/test";
import { CREDS, ensureBaseData, navTo } from "./fixtures";

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

test.describe.serial("audit browser + mobile pass", () => {
  test("admin browses and filters the append-only audit log", async ({ page }) => {
    await login(page, CREDS.admin);
    await navTo(page, "Audit");
    await page.waitForURL("**/admin/audit");
    // Events from earlier specs exist.
    await expect(page.locator("span.font-mono").first()).toBeVisible();
    // Filter by action prefix.
    await page.locator('input[name="action"]').fill("work_order.");
    await page.getByRole("button", { name: /^filter$/i }).click();
    await page.waitForURL(/action=work_order/);
    const actions = await page.locator("span.font-mono").allTextContents();
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every((a) => a.startsWith("work_order."))).toBe(true);
  });

  test("manager cannot open the audit log", async ({ page }) => {
    await login(page, CREDS.manager);
    await page.goto("/admin/audit");
    await page.waitForURL("**/forbidden");
  });

  test("@mobile requester submits and tracks a request on a phone", async ({ page }) => {
    await login(page, CREDS.requester);
    await page.getByRole("link", { name: /^requests$/i }).click();
    await page.waitForURL("**/requests");
    await page.getByRole("link", { name: /new request/i }).first().click();
    await page.getByLabel(/what needs attention/i).fill("Mobile-submitted leak");
    await page.getByLabel(/^site/i).selectOption({ index: 1 });
    await page.locator('main form button[type="submit"]').first().click();
    await page.waitForURL(/\/requests\/\d+$/);
    await expect(page.getByText("Submitted").first()).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("@mobile manager reviews the schedule on a phone without horizontal page scroll", async ({
    page,
  }) => {
    await login(page, CREDS.manager);
    await page.goto("/schedule");
    await expect(page.getByRole("link", { name: /WO-\d+/ }).first()).toBeVisible();
    // The TABLE scrolls inside its card; the page body must not.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
