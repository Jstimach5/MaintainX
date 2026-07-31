import { test, expect, type Page } from "@playwright/test";
import { CREDS, ensureBaseData } from "./fixtures";

/**
 * The redesigned application shell: grouped disclosure navigation, the
 * breadcrumb trail, the locations index, the designed forbidden page, and
 * the confirmation dialogs that gate irreversible actions.
 *
 * These cover behaviour the feature specs never touch — they use `navTo`
 * to *get* somewhere, so nothing exercises the nav's own contract.
 */

test.beforeAll(async () => {
  await ensureBaseData();
});

async function login(page: Page, creds: { username: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel(/username/i).fill(creds.username);
  await page.getByLabel(/^password/i).fill(creds.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/dashboard");
}

function nav(page: Page) {
  return page.getByRole("navigation", { name: "Primary" });
}

/** The trigger is a client component; a pre-hydration click is dropped. */
async function openGroup(page: Page, label: string) {
  const trigger = nav(page).getByRole("button", { name: label });
  await trigger.click();
  if ((await trigger.getAttribute("aria-expanded")) !== "true") {
    await trigger.click();
  }
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  return trigger;
}

test.describe("primary navigation (disclosure pattern)", () => {
  test("a group opens, exposes its links, and closes on a second click", async ({
    page,
  }) => {
    await login(page, CREDS.admin);
    const trigger = nav(page).getByRole("button", { name: "Assets" });

    // Closed is the initial state, and closed means the links are gone from
    // the accessibility tree, not merely hidden.
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(nav(page).getByRole("link", { name: "Imports" })).toHaveCount(0);

    await openGroup(page, "Assets");
    for (const label of ["Assets", "Sites", "Locations", "Imports", "Audit"]) {
      await expect(nav(page).getByRole("link", { name: label })).toBeVisible();
    }
    // aria-controls must resolve to the panel that actually appeared.
    // (Attribute selector, not `#id`: React's useId emits guillemets.)
    const panelId = await trigger.getAttribute("aria-controls");
    expect(panelId).toBeTruthy();
    await expect(page.locator(`[id="${panelId}"]`)).toBeVisible();

    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(nav(page).getByRole("link", { name: "Imports" })).toHaveCount(0);
  });

  test("Escape closes the panel and returns focus to its trigger", async ({
    page,
  }) => {
    await login(page, CREDS.admin);
    const trigger = await openGroup(page, "Maintenance");
    await page.keyboard.press("Escape");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    // Focus must come back to the trigger — otherwise a keyboard user is
    // dumped at the top of the document.
    await expect(trigger).toBeFocused();
  });

  test("clicking outside closes the panel", async ({ page }) => {
    await login(page, CREDS.admin);
    const trigger = await openGroup(page, "Work");
    // Left gutter, well below the header — page chrome, not a control.
    await page.mouse.click(2, 400);
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  test("navigating closes the panel and marks the destination current", async ({
    page,
  }) => {
    await login(page, CREDS.admin);
    const trigger = await openGroup(page, "Assets");
    await nav(page).getByRole("link", { name: "Locations" }).click();
    await page.waitForURL("**/locations");

    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    // The group reads as active, and inside it the exact page is current.
    await expect(trigger).toHaveClass(/text-brand-300/);
    await openGroup(page, "Assets");
    await expect(
      nav(page).getByRole("link", { name: "Locations" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      nav(page).getByRole("link", { name: "Sites" }),
    ).not.toHaveAttribute("aria-current", "page");
  });

  test("a detail page still marks its list as the current section", async ({
    page,
  }) => {
    await login(page, CREDS.admin);
    // /sites/<id> is not /sites, but it belongs to the Sites section — the
    // prefix match is what keeps a reader oriented on every record page.
    await ensureSite(page);
    await openGroup(page, "Assets");
    await expect(
      nav(page).getByRole("link", { name: "Sites" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      nav(page).getByRole("link", { name: "Assets", exact: true }),
    ).not.toHaveAttribute("aria-current", "page");
  });

  test("a one-item group degrades to a plain link for a technician", async ({
    page,
  }) => {
    await login(page, CREDS.tech);
    // Technicians see only Meters under Maintenance, so there is no
    // dropdown holding a single destination — it is a link.
    await expect(
      nav(page).getByRole("button", { name: "Maintenance" }),
    ).toHaveCount(0);
    await expect(nav(page).getByRole("link", { name: "Meters" })).toBeVisible();
    // And a group with nothing visible disappears entirely.
    await expect(nav(page).getByRole("button", { name: "Admin" })).toHaveCount(0);
    await expect(nav(page).getByRole("link", { name: "Reports" })).toHaveCount(0);
  });

  test("a requester sees only what a requester can use", async ({ page }) => {
    await login(page, CREDS.requester);
    await expect(nav(page).getByRole("link", { name: "Requests" })).toBeVisible();
    await expect(nav(page).getByRole("link", { name: "Dashboard" })).toBeVisible();
    for (const gone of ["Work orders", "Assets", "Sites", "Meters", "Users"]) {
      await expect(nav(page).getByRole("link", { name: gone })).toHaveCount(0);
    }
  });
});

/**
 * Open a site detail page, creating a site first if the suite hasn't. These
 * specs must prove something when run alone, not skip themselves quiet.
 */
async function ensureSite(page: Page): Promise<void> {
  await page.goto("/sites");
  const existing = page.locator('main a[href^="/sites/"]').filter({
    hasNotText: /add site/i,
  });
  if (await existing.count()) {
    await existing.first().click();
  } else {
    await page.goto("/sites/new");
    await page.getByLabel(/site name/i).fill("Nav Spec Site");
    await page.locator('main form button[type="submit"]').click();
  }
  await page.waitForURL(/\/sites\/\d+$/);
}

/** Site detail with the public portal switched on, so a ConfirmSubmit exists. */
async function siteWithPortalOn(page: Page): Promise<void> {
  await ensureSite(page);
  const enable = page.getByRole("button", {
    name: /enable public request portal/i,
  });
  if (await enable.count()) {
    await enable.click();
    await expect(
      page.getByRole("button", { name: /^disable portal$/i }),
    ).toBeVisible();
  }
}

test.describe("wayfinding", () => {
  test("the locations index lists every site's tree", async ({ page }) => {
    await login(page, CREDS.admin);
    await ensureSite(page);
    await page.goto("/locations");
    await expect(
      page.getByRole("heading", { name: "Locations", level: 1 }),
    ).toBeVisible();
    // Every site gets a card, and each card's heading links to the site.
    const cards = page.locator('main a[href^="/sites/"]');
    expect(await cards.count()).toBeGreaterThan(0);

    // Nesting, when 10-sites.spec.ts has run: this page exists so nobody has
    // to open each site in turn to find where a location lives.
    const plant = page.getByRole("link", { name: "Main Plant" });
    if (await plant.count()) {
      await expect(page.getByText("Building A").first()).toBeVisible();
      await expect(page.getByText("Room 101").first()).toBeVisible();
    }
    await cards.first().click();
    await page.waitForURL(/\/sites\/\d+$/);
  });

  test("a request detail page shows its site trail", async ({ page }) => {
    await login(page, CREDS.admin);
    // Submit the request here rather than reusing a seeded one: site is a
    // required field, so a request made through the form is guaranteed to
    // have a trail to render. Otherwise this test passes by finding nothing.
    await ensureSite(page);
    await page.goto("/requests/new");
    await page.getByLabel(/what needs attention/i).fill("Breadcrumb check");
    // The site select only auto-picks when there is exactly one site, so
    // choose explicitly — otherwise this passes or hangs depending on how
    // much of the suite ran first.
    const site = page.locator("select#siteId");
    const values = (
      await site.locator("option").evaluateAll((os) =>
        os.map((o) => (o as HTMLOptionElement).value),
      )
    ).filter(Boolean);
    expect(values.length).toBeGreaterThan(0);
    await site.selectOption(values[0]);
    await page.locator("main form").getByRole("button", { name: /submit/i }).click();
    await page.waitForURL(/\/requests\/\d+$/);

    const crumb = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(crumb).toBeVisible();
    await expect(crumb.locator("li").first()).not.toBeEmpty();
  });

  test("a blocked page explains itself and offers a way out", async ({ page }) => {
    await login(page, CREDS.requester);
    await page.goto("/admin/users");
    await page.waitForURL("**/forbidden");
    await expect(
      page.getByRole("heading", { name: /not allowed/i }),
    ).toBeVisible();
    // The page has to be a route out, not a dead end.
    await page.getByRole("link", { name: /back to dashboard/i }).click();
    await page.waitForURL("**/dashboard");
  });
});

// Serial: these three share one site's portal flag — cancel/Escape must
// leave it enabled for the next test, and the last one turns it back off.
test.describe.serial("confirmation dialogs", () => {
  test("the trigger submits nothing; cancel leaves the record alone", async ({
    page,
  }) => {
    await login(page, CREDS.admin);
    await siteWithPortalOn(page);
    const trigger = page.getByRole("button", { name: /^disable portal$/i });
    await expect(trigger).toBeVisible();

    // Opening the dialog must not perform the action.
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: /disable the public request portal/i }),
    ).toBeVisible();

    await dialog.getByRole("button", { name: /^cancel$/i }).click();
    await expect(dialog).toBeHidden();
    await page.reload();
    await expect(
      page.getByRole("button", { name: /^disable portal$/i }),
    ).toBeVisible();
  });

  test("Escape dismisses the dialog without acting", async ({ page }) => {
    await login(page, CREDS.admin);
    await siteWithPortalOn(page);
    const trigger = page.getByRole("button", { name: /^disable portal$/i });
    await trigger.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await page.reload();
    await expect(
      page.getByRole("button", { name: /^disable portal$/i }),
    ).toBeVisible();
  });

  test("confirming performs the action", async ({ page }) => {
    await login(page, CREDS.admin);
    await siteWithPortalOn(page);
    const trigger = page.getByRole("button", { name: /^disable portal$/i });
    await trigger.click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^disable portal$/i })
      .click();
    // The form really submitted: the portal is off after a round trip.
    await expect(
      page.getByRole("button", { name: /enable public request portal/i }),
    ).toBeVisible();
  });
});
