import { test, expect, type Page } from "@playwright/test";

/**
 * Phase 1 end-to-end: first-run setup, login/logout, user management,
 * and backend-enforced role boundaries. Tests are serial — later tests
 * depend on state created by earlier ones (fresh DB per run via
 * global-setup).
 */

const ADMIN = { username: "admin", password: "admin-password-123" };
const TECH = { username: "tech1", password: "tech-password-123" };

async function login(page: Page, creds: { username: string; password: string }) {
  await page.goto("/login");
  // Let hydration settle before interacting — clicking a submit button that
  // React is still hydrating can strand Playwright's actionability checks.
  await page.waitForLoadState("networkidle");
  await page.getByLabel(/username/i).fill(creds.username);
  await page.getByLabel(/^password/i).fill(creds.password);
  await page.locator('form button[type="submit"]').click();
}

async function logout(page: Page) {
  await page.getByRole("button", { name: /sign out/i }).click();
  await page.waitForURL("**/login");
}

test.describe.serial("authentication and RBAC", () => {
  test("first run redirects to setup and creates the organization", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForURL("**/setup");
    await expect(
      page.getByRole("heading", { name: /welcome/i }),
    ).toBeVisible();

    await page.getByLabel(/organization name/i).fill("Acme Maintenance");
    await page.getByLabel(/timezone/i).selectOption("America/Chicago");
    await page.getByLabel(/username/i).fill(ADMIN.username);
    await page.getByLabel(/display name/i).fill("Alice Admin");
    await page.getByLabel(/^password/i).fill(ADMIN.password);
    await page.getByLabel(/confirm password/i).fill(ADMIN.password);
    await page.getByRole("button", { name: /create organization/i }).click();

    await page.waitForURL("**/dashboard");
    await expect(page.getByText(/alice admin/i).first()).toBeVisible();
  });

  test("setup page is a one-time door", async ({ page }) => {
    await page.goto("/setup");
    await page.waitForURL("**/login");
  });

  test("wrong password is rejected; correct login works; logout works", async ({
    page,
  }) => {
    await login(page, { username: ADMIN.username, password: "wrong-password" });
    await expect(page.getByTestId("form-error")).toContainText(
      /wrong username or password/i,
    );

    await login(page, ADMIN);
    await page.waitForURL("**/dashboard");

    await logout(page);
    // Session is revoked server-side: navigating back requires login again.
    await page.goto("/dashboard");
    await page.waitForURL("**/login**");
  });

  test("admin creates a technician account", async ({ page }) => {
    await login(page, ADMIN);
    await page.waitForURL("**/dashboard");
    await page.getByRole("link", { name: /^users$/i }).click();
    await page.waitForURL("**/admin/users");
    await page.getByRole("link", { name: /add manually/i }).click();

    await page.getByLabel(/username/i).fill(TECH.username);
    await page.getByLabel(/display name/i).fill("Terry Tech");
    await page.getByLabel(/role/i).selectOption("technician");
    await page.getByLabel(/initial password/i).fill(TECH.password);
    await page.getByRole("button", { name: /create user/i }).click();

    await page.waitForURL("**/admin/users");
    await expect(page.getByText("Terry Tech")).toBeVisible();
    await logout(page);
  });

  test("an admin-set password is temporary: first login forces a change", async ({
    page,
  }) => {
    await login(page, TECH);
    await page.waitForURL("**/change-password");
    await expect(page.getByText(/set by an administrator/i)).toBeVisible();
    // Nothing else in the app is reachable until the password is changed.
    await page.goto("/work-orders");
    await page.waitForURL("**/change-password");
    await page.getByLabel(/current password/i).fill(TECH.password);
    await page.getByLabel(/^new password/i).fill(TECH.password);
    await page.getByLabel(/confirm new password/i).fill(TECH.password);
    await page.getByRole("button", { name: /save password/i }).click();
    await page.waitForURL("**/dashboard");
    await logout(page);
  });

  test("technician cannot reach admin pages (backend-enforced)", async ({
    page,
  }) => {
    await login(page, TECH);
    await page.waitForURL("**/dashboard");
    // No admin links in nav…
    await expect(page.getByRole("link", { name: /^users$/i })).toHaveCount(0);
    // …and direct navigation is blocked server-side, not just hidden.
    await page.goto("/admin/users");
    await page.waitForURL("**/forbidden");
    await expect(page.getByText(/not allowed/i).first()).toBeVisible();
    await logout(page);
  });

  test("@mobile technician can sign in and use the app on a phone viewport", async ({
    page,
  }) => {
    await login(page, TECH);
    await page.waitForURL("**/dashboard");
    await expect(page.getByText(/terry tech/i).first()).toBeVisible();
    // No horizontal scroll on mobile.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
