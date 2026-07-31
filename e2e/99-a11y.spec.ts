import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { CREDS, ensureBaseData } from "./fixtures";

/**
 * Automated accessibility scan across one page per family, at desktop
 * and phone widths. Serious and critical violations fail the build —
 * axe cannot judge everything, but it must never regress on the things
 * it can prove.
 */

test.beforeAll(async () => {
  await ensureBaseData();
});

async function login(page: Page, creds: { username: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel(/username/i).fill(creds.username);
  await page.getByLabel(/^password/i).fill(creds.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/dashboard");
}

async function scan(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  const summary = blocking
    .map(
      (v) =>
        `${v.id} (${v.impact}) — ${v.help}\n    ${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(" "))
          .join("\n    ")}`,
    )
    .join("\n  ");
  expect(blocking, `${label} a11y violations:\n  ${summary}`).toEqual([]);
}

const ADMIN_PAGES: [string, string][] = [
  ["/dashboard", "dashboard"],
  ["/work-orders", "work-order list"],
  ["/requests", "request list"],
  ["/assets", "asset list"],
  ["/sites", "site list"],
  ["/locations", "locations"],
  ["/meters", "meters"],
  ["/pm-plans", "PM plans"],
  ["/reports", "reports"],
  ["/admin/users", "admin users"],
  ["/admin/audit", "audit log"],
];

test.describe("accessibility", () => {
  test("the sign-in page is accessible", async ({ page }) => {
    await page.goto("/login");
    await scan(page, "login");
  });

  test("admin pages are accessible", async ({ page }) => {
    await login(page, CREDS.admin);
    for (const [path, label] of ADMIN_PAGES) {
      await page.goto(path);
      await page.waitForLoadState("networkidle").catch(() => {});
      await scan(page, label);
    }
  });

  test("record pages are accessible", async ({ page }) => {
    await login(page, CREDS.admin);
    await page.goto("/work-orders");
    // Numeric ids only — "New work order" is also an /work-orders/… link.
    const wo = page.locator('a:visible[href^="/work-orders/"]').filter({ hasText: /WO-\d+/ }).first();
    if (await wo.count()) {
      await wo.click();
      await page.waitForURL(/\/work-orders\/\d+$/);
      await scan(page, "work-order detail");
    }
    await page.goto("/assets");
    const asset = page.locator('a:visible[href^="/assets/"]').filter({ hasText: /A-\d+/ }).first();
    if (await asset.count()) {
      await asset.click();
      await page.waitForURL(/\/assets\/\d+$/);
      await scan(page, "asset detail");
    }
  });

  test("@mobile the field screens are accessible", async ({ page }) => {
    await login(page, CREDS.tech);
    await scan(page, "field home");
    await page.goto("/work-orders?mine=1");
    await scan(page, "my work orders");
    await page.goto("/account");
    await scan(page, "account");
  });
});
