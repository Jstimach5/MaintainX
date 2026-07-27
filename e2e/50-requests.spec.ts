import { test, expect, type Page } from "@playwright/test";
import { CREDS, ensureBaseData } from "./fixtures";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

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

test.describe.serial("work requests — Scenario A", () => {
  test("requester submits a request with a picture", async ({ page }) => {
    await login(page, CREDS.requester);
    await page.getByRole("link", { name: /^requests$/i }).click();
    await page.waitForURL("**/requests");
    await page.getByRole("link", { name: /new request/i }).first().click();

    await page.getByLabel(/what needs attention/i).fill("Broken light in Bay 1");
    await page.getByLabel(/details/i).fill("Flickers, then goes dark. Hard to see.");
    await page.getByLabel(/^site/i).selectOption({ label: "West Depot" });
    await page.getByLabel(/priority/i).selectOption("high");
    await submit(page);
    await page.waitForURL(/\/requests\/\d+$/);
    await expect(
      page.getByRole("heading", { name: /REQ-\d+ · Broken light in Bay 1/ }),
    ).toBeVisible();

    // Add a picture on the detail page.
    await page.locator('input[type="file"]').setInputFiles({
      name: "light.png",
      mimeType: "image/png",
      buffer: PNG,
    });
    await expect(page.locator('img[src^="/files/"]').first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("manager reviews, approves, and converts to exactly one work order", async ({
    page,
  }) => {
    await login(page, CREDS.manager);
    // Manager got an in-app notification.
    await page.goto("/notifications");
    await expect(
      page.getByText(/new request: broken light in bay 1/i).first(),
    ).toBeVisible();

    await page.goto("/requests");
    await page.getByRole("link", { name: /Broken light in Bay 1/ }).click();
    await page.waitForURL(/\/requests\/\d+$/);

    await page.getByRole("button", { name: /start review/i }).click();
    await expect(page.getByText("Under review").first()).toBeVisible();

    // Internal note the requester must never see.
    await page.locator('textarea[name="body"]').fill("Electrician needed — check breaker first.");
    await page.getByLabel(/internal note/i).check();
    await page.getByRole("button", { name: /^comment$/i }).click();
    await expect(page.getByText(/electrician needed/i)).toBeVisible();

    await page.getByRole("button", { name: /^approve$/i }).click();
    await expect(page.getByText("Approved").first()).toBeVisible();

    await page.getByRole("button", { name: /convert to work order/i }).click();
    await page.waitForURL(/\/work-orders\/\d+$/);
    await expect(
      page.getByRole("heading", { name: /WO-\d+ · Broken light in Bay 1/ }),
    ).toBeVisible();

    // Assign the technician via edit.
    await page.getByRole("link", { name: /^edit$/i }).click();
    await page.waitForURL(/\/work-orders\/\d+\/edit$/);
    await page
      .locator("label", { hasText: "Terry Tech" })
      .locator('input[name="assigneeIds"]')
      .check();
    await submit(page);
    await page.waitForURL(/\/work-orders\/\d+$/);

    // Back on the request: converted banner + no more decision buttons.
    await page.goto("/requests");
    await page.getByRole("link", { name: /Broken light in Bay 1/ }).click();
    await expect(page.getByText(/converted to work order/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /convert/i })).toHaveCount(0);
  });

  test("technician completes the work; requester sees status without internal notes", async ({
    page,
  }) => {
    await login(page, CREDS.tech);
    await page.goto("/work-orders?mine=1");
    await page.getByRole("link", { name: /Broken light in Bay 1/ }).click();
    await page.waitForURL(/\/work-orders\/\d+$/);
    await page.getByRole("button", { name: /start work/i }).click();
    await page.getByRole("button", { name: /mark completed/i }).click();
    await page.getByLabel(/completion notes/i).fill("Replaced ballast and tube.");
    await page.getByRole("button", { name: /complete work order/i }).click();
    await expect(page.getByText("Completed").first()).toBeVisible();

    // Requester's view: status visible, internal note hidden, notification in.
    await login(page, CREDS.requester);
    await page.goto("/requests");
    await page.getByRole("link", { name: /Broken light in Bay 1/ }).click();
    await page.waitForURL(/\/requests\/\d+$/);
    await expect(page.getByText(/converted to work order/i).first()).toBeVisible();
    await expect(page.getByText("Completed").first()).toBeVisible();
    await expect(page.getByText(/electrician needed/i)).toHaveCount(0);

    await page.goto("/notifications");
    await expect(
      page.getByText(/work on your request "broken light in bay 1" is complete/i),
    ).toBeVisible();
  });

  test("requesters cannot see other people's requests", async ({ page }) => {
    // Manager files their own request.
    await login(page, CREDS.manager);
    await page.goto("/requests/new");
    await page.getByLabel(/what needs attention/i).fill("Private manager request");
    await page.getByLabel(/^site/i).selectOption({ index: 1 });
    await submit(page);
    await page.waitForURL(/\/requests\/(\d+)$/);
    const url = page.url();

    await login(page, CREDS.requester);
    await page.goto("/requests");
    await expect(page.getByText("Private manager request")).toHaveCount(0);
    const resp = await page.goto(url);
    expect(resp?.status()).toBe(404);
  });

  test("public portal accepts an anonymous submission with photo", async ({
    page,
  }) => {
    // Admin enables the portal for West Depot.
    await login(page, CREDS.admin);
    await page.goto("/sites");
    await page.getByRole("link", { name: "West Depot" }).click();
    await page.waitForURL(/\/sites\/\d+$/);
    await page
      .getByRole("button", { name: /enable public request portal/i })
      .click();
    await expect(page.getByText(/\/portal\//).first()).toBeVisible();
    const tokenText = await page.locator("p.font-mono").textContent();
    const portalPath = tokenText!.trim();

    // Anonymous visitor (fresh context has our admin cookie — sign out).
    await page.getByRole("button", { name: /sign out/i }).click();
    await page.waitForURL("**/login");

    await page.goto(portalPath);
    await expect(
      page.getByRole("heading", { name: /maintenance request/i }),
    ).toBeVisible();
    await page.getByLabel(/what needs attention/i).fill("Spill near dock door");
    await page.getByLabel(/your name/i).fill("Visiting Vendor");
    await page.getByLabel(/how urgent/i).selectOption("high");
    await page.locator('input[type="file"]').setInputFiles({
      name: "spill.png",
      mimeType: "image/png",
      buffer: PNG,
    });
    await submit(page);
    await page.waitForURL(/\?submitted=/);
    await expect(page.getByText(/request received/i)).toBeVisible();

    // The team sees it, with the photo, marked as portal-sourced.
    await login(page, CREDS.manager);
    await page.goto("/requests");
    await page.getByRole("link", { name: /Spill near dock door/ }).click();
    await page.waitForURL(/\/requests\/\d+$/);
    await expect(page.getByText("portal").first()).toBeVisible();
    await expect(page.getByText("Visiting Vendor").first()).toBeVisible();
    await expect(page.locator('img[src^="/files/"]').first()).toBeVisible();
  });
});
