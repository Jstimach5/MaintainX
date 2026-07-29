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

test.describe.serial("Scenario E — downtime planning", () => {
  test("manager schedules downtime work; timeline shows it highlighted", async ({
    page,
  }) => {
    await login(page, CREDS.manager);
    await page.goto("/work-orders/new");
    await page.getByLabel(/^title/i).fill("Compressor teardown (downtime)");
    await page.getByLabel(/^site/i).selectOption({ label: "West Depot" });
    // Pick the Air Compressor asset at that site.
    await page
      .locator("label", { hasText: "Air Compressor" })
      .locator('input[name="assetIds"]')
      .check();
    await page
      .locator("label", { hasText: "Terry Tech" })
      .locator('input[name="assigneeIds"]')
      .check();
    const today = new Date().toISOString().slice(0, 10);
    await page.getByLabel(/planned start/i).fill(`${today}T08:00`);
    await page.getByLabel(/^due/i).fill(`${today}T17:00`);
    await page.getByLabel(/planned downtime/i).fill("240");
    await submit(page);
    await page.waitForURL(/\/work-orders\/\d+$/);

    // Timeline view shows the downtime bar (purple class family).
    await page.goto("/schedule?view=timeline");
    const bar = page.getByRole("link", { name: /Compressor teardown/ });
    await expect(bar).toBeVisible();
    await expect(bar).toHaveClass(/purple/);
    // Calendar shows it on today's cell too.
    await page.goto("/schedule?view=calendar");
    await expect(
      page.getByRole("link", { name: /Compressor teardown/ }),
    ).toBeVisible();
  });

  test("starting the work takes the asset down; completing restores it and records downtime", async ({
    page,
  }) => {
    await login(page, CREDS.tech);
    // An earlier spec left this asset "out of repair" — the automation only
    // moves ONLINE assets into downtime, so reset it first (tech can).
    await page.goto("/assets");
    await page.getByRole("link", { name: /Air Compressor/ }).click();
    await page.waitForURL(/\/assets\/\d+$/);
    await page.getByLabel(/new status/i).selectOption("online");
    await page.getByRole("button", { name: /update status/i }).click();
    await page.waitForURL(/\/assets\/\d+$/);

    await page.goto("/work-orders?mine=1");
    await page.getByRole("link", { name: /Compressor teardown/ }).click();
    await page.waitForURL(/\/work-orders\/\d+$/);
    await page.getByRole("button", { name: /start work/i }).click();
    await expect(page.getByText("In progress").first()).toBeVisible();

    // Asset went into planned downtime.
    await page.goto("/assets");
    await page.getByRole("link", { name: /Air Compressor/ }).click();
    await page.waitForURL(/\/assets\/\d+$/);
    await expect(page.locator("span", { hasText: /^Planned downtime$/ }).first()).toBeVisible();

    // Complete with actual downtime.
    await page.goto("/work-orders?mine=1");
    await page.getByRole("link", { name: /Compressor teardown/ }).click();
    await page.getByRole("button", { name: /mark completed/i }).click();
    await page.getByLabel(/completion notes/i).fill("Rebuilt head, replaced gaskets.");
    await page.getByLabel(/actual downtime/i).fill("210");
    await page.getByRole("button", { name: /complete work order/i }).click();
    await expect(page.getByText("Completed").first()).toBeVisible();
    await expect(page.getByText(/3h 30m/)).toBeVisible(); // 210 min actual downtime

    // Asset is back online with the transition in its history.
    await page.goto("/assets");
    await page.getByRole("link", { name: /Air Compressor/ }).click();
    await expect(page.locator("span", { hasText: /^Online$/ }).first()).toBeVisible();
    await expect(page.getByText(/planned downtime → online/i)).toBeVisible();
  });
});

test.describe.serial("Scenario F — permission boundaries", () => {
  test("requester cannot manage assets, work orders, or admin pages", async ({
    page,
  }) => {
    await login(page, CREDS.requester);
    for (const path of ["/assets", "/assets/new", "/work-orders", "/procedures", "/pm-plans", "/meters", "/schedule", "/reports", "/imports", "/admin/users", "/admin/audit", "/admin/settings"]) {
      await page.goto(path);
      await page.waitForURL("**/forbidden");
    }
  });

  test("technician cannot access administrative or manager-only settings", async ({
    page,
  }) => {
    await login(page, CREDS.tech);
    for (const path of ["/admin/users", "/admin/teams", "/admin/audit", "/admin/settings", "/imports", "/procedures", "/pm-plans", "/assets/new", "/work-orders/new"]) {
      await page.goto(path);
      await page.waitForURL("**/forbidden");
    }
  });

  test("manager cannot perform administrator-only actions", async ({ page }) => {
    await login(page, CREDS.manager);
    for (const path of ["/admin/users", "/admin/audit", "/admin/settings", "/imports", "/sites/new", "/assets/new"]) {
      await page.goto(path);
      await page.waitForURL("**/forbidden");
    }
  });

  test("unauthorized users cannot download private attachments", async ({
    browser,
  }) => {
    // Find a real attachment id while signed in…
    const authed = await browser.newPage();
    await login(authed, CREDS.tech);
    await authed.goto("/assets");
    await authed.getByRole("link", { name: /Air Compressor/ }).click();
    await authed.waitForURL(/\/assets\/\d+$/);
    const src = await authed
      .locator('img[src^="/files/"]')
      .first()
      .getAttribute("src");
    await authed.close();
    expect(src).toBeTruthy();

    // …then fetch it with no session at all.
    const anon = await browser.newPage();
    const res = await anon.request.get(src!);
    expect(res.status()).toBe(401);
    await anon.close();
  });

  test("the public portal exposes no internal data", async ({ page }) => {
    // Portal enabled for West Depot in the 50- spec run.
    await login(page, CREDS.admin);
    await page.goto("/sites");
    await page.getByRole("link", { name: "West Depot" }).click();
    await page.waitForURL(/\/sites\/\d+$/);
    const tokenText = await page.locator("p.font-mono").textContent();
    const portalPath = tokenText!.trim();
    await page.getByRole("button", { name: /sign out/i }).click();
    await page.waitForURL("**/login");

    await page.goto(portalPath);
    const body = await page.content();
    // No work-order numbers, no user names, no request history.
    expect(body).not.toMatch(/WO-\d{4}/);
    expect(body).not.toContain("Terry Tech");
    expect(body).not.toContain("REQ-");
    await expect(page.getByRole("heading", { name: /maintenance request/i })).toBeVisible();
  });
});
