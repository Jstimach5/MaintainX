import { test, expect, type Page } from "@playwright/test";
import { CREDS, ensureBaseData } from "./fixtures";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

async function login(page: Page, creds: { username: string; password: string }) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
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

test.describe.serial("assets", () => {
  test("admin creates an asset with site and location", async ({ page }) => {
    await login(page, CREDS.admin);

    // Ensure a site + location exist (idempotent if sites.spec ran first).
    await page.goto("/sites");
    const hasSite = (await page.getByRole("link", { name: "West Depot" }).count()) > 0;
    if (!hasSite) {
      await page.getByRole("link", { name: /add site/i }).first().click();
      await page.getByLabel(/site name/i).fill("West Depot");
      await submit(page);
      await page.waitForURL(/\/sites\/\d+$/);
      await page.getByRole("link", { name: /add location/i }).first().click();
      await page.getByLabel(/location name/i).fill("Bay 1");
      await submit(page);
      await page.waitForURL(/\/sites\/\d+$/);
    }

    await page.goto("/assets/new");
    await page.getByLabel(/^name/i).fill("Air Compressor");
    await page.getByLabel(/asset type/i).fill("Compressor");
    await page.getByLabel(/^site/i).selectOption({ label: "West Depot" });
    await page.getByLabel(/^location/i).selectOption({ label: "Bay 1" });
    await page.getByLabel(/serial number/i).fill("SN-998877");
    await submit(page);

    await page.waitForURL(/\/assets\/\d+$/);
    await expect(
      page.getByRole("heading", { name: /A-\d+ · Air Compressor/ }),
    ).toBeVisible();
    await expect(page.getByText("West Depot › Bay 1 › Compressor")).toBeVisible();
  });

  test("status change writes visible history", async ({ page }) => {
    await login(page, CREDS.admin);
    await page.goto("/assets");
    await page.getByRole("link", { name: /Air Compressor/ }).click();
    await page.waitForURL(/\/assets\/\d+$/);

    await page.getByLabel(/new status/i).selectOption("out_for_repair");
    await page.locator('input[name="note"]').first().fill("sent to vendor");
    await page.getByRole("button", { name: /update status/i }).click();
    await page.waitForURL(/\/assets\/\d+$/);

    await expect(page.getByText("Out for repair").first()).toBeVisible();
    await expect(page.getByText(/online → out for repair/i)).toBeVisible();
    await expect(page.getByText(/sent to vendor/)).toBeVisible();
  });

  test("photo upload appears and persists across reload", async ({ page }) => {
    await login(page, CREDS.admin);
    await page.goto("/assets");
    await page.getByRole("link", { name: /Air Compressor/ }).click();
    await page.waitForURL(/\/assets\/\d+$/);

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "damage.png",
      mimeType: "image/png",
      buffer: PNG,
    });
    // Grid renders an <img> pointing at /files/<id> once the upload lands.
    const img = page.locator('img[src^="/files/"]').first();
    await expect(img).toBeVisible({ timeout: 15_000 });

    await page.reload();
    await expect(page.locator('img[src^="/files/"]').first()).toBeVisible();

    // The served file itself is real (HTTP 200, image content type).
    const src = await page
      .locator('img[src^="/files/"]')
      .first()
      .getAttribute("src");
    const res = await page.request.get(src!);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/png");
  });

  test("QR label page renders a scannable label", async ({ page }) => {
    await login(page, CREDS.admin);
    await page.goto("/assets");
    await page.getByRole("link", { name: /Air Compressor/ }).click();
    await page.waitForURL(/\/assets\/\d+$/);
    await page.getByRole("link", { name: /qr label/i }).click();
    await page.waitForURL(/\/assets\/\d+\/label$/);
    await expect(page.locator("svg").first()).toBeVisible();
    await expect(page.getByText(/^A-\d+$/).first()).toBeVisible();
  });

  test("technician can change status but cannot edit or create assets", async ({
    page,
  }) => {
    await login(page, CREDS.tech);
    await page.goto("/assets");
    await page.getByRole("link", { name: /Air Compressor/ }).click();
    await page.waitForURL(/\/assets\/\d+$/);
    // Status form is available to technicians…
    await expect(page.getByLabel(/new status/i)).toBeVisible();
    // …but admin controls are not.
    await expect(page.getByRole("link", { name: /^edit$/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /archive/i })).toHaveCount(0);
    // And server-side enforcement on the create form.
    await page.goto("/assets/new");
    await page.waitForURL("**/forbidden");
  });

  test("@mobile technician uploads a photo from a phone", async ({ page }) => {
    await login(page, CREDS.tech);
    await page.goto("/assets");
    await page.getByRole("link", { name: /Air Compressor/ }).click();
    await page.waitForURL(/\/assets\/\d+$/);
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "phone-photo.png",
      mimeType: "image/png",
      buffer: PNG,
    });
    await expect(page.locator('img[src^="/files/"]').nth(1)).toBeVisible({
      timeout: 15_000,
    });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
