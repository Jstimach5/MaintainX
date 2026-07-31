import { test, expect, type Page } from "@playwright/test";
import { CREDS, ensureBaseData } from "./fixtures";

async function login(page: Page, creds: { username: string; password: string }) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  if (!page.url().includes("/login")) {
    await page.getByRole("button", { name: /sign out/i }).first().click();
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

test.describe("M1 — field shell", () => {
  test("@mobile technician gets the field home screen and bottom navigation", async ({
    page,
  }) => {
    await login(page, CREDS.tech);
    const fieldNav = page.getByRole("navigation", { name: /field navigation/i });
    await expect(fieldNav).toBeVisible();
    // Five destinations, thumb-reachable, no desktop link row.
    await expect(fieldNav.getByRole("link")).toHaveCount(5);
    await expect(
      page.getByRole("navigation", { name: /field navigation/i }).getByRole("link", { name: "Home" }),
    ).toBeVisible();

    // The two actions that start every field task are on the home screen.
    await expect(
      page.getByRole("link", { name: /new request/i }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /scan asset/i }),
    ).toBeVisible();

    // Field tiles, not operation analytics.
    await expect(page.getByText("Assigned to me")).toBeVisible();
    await expect(page.getByText("Due today")).toBeVisible();
    await expect(page.getByText("Overdue").first()).toBeVisible();

    // Bottom nav navigates.
    await fieldNav.getByRole("link", { name: "Account" }).click();
    await page.waitForURL("**/account");
    await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();
    await expect(page.getByText(CREDS.tech.username)).toBeVisible();
  });

  test("@mobile the work-order action bar is reachable without scrolling up", async ({
    page,
  }) => {
    await login(page, CREDS.tech);
    await page.goto("/work-orders?mine=1");
    await page.locator('a[href^="/work-orders/"]').first().click();
    await page.waitForURL(/\/work-orders\/\d+$/);

    // Scroll to the very bottom of a long job page…
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    // …the action bar is still on screen.
    const bar = page.locator("div.fixed", { hasText: /picture/i }).last();
    await expect(bar.getByRole("link", { name: /picture/i })).toBeInViewport();
    await expect(bar.getByRole("link", { name: /note/i })).toBeInViewport();
  });

  test("@mobile asset lookup finds equipment by name", async ({ page }) => {
    await login(page, CREDS.tech);
    await page
      .getByRole("navigation", { name: /field navigation/i })
      .getByRole("link", { name: "Scan" })
      .click();
    await page.waitForURL("**/scan");
    await page.getByLabel(/search assets/i).fill("Compressor");
    await page.getByRole("button", { name: /^search$/i }).click();
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("link", { name: /Air Compressor/ }).first(),
    ).toBeVisible();
  });

  test("desktop groups the header navigation into disclosure menus", async ({
    page,
  }) => {
    await login(page, CREDS.tech);
    const banner = page.getByRole("banner");
    // Destinations live behind a group toggle, not a flat row…
    const work = banner.getByRole("button", { name: /^work$/i });
    await expect(work).toBeVisible();
    await expect(work).toHaveAttribute("aria-expanded", "false");
    await work.click();
    await expect(work).toHaveAttribute("aria-expanded", "true");
    await expect(
      banner.getByRole("link", { name: "Work orders" }),
    ).toBeVisible();
    // …Escape closes the panel and hands focus back to its trigger.
    await page.keyboard.press("Escape");
    await expect(work).toHaveAttribute("aria-expanded", "false");
    await expect(work).toBeFocused();
    // Desktop keeps the field nav hidden.
    await expect(
      page.getByRole("navigation", { name: /field navigation/i }),
    ).toBeHidden();
  });
});
