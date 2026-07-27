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

test.describe.serial("preventive maintenance — Scenario B", () => {
  test("manager creates a floating PM plan due today", async ({ page }) => {
    await login(page, CREDS.manager);
    await page.getByRole("link", { name: /^pm$/i }).click();
    await page.waitForURL("**/pm-plans");
    await page.getByRole("link", { name: /new plan/i }).first().click();

    await page.getByLabel(/plan name/i).fill("Weekly filter check");
    await page.getByLabel(/^site/i).selectOption({ label: "West Depot" });
    await page.getByLabel(/^every/i).fill("1");
    await page.getByLabel(/unit/i).selectOption("week");
    await page.getByLabel(/schedule type/i).selectOption("floating");
    const today = new Date().toISOString().slice(0, 10);
    await page.getByLabel(/first due date/i).fill(today);
    await page
      .locator("label", { hasText: "Terry Tech" })
      .locator('input[name="assigneeIds"]')
      .check();
    await submit(page);
    await page.waitForURL(/\/pm-plans\/\d+$/);
    await expect(page.getByRole("heading", { name: "Weekly filter check" })).toBeVisible();
  });

  test("scheduler generates the WO once; re-running creates no duplicate", async ({
    page,
  }) => {
    await login(page, CREDS.manager);
    await page.goto("/pm-plans");
    await page.getByRole("button", { name: /run scheduler now/i }).click();
    await page.waitForLoadState("networkidle");

    await page.goto("/work-orders");
    await expect(
      page.getByRole("link", { name: /Weekly filter check/ }),
    ).toHaveCount(1);

    // Idempotency: run again → still exactly one.
    await page.goto("/pm-plans");
    await page.getByRole("button", { name: /run scheduler now/i }).click();
    await page.waitForLoadState("networkidle");
    await page.goto("/work-orders");
    await expect(
      page.getByRole("link", { name: /Weekly filter check/ }),
    ).toHaveCount(1);

    // Plan history shows the generated WO.
    await page.goto("/pm-plans");
    await page.getByRole("link", { name: "Weekly filter check" }).click();
    await page.waitForURL(/\/pm-plans\/\d+$/);
    await expect(page.getByText(/generated work orders/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /WO-\d+ · due/ })).toHaveCount(1);
  });

  test("technician completes the PM work; floating next-due re-anchors", async ({
    page,
  }) => {
    await login(page, CREDS.tech);
    await page.goto("/work-orders?mine=1");
    await page.getByRole("link", { name: /Weekly filter check/ }).click();
    await page.waitForURL(/\/work-orders\/\d+$/);
    await expect(page.getByText("pm").first()).toBeVisible(); // source badge row
    await page.getByRole("button", { name: /start work/i }).click();
    await page.getByRole("button", { name: /mark completed/i }).click();
    await page.getByRole("button", { name: /complete work order/i }).click();
    await expect(page.getByText("Completed").first()).toBeVisible();

    // Next due moved a week out; scheduler run creates nothing new.
    await login(page, CREDS.manager);
    await page.goto("/pm-plans");
    await page.getByRole("button", { name: /run scheduler now/i }).click();
    await page.waitForLoadState("networkidle");
    await page.goto("/work-orders?done=1");
    await expect(
      page.getByRole("link", { name: /Weekly filter check/ }),
    ).toHaveCount(1);
    await page.goto("/pm-plans");
    await expect(page.getByText(/overdue/)).toHaveCount(0);
  });

  test("technician cannot open PM plans", async ({ page }) => {
    await login(page, CREDS.tech);
    await page.goto("/pm-plans");
    await page.waitForURL("**/forbidden");
  });
});
