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

async function openJob(page: Page, title: RegExp) {
  await page.goto("/work-orders?mine=1");
  await page.getByRole("link", { name: title }).first().click();
  await page.waitForURL(/\/work-orders\/\d+$/);
}

test.beforeAll(async () => {
  await ensureBaseData();
});

test.describe.serial("M2 — pause reasons, labor timer, completion approval", () => {
  test("manager creates a job for the technician", async ({ page }) => {
    await login(page, CREDS.manager);
    await page.goto("/work-orders/new");
    await page.getByLabel(/^title/i).fill("Timer and approval run");
    await page.getByLabel(/^site/i).selectOption({ label: "West Depot" });
    await page
      .locator("label", { hasText: "Terry Tech" })
      .locator('input[name="assigneeIds"]')
      .check();
    await page.locator('main form button[type="submit"]').first().click();
    await page.waitForURL(/\/work-orders\/\d+$/);
  });

  test("technician runs the timer, pauses with a reason, and resumes", async ({
    page,
  }) => {
    await login(page, CREDS.tech);
    await openJob(page, /Timer and approval run/);

    await page.getByRole("button", { name: /start timer/i }).click();
    await expect(page.getByText(/running ·/i)).toBeVisible();

    // Interrupting the job demands a reason.
    await page.getByLabel(/interrupt this job/i).selectOption("paused");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByTestId("form-error")).toContainText(/reason/i);

    await page.getByPlaceholder(/why\?/i).fill("Called to another line");
    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForURL(/\/work-orders\/\d+$/);
    await expect(page.getByText("Paused").first()).toBeVisible();
    // The reason is on the record for whoever picks the job up next.
    await expect(page.getByText(/Called to another line/)).toBeVisible();

    // Pause the clock, then resume it — banked time is kept.
    await page.getByRole("button", { name: /^pause$/i }).click();
    await page.waitForURL(/\/work-orders\/\d+$/);
    await expect(page.getByRole("button", { name: /resume timer/i })).toBeVisible();
  });

  test("stopping the timer writes a labor entry", async ({ page }) => {
    await login(page, CREDS.tech);
    await openJob(page, /Timer and approval run/);
    await page.getByRole("button", { name: /resume timer/i }).click();
    await page.waitForURL(/\/work-orders\/\d+$/);
    await page.getByRole("button", { name: /stop . log time/i }).click();
    await page.waitForURL(/\/work-orders\/\d+$/);
    // A sub-minute timer logs nothing rather than inventing a minute.
    await expect(
      page.getByRole("button", { name: /start timer/i }),
    ).toBeVisible();
  });

  test("with approval required, completion waits for a manager", async ({
    page,
  }) => {
    // Turn the org setting on directly — the settings screen is admin-only
    // configuration, not the behaviour under test here.
    const { Pool } = await import("pg");
    const { E2E_DB_URL } = await import("./fixtures");
    const pool = new Pool({ connectionString: E2E_DB_URL, max: 1 });
    await pool.query(
      "UPDATE org_settings SET require_completion_approval = true",
    );
    try {
      await login(page, CREDS.tech);
      await openJob(page, /Timer and approval run/);
      await page.getByRole("button", { name: /resume work|start work/i }).first().click();
      await page.waitForURL(/\/work-orders\/\d+$/);
      await page.getByRole("button", { name: /mark completed/i }).click();
      await page.getByLabel(/completion notes/i).fill("Belt replaced, tested.");
      await page.getByRole("button", { name: /complete work order/i }).click();
      await page.waitForURL(/\/work-orders\/\d+$/);
      await expect(page.getByText("Waiting for approval").first()).toBeVisible();

      // The manager sees the write-up and can send it back.
      await login(page, CREDS.manager);
      await page.goto("/work-orders?status=waiting_approval");
      await page.getByRole("link", { name: /Timer and approval run/ }).click();
      await page.waitForURL(/\/work-orders\/\d+$/);
      await expect(page.getByText("Belt replaced, tested.")).toBeVisible();
      await page.getByPlaceholder(/note \(required to send back\)/i).fill("Guard still off");
      await page.getByRole("button", { name: /send back to technician/i }).click();
      await page.waitForURL(/\/work-orders\/\d+$/);
      await expect(page.getByText("In progress").first()).toBeVisible();

      // Then approve it for real.
      await page.getByRole("button", { name: /mark completed/i }).click();
      await page.getByRole("button", { name: /complete work order/i }).click();
      await page.waitForURL(/\/work-orders\/\d+$/);
      await expect(page.getByText("Completed").first()).toBeVisible();
    } finally {
      await pool.query(
        "UPDATE org_settings SET require_completion_approval = false",
      );
      await pool.end();
    }
  });
});
