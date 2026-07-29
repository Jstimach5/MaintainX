import { test, expect, type Page } from "@playwright/test";
import { CREDS, ensureBaseData } from "./fixtures";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

async function login(page: Page, creds: { username: string; password: string }) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  // Mid-test re-login: /login redirects an authenticated session to the
  // dashboard, so sign out first.
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

test.describe.serial("work orders", () => {
  test("manager creates a work order for an asset and assigns the technician", async ({
    page,
  }) => {
    await login(page, CREDS.manager);

    // From the asset page (created in 20-assets spec) — prefilled form.
    await page.goto("/assets");
    await page.getByRole("link", { name: /Air Compressor/ }).click();
    await page.waitForURL(/\/assets\/\d+$/);
    await page.getByRole("link", { name: /new work order/i }).click();
    await page.waitForURL(/\/work-orders\/new\?asset=\d+$/);

    await page.getByLabel(/^title/i).fill("Replace compressor belt");
    await page
      .getByLabel(/description/i)
      .fill("Belt is fraying. Replace and check tension.");
    await page.getByLabel(/priority/i).selectOption("high");
    // Site prefilled from the asset; asset checkbox pre-checked.
    await expect(page.locator('input[name="assetIds"]:checked')).toHaveCount(1);
    // Assign the technician.
    // tech1's display name is "Terry Tech" (created via UI in 00-auth.spec).
    await page
      .locator("label", { hasText: "Terry Tech" })
      .locator('input[name="assigneeIds"]')
      .check();
    await submit(page);

    await page.waitForURL(/\/work-orders\/\d+$/);
    await expect(
      page.getByRole("heading", { name: /WO-\d+ · Replace compressor belt/ }),
    ).toBeVisible();
    await expect(page.getByText("Assigned").first()).toBeVisible();
  });

  test("assigned technician runs the job: start, photo, comment, labor, complete", async ({
    page,
  }) => {
    await login(page, CREDS.tech);
    await page.goto("/work-orders?mine=1");
    await page.getByRole("link", { name: /Replace compressor belt/ }).click();
    await page.waitForURL(/\/work-orders\/\d+$/);

    // Start work.
    await page.getByRole("button", { name: /start work/i }).click();
    await expect(page.getByText("In progress").first()).toBeVisible();

    // Upload an "after" photo.
    await page.locator('input[type="file"]').setInputFiles({
      name: "after.png",
      mimeType: "image/png",
      buffer: PNG,
    });
    await expect(page.locator('img[src^="/files/"]').first()).toBeVisible({
      timeout: 15_000,
    });

    // Comment.
    await page
      .locator('textarea[name="body"]')
      .fill("Belt replaced, tension checked.");
    await page.getByRole("button", { name: /^comment$/i }).click();
    await expect(page.getByText("Belt replaced, tension checked.")).toBeVisible();

    // Labor time.
    await page.getByLabel(/hours/i).fill("1");
    await page.getByLabel(/^minutes/i).fill("15");
    await page.getByRole("button", { name: /log time/i }).click();
    await expect(page.getByText(/1h 15m/).first()).toBeVisible();

    // Complete with notes.
    await page.getByRole("button", { name: /mark completed/i }).click();
    await page
      .getByLabel(/completion notes/i)
      .fill("Replaced belt with spare; ran 10 min test.");
    await page.getByLabel(/actual downtime/i).fill("40");
    await page.getByRole("button", { name: /complete work order/i }).click();
    await expect(page.getByText("Completed").first()).toBeVisible();
    await expect(page.getByText(/replaced belt with spare/i)).toBeVisible();

    // Status history shows the full trail.
    await expect(page.getByText(/in progress → completed/i)).toBeVisible();
  });

  test("completed work appears in the asset's work history", async ({ page }) => {
    await login(page, CREDS.tech);
    await page.goto("/assets");
    await page.getByRole("link", { name: /Air Compressor/ }).click();
    await page.waitForURL(/\/assets\/\d+$/);
    await expect(
      page.getByRole("link", { name: /Replace compressor belt/ }),
    ).toBeVisible();
  });

  test("second technician cannot act on work assigned to another tech", async ({
    page,
  }) => {
    // Manager creates a fresh WO assigned only to tech1.
    await login(page, CREDS.manager);
    await page.goto("/work-orders/new");
    await page.getByLabel(/^title/i).fill("Grease bearings");
    await page.getByLabel(/^site/i).selectOption({ index: 1 });
    // tech1's display name is "Terry Tech" (created via UI in 00-auth.spec).
    await page
      .locator("label", { hasText: "Terry Tech" })
      .locator('input[name="assigneeIds"]')
      .check();
    await submit(page);
    await page.waitForURL(/\/work-orders\/\d+$/);
    const url = page.url();

    // Create a second technician via admin.
    await login(page, CREDS.admin);
    await page.goto("/admin/users/new");
    await page.getByLabel(/username/i).fill("tech2");
    await page.getByLabel(/display name/i).fill("Second Tech");
    await page.getByLabel(/role/i).selectOption("technician");
    await page.getByLabel(/initial password/i).fill("tech2-password-123");
    await submit(page);
    await page.waitForURL("**/admin/users");

    // tech2's first login lands on the forced change-password screen
    // (admin-set passwords are temporary), so sign in without the helper's
    // dashboard expectation and complete the change.
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    if (!page.url().includes("/login")) {
      await page.getByRole("button", { name: /sign out/i }).click();
      await page.waitForURL("**/login");
      await page.waitForLoadState("networkidle");
    }
    await page.getByLabel(/username/i).fill("tech2");
    await page.getByLabel(/^password/i).fill("tech2-password-123");
    await submit(page);
    await page.waitForURL("**/change-password");
    await page.getByLabel(/current password/i).fill("tech2-password-123");
    await page.getByLabel(/^new password/i).fill("tech2-password-123");
    await page.getByLabel(/confirm new password/i).fill("tech2-password-123");
    await page.getByRole("button", { name: /save password/i }).click();
    await page.waitForURL("**/dashboard");
    await page.goto(url);
    await expect(
      page.getByText(/assigned to someone else/i).first(),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /start work/i })).toHaveCount(0);
  });

  test("requester cannot reach work orders", async ({ page }) => {
    await login(page, CREDS.requester);
    await page.goto("/work-orders");
    await page.waitForURL("**/forbidden");
  });

  test("@mobile technician completes the flow on a phone viewport", async ({
    page,
  }) => {
    await login(page, CREDS.tech);
    await page.goto("/work-orders");
    await page.getByRole("link", { name: /Grease bearings/ }).click();
    await page.waitForURL(/\/work-orders\/\d+$/);
    await page.getByRole("button", { name: /start work/i }).click();
    await expect(page.getByText("In progress").first()).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
