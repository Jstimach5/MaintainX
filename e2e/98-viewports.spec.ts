import { test, expect, type Page } from "@playwright/test";
import { CREDS, ensureBaseData } from "./fixtures";

/**
 * Read-only layout checks that run on EVERY device project (@field).
 * Deliberately mutation-free: the same assertions execute at four widths
 * against shared data, so anything stateful belongs in a per-flow spec
 * instead. What we prove here is that field screens fit real phones.
 */

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

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
}

test.beforeAll(async () => {
  await ensureBaseData();
});

test.describe("@field field screens fit the viewport", () => {
  test("technician screens have no horizontal page scroll", async ({ page }) => {
    await login(page, CREDS.tech);
    for (const path of [
      "/dashboard",
      "/work-orders",
      "/work-orders?mine=1",
      "/schedule",
      "/schedule?view=calendar",
      "/assets",
      "/meters",
      "/requests",
      "/notifications",
    ]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(
        await horizontalOverflow(page),
        `${path} overflows horizontally`,
      ).toBeLessThanOrEqual(1);
    }
  });

  test("a work order is readable and its controls are reachable", async ({
    page,
  }) => {
    await login(page, CREDS.tech);
    await page.goto("/work-orders");
    await page.waitForLoadState("networkidle");
    const firstWo = page.locator('a[href^="/work-orders/"]').first();
    await expect(firstWo).toBeVisible();
    await firstWo.click();
    await page.waitForURL(/\/work-orders\/\d+$/);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    // Form controls must not be smaller than a fingertip.
    const control = page.locator("main button[type=submit]").first();
    if ((await control.count()) > 0) {
      const box = await control.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(36);
    }
  });

  test("the request form fits and its fields are usable", async ({ page }) => {
    await login(page, CREDS.requester);
    await page.goto("/requests/new");
    await page.waitForLoadState("networkidle");
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    const title = page.getByLabel(/^title|what.s wrong/i).first();
    await expect(title).toBeVisible();
    const box = await title.boundingBox();
    // 16px+ font and a full-width field keep iOS from zooming on focus.
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(36);
  });
});
