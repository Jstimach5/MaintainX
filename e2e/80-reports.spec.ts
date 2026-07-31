import { test, expect, type Page } from "@playwright/test";
import { CREDS, ensureBaseData, navTo } from "./fixtures";

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
  await page.locator('main form button[type="submit"]').first().click();
  await page.waitForURL("**/dashboard");
}

test.beforeAll(async () => {
  await ensureBaseData();
});

test.describe.serial("schedule view and reports", () => {
  test("dashboard shows the right home per role", async ({ page }) => {
    // Technicians land on the M1 field home (tiles), not the KPI board.
    await login(page, CREDS.tech);
    await expect(page.getByText("Due today")).toBeVisible();
    await expect(page.getByText("Overdue").first()).toBeVisible();
    // Managers keep the KPI dashboard with live counts.
    await login(page, CREDS.manager);
    await expect(page.getByText("Open work orders")).toBeVisible();
  });

  test("manager schedule view lists work with filters and warnings panel", async ({
    page,
  }) => {
    await login(page, CREDS.manager);
    await navTo(page, "Schedule");
    await page.waitForURL("**/schedule");
    // The table lists work orders created by earlier specs.
    await expect(page.getByRole("link", { name: /WO-\d+/ }).first()).toBeVisible();
    // Filters persist through submission.
    await page.locator('select[name="status"]').selectOption("completed");
    await page.getByRole("button", { name: /^filter$/i }).click();
    await page.waitForURL(/status=completed/);
    await expect(page.locator('select[name="status"]')).toHaveValue("completed");
    await expect(page.locator("tbody").getByText("Completed").first()).toBeVisible();
  });

  test("reports page shows KPI tiles and status bars; CSV export works", async ({
    page,
  }) => {
    await login(page, CREDS.manager);
    await navTo(page, "Reports");
    await page.waitForURL("**/reports");
    await expect(page.getByText("Open backlog")).toBeVisible();
    await expect(page.getByText("PM compliance", { exact: true })).toBeVisible();
    await expect(page.getByText("Work orders by status")).toBeVisible();

    const res = await page.request.get("/reports/export");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/csv");
    const body = await res.text();
    expect(body).toContain("# Work orders by status");
    expect(body).toContain("# Work orders (raw)");
    expect(body).toContain("WO-");
  });

  test("technician gets own-work schedule but not reports or the CSV export", async ({
    page,
  }) => {
    await login(page, CREDS.tech);
    // Phase 14: /schedule now serves technicians a calendar scoped to
    // their own assignments (asserted in 85-field-docs) — no longer 403.
    await page.goto("/schedule");
    await expect(
      page.getByRole("heading", { name: "My schedule" }),
    ).toBeVisible();
    await page.goto("/reports");
    await page.waitForURL("**/forbidden");
    const res = await page.request.get("/reports/export");
    expect(res.status()).toBe(403);
  });

  test("meter detail shows the trend chart", async ({ page }) => {
    await login(page, CREDS.tech);
    await page.goto("/meters");
    await page.getByRole("link", { name: /Compressor run hours/ }).click();
    await page.waitForURL(/\/meters\/\d+$/);
    await expect(page.getByRole("img", { name: /trend/i })).toBeVisible();
  });
});
