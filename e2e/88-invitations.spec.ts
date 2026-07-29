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

/** The revealed absolute link, reduced to a path so baseURL applies. */
function linkPath(link: string): string {
  return new URL(link).pathname;
}

async function createInvite(page: Page, email: string, name: string): Promise<string> {
  await page.goto("/admin/users/invite");
  await page.getByLabel(/email address/i).fill(email);
  await page.getByLabel(/display name/i).fill(name);
  await page.getByLabel(/^role/i).selectOption("technician");
  await page.getByRole("button", { name: /create invitation/i }).click();
  const reveal = page.getByTestId("invite-link");
  await expect(reveal).toBeVisible();
  return (await reveal.textContent())!.trim();
}

test.beforeAll(async () => {
  await ensureBaseData();
});

test.describe.serial("invitations — invite, accept, revoke", () => {
  let inviteLink: string;

  test("admin creates an invitation and gets a one-time link (email off → copy-link fallback)", async ({
    page,
  }) => {
    await login(page, CREDS.admin);
    inviteLink = await createInvite(page, "newtech@example.com", "Nina New");
    expect(inviteLink).toMatch(/\/invite\/[A-Za-z0-9_-]{20,}/);
    // Email isn't configured in e2e, so the UI must say copy-link, not "sent".
    await expect(page.getByTestId("invite-link-reveal")).toContainText(/not configured/i);
    // The pending invitation shows in the list with its state.
    await page.goto("/admin/users");
    await expect(page.getByText("newtech@example.com")).toBeVisible();
    await expect(page.getByText(/not emailed \(copy-link\)/i).first()).toBeVisible();
  });

  test("the invitee opens the link, sets a password, and lands signed in with the invited role", async ({
    browser,
  }) => {
    const page = await browser.newPage(); // clean context — no admin cookies
    await page.goto(linkPath(inviteLink));
    await expect(page.getByRole("heading", { name: /join/i })).toBeVisible();
    await expect(page.getByText("newtech@example.com")).toBeVisible();
    await page.getByLabel(/username/i).fill("nina");
    await page.getByLabel(/^password/i).fill("nina-password-1");
    await page.getByLabel(/confirm password/i).fill("nina-password-1");
    await page.getByRole("button", { name: /activate my account/i }).click();
    await page.waitForURL("**/dashboard");
    // Technician role: field home renders, no admin nav.
    await expect(page.getByText(/nina new/i).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /^users$/i })).toHaveCount(0);
    await page.close();
  });

  test("the used link cannot create a second account", async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto(linkPath(inviteLink));
    await expect(page.getByText(/already used/i)).toBeVisible();
    await expect(page.getByLabel(/^password/i)).toHaveCount(0);
    await page.close();
  });

  test("a revoked invitation dies immediately", async ({ page, browser }) => {
    await login(page, CREDS.admin);
    const link = await createInvite(page, "revoked@example.com", "Never Joins");
    await page.goto("/admin/users");
    const row = page
      .locator("div", { hasText: "revoked@example.com" })
      .getByRole("button", { name: /revoke/i })
      .first();
    await row.click();
    await expect(page.getByText(/^revoked$/).first()).toBeVisible();

    const anon = await browser.newPage();
    await anon.goto(linkPath(link));
    await expect(anon.getByText(/was revoked/i)).toBeVisible();
    await anon.close();
  });

  test("resend mints a new link and the old one stops working", async ({
    page,
    browser,
  }) => {
    await login(page, CREDS.admin);
    const oldLink = await createInvite(page, "reissue@example.com", "Ray Reissue");
    await page.goto("/admin/users");
    await page
      .locator("div", { hasText: "reissue@example.com" })
      .getByRole("button", { name: /resend/i })
      .first()
      .click();
    const reveal = page.getByTestId("invite-link");
    await expect(reveal).toBeVisible();
    const newLink = (await reveal.textContent())!.trim();
    expect(newLink).not.toBe(oldLink);

    const anon = await browser.newPage();
    await anon.goto(linkPath(oldLink));
    await expect(anon.getByText(/isn't valid/i)).toBeVisible();
    await anon.goto(linkPath(newLink));
    await expect(anon.getByRole("heading", { name: /join/i })).toBeVisible();
    await anon.close();
  });

  test("forgot-password answers identically for unknown accounts", async ({
    browser,
  }) => {
    const page = await browser.newPage();
    await page.goto("/forgot");
    await page.getByLabel(/username or email/i).fill("no-such-user@example.com");
    await page.getByRole("button", { name: /send reset link/i }).click();
    await expect(page.getByTestId("forgot-done")).toContainText(/if that matches/i);
    await page.close();
  });
});
