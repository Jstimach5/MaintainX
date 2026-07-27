import { test, expect, type Page } from "@playwright/test";
import { CREDS, ensureBaseData } from "./fixtures";

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

test.describe.serial("procedures", () => {
  test("manager builds a procedure with checkbox + pass/fail steps", async ({
    page,
  }) => {
    await login(page, CREDS.manager);
    await page.goto("/procedures/new");

    await page.getByLabel(/procedure name/i).fill("Belt inspection");

    // Step 1 defaults to checkbox — label it.
    await page.locator("#step-label-0").fill("Guard removed and stored");

    // Step 2: pass/fail with required comment on failure.
    await page.getByRole("button", { name: /add step/i }).click();
    await page.locator("#step-type-1").selectOption("pass_fail");
    await page.locator("#step-label-1").fill("Belt condition acceptable");
    await page
      .locator("div")
      .filter({ hasText: /^On failure:/ })
      .getByLabel(/require comment/i)
      .check();

    await submit(page);
    await page.waitForURL(/\/procedures\/\d+$/);
    await expect(
      page.getByRole("heading", { name: /edit: belt inspection/i }),
    ).toBeVisible();
  });

  test("manager attaches the procedure to a new work order", async ({ page }) => {
    await login(page, CREDS.manager);
    await page.goto("/work-orders/new");
    await page.getByLabel(/^title/i).fill("Quarterly belt check");
    await page.getByLabel(/^site/i).selectOption({ index: 1 });
    await page
      .locator("label", { hasText: "Terry Tech" })
      .locator('input[name="assigneeIds"]')
      .check();
    await submit(page);
    await page.waitForURL(/\/work-orders\/\d+$/);

    await page.getByLabel(/attach procedure/i).selectOption({ label: "Belt inspection (v1)" });
    await page.getByRole("button", { name: /^attach$/i }).click();
    await expect(page.getByText("Guard removed and stored")).toBeVisible();
    await expect(page.getByText("0/2 done")).toBeVisible();
  });

  test("completion is blocked until required steps are answered", async ({
    page,
  }) => {
    await login(page, CREDS.tech);
    await page.goto("/work-orders");
    await page.getByRole("link", { name: /Quarterly belt check/ }).click();
    await page.waitForURL(/\/work-orders\/\d+$/);

    await page.getByRole("button", { name: /start work/i }).click();
    await expect(page.getByText("In progress").first()).toBeVisible();

    // Try to complete with nothing answered.
    await page.getByRole("button", { name: /mark completed/i }).click();
    await page.getByRole("button", { name: /complete work order/i }).click();
    await expect(
      page.getByText(/required procedure steps are missing/i),
    ).toBeVisible();

    // Answer the checkbox step.
    const step1 = page.locator("li", { hasText: "Guard removed and stored" });
    await step1.locator('input[type="checkbox"][name="value"]').check();
    await step1.getByRole("button", { name: /save answer/i }).click();
    await expect(page.getByText("1/2 done")).toBeVisible();

    // Fail the pass/fail step without a comment → rejected.
    const step2 = page.locator("li", { hasText: "Belt condition acceptable" });
    await step2.getByLabel(/fail/i).check();
    await step2.getByRole("button", { name: /save answer/i }).click();
    await expect(page.getByText(/comment is required/i)).toBeVisible();

    // Fail WITH a comment → flags the WO.
    const step2again = page.locator("li", { hasText: "Belt condition acceptable" });
    await step2again.getByLabel(/fail/i).check();
    await step2again
      .locator('input[name="comment"]')
      .fill("Cracks across the belt face");
    await step2again.getByRole("button", { name: /save answer/i }).click();
    await expect(page.getByText(/flagged — inspection failure/i)).toBeVisible();
    await expect(page.getByText("FAILED").first()).toBeVisible();

    // Now completion goes through (both required steps answered).
    await page.getByRole("button", { name: /mark completed/i }).click();
    await page
      .getByLabel(/completion notes/i)
      .fill("Inspection done; belt needs replacement.");
    await page.getByRole("button", { name: /complete work order/i }).click();
    await expect(page.getByText("Completed").first()).toBeVisible();
  });

  test("editing the template does not change the completed WO's snapshot", async ({
    page,
  }) => {
    await login(page, CREDS.manager);
    await page.goto("/procedures");
    await page.getByRole("link", { name: "Belt inspection" }).click();
    await page.waitForURL(/\/procedures\/\d+$/);
    // Rename step 1 and save (creates v2).
    await page.locator("#step-label-0").fill("TOTALLY DIFFERENT STEP");
    await submit(page);
    await page.waitForURL(/\/procedures\/\d+$/);
    await expect(page.getByText(/current version v2/i)).toBeVisible();

    // The completed WO still shows the v1 snapshot.
    await page.goto("/work-orders?done=1");
    await page.getByRole("link", { name: /Quarterly belt check/ }).click();
    await page.waitForURL(/\/work-orders\/\d+$/);
    await expect(page.getByText("Guard removed and stored")).toBeVisible();
    await expect(page.getByText("TOTALLY DIFFERENT STEP")).toHaveCount(0);
    await expect(page.getByText(/v1/).first()).toBeVisible();
  });

  test("technician cannot open the procedure builder", async ({ page }) => {
    await login(page, CREDS.tech);
    await page.goto("/procedures");
    await page.waitForURL("**/forbidden");
  });
});
