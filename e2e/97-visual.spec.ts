import { test, expect, type Page, type Locator } from "@playwright/test";
import { CREDS, ensureBaseData } from "./fixtures";

/**
 * Visual regression for the redesign.
 *
 * **Scope, and why it is drawn here.** A pixel gate is only worth having if
 * a diff always means a regression. Record-bearing pages fail that test:
 * the e2e database is reset when the server starts, but the suite itself
 * creates rows as it runs, and a reused server carries them into the next
 * run — so a full-page snapshot of the work-order list would diff on data,
 * not on design. Those pages are covered instead by the capture harness
 * (`scripts/ui-baseline.ts` → `docs/ui-final/`), which is reviewed rather
 * than asserted.
 *
 * What is gated here is everything whose rendering does *not* depend on
 * ambient data: the application shell (the most-changed component in the
 * redesign), the sign-in page, the empty forms, and the designed
 * error/permission states. Counts and clocks are masked.
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

/** The notification bell carries an unread count that other specs move. */
function masks(page: Page): Locator[] {
  return [page.locator('a[href="/notifications"]')];
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(() => document.fonts?.ready);
}

async function shot(target: Page | Locator, page: Page, name: string) {
  await settle(page);
  await expect(target).toHaveScreenshot(name, {
    animations: "disabled",
    mask: masks(page),
    // Sub-pixel text rendering varies run to run on the same engine.
    maxDiffPixelRatio: 0.01,
  });
}

const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 390, height: 844 };

test.describe("visual — signed out", () => {
  test("sign-in page carries the brand at both widths", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/login");
    await shot(page, page, "login-desktop.png");

    await page.setViewportSize(PHONE);
    await page.goto("/login");
    await shot(page, page, "login-phone.png");
  });

  test("forgot-password page", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/forgot");
    await shot(page, page, "forgot-desktop.png");
  });
});

test.describe("visual — application shell", () => {
  test("the header renders per role", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    for (const [role, creds] of [
      ["admin", CREDS.admin],
      ["manager", CREDS.manager],
      ["technician", CREDS.tech],
      ["requester", CREDS.requester],
    ] as const) {
      await login(page, creds);
      await shot(page.getByRole("banner"), page, `header-${role}.png`);
      await page.context().clearCookies();
    }
  });

  test("an open disclosure panel", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await login(page, CREDS.admin);
    // Open the panel over a form page, not the dashboard: the clip would
    // otherwise catch KPI tiles whose counts move as the suite runs.
    await page.goto("/sites/new");
    const nav = page.getByRole("navigation", { name: "Primary" });
    const trigger = nav.getByRole("button", { name: "Assets" });
    await trigger.click();
    if ((await trigger.getAttribute("aria-expanded")) !== "true") {
      await trigger.click();
    }
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    // Clip to the header band plus the panel hanging below it.
    await settle(page);
    await expect(page).toHaveScreenshot("nav-panel-open.png", {
      animations: "disabled",
      mask: masks(page),
      clip: { x: 0, y: 0, width: DESKTOP.width, height: 320 },
      maxDiffPixelRatio: 0.01,
    });
  });

  test("the field bottom bar on a phone", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await login(page, CREDS.tech);
    const bar = page.getByRole("navigation", { name: "Field navigation" });
    await expect(bar).toBeVisible();
    await shot(bar, page, "field-bottom-bar-phone.png");
  });
});

test.describe("visual — data-independent pages", () => {
  test("the site form uses the narrow form template", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await login(page, CREDS.admin);
    await page.goto("/sites/new");
    await shot(page, page, "site-form-desktop.png");
  });

  test("the request form on a phone", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await login(page, CREDS.requester);
    await page.goto("/requests/new");
    await shot(page, page, "request-form-phone.png");
  });

  test("the blocked-page state", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await login(page, CREDS.requester);
    await page.goto("/admin/users");
    await page.waitForURL("**/forbidden");
    await shot(page, page, "forbidden-desktop.png");
  });

  test("the not-found state", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await login(page, CREDS.admin);
    await page.goto("/work-orders/99999999");
    await shot(page, page, "not-found-desktop.png");
  });
});
