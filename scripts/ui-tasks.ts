/**
 * Role-based task benchmark (docs/UI_BASELINE.md § Task baseline).
 *
 * Drives the realistic task scenarios for each role through the real UI and
 * records interaction cost per task: completion, wall-clock ms, clicks,
 * form-field touches, page navigations, and backtracks (revisits of a URL
 * already seen within the task). Scripted runs measure interaction cost —
 * NOT human time; ease ratings and confusion points are reviewer judgments
 * recorded in the doc alongside these numbers.
 *
 * MUTATES the database (creates sites/assets/users/WOs, completes work).
 * Run against the seeded dev DB and re-seed afterwards:
 *   npx tsx scripts/ui-tasks.ts && npm run db:seed
 *
 * Re-run after the pilot and after rollout with the same seed for
 * like-for-like deltas (results land in OUT_FILE, default
 * docs/ui-baseline/tasks.json; override e.g. OUT_FILE=docs/ui-after/tasks.json).
 */
import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const OUT_FILE = process.env.OUT_FILE ?? "docs/ui-baseline/tasks.json";
const EXECUTABLE = fs.existsSync("/opt/pw-browsers/chromium")
  ? "/opt/pw-browsers/chromium"
  : undefined;

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const LOGINS = {
  admin: { username: "admin", password: "admin-demo-123" },
  manager: { username: "morgan", password: "morgan-demo-123" },
  technician: { username: "taylor", password: "taylor-demo-123" },
  requester: { username: "riley", password: "riley-demo-123" },
} as const;

type Counters = {
  clicks: number;
  fields: number;
  navigations: number;
  backtracks: number;
};

/** Thin instrumented facade over Page — every interaction is counted. */
class Driver {
  readonly counters: Counters = { clicks: 0, fields: 0, navigations: 0, backtracks: 0 };
  private visited = new Set<string>();

  constructor(public page: Page) {
    page.on("framenavigated", (frame) => {
      if (frame !== page.mainFrame()) return;
      const url = new URL(frame.url());
      const key = url.pathname + url.search;
      this.counters.navigations++;
      if (this.visited.has(key)) this.counters.backtracks++;
      this.visited.add(key);
    });
  }

  async goto(p: string) {
    await this.page.goto(BASE_URL + p, { waitUntil: "load" });
  }
  async click(locator: ReturnType<Page["locator"]>) {
    this.counters.clicks++;
    await locator.click();
  }
  async fill(locator: ReturnType<Page["locator"]>, value: string) {
    this.counters.fields++;
    await locator.fill(value);
  }
  async select(locator: ReturnType<Page["locator"]>, label: string) {
    this.counters.fields++;
    await locator.selectOption({ label });
  }
  async upload(locator: ReturnType<Page["locator"]>, name: string) {
    this.counters.fields++;
    await locator.setInputFiles({ name, mimeType: "image/png", buffer: PNG });
  }
}

/**
 * Header destinations that live inside a disclosure group after the
 * redesign. Opening the group is a real click and is counted as one — the
 * grouping trades a click for a header that no longer overflows, and the
 * benchmark has to show both sides of that trade.
 */
const NAV_GROUP_OF: Record<string, string> = {
  Dashboard: "Work",
  Schedule: "Work",
  "Work orders": "Work",
  Reports: "Work",
  Meters: "Maintenance",
  PM: "Maintenance",
  Procedures: "Maintenance",
  Assets: "Assets",
  Sites: "Assets",
  Locations: "Assets",
  Imports: "Assets",
  Audit: "Assets",
  Users: "Admin",
  Teams: "Admin",
  Settings: "Admin",
};

/** Click a primary-nav destination, opening its group first if it has one. */
async function navTo(d: Driver, label: string): Promise<void> {
  const banner = d.page.getByRole("banner");
  const exact = new RegExp(`^${label}$`, "i");
  const direct = banner.getByRole("link", { name: exact });
  if (await direct.isVisible().catch(() => false)) {
    await d.click(direct);
    return;
  }
  const group = NAV_GROUP_OF[label];
  if (!group) throw new Error(`navTo: no group known for "${label}"`);
  const trigger = banner.getByRole("button", {
    name: new RegExp(`^${group}$`, "i"),
  });
  await d.click(trigger);
  if ((await trigger.getAttribute("aria-expanded")) !== "true") {
    await d.click(trigger); // hydration race: the first click was dropped
  }
  await d.click(banner.getByRole("link", { name: exact }));
}

type TaskResult = {
  role: string;
  task: string;
  completed: boolean;
  ms: number;
  error?: string;
} & Counters;

async function login(browser: Browser, role: keyof typeof LOGINS): Promise<Page> {
  const ctx = await browser.newContext({ baseURL: BASE_URL, viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto("/login", { waitUntil: "load" });
  await page.getByLabel(/username/i).fill(LOGINS[role].username);
  await page.getByLabel(/password/i).fill(LOGINS[role].password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/dashboard");
  return page;
}

/** Mobile-viewport session for the technician/requester field tasks. */
async function loginMobile(browser: Browser, role: keyof typeof LOGINS): Promise<Page> {
  const ctx = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await page.goto("/login", { waitUntil: "load" });
  await page.getByLabel(/username/i).fill(LOGINS[role].username);
  await page.getByLabel(/password/i).fill(LOGINS[role].password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/dashboard");
  return page;
}

type Task = {
  role: keyof typeof LOGINS;
  name: string;
  mobile?: boolean;
  run: (d: Driver) => Promise<void>;
};

const TASKS: Task[] = [
  {
    role: "admin",
    name: "create site, location, asset",
    run: async (d) => {
      const { page } = d;
      // Site
      await navTo(d, "Sites");
      await page.waitForURL("**/sites");
      await d.click(page.getByRole("link", { name: /new site|add site/i }).first());
      await d.fill(page.getByLabel(/name/i).first(), "North Annex");
      await d.click(page.getByRole("button", { name: /create|save/i }).first());
      await page.waitForURL(/\/sites\/\d+/, { timeout: 15_000 });
      // Location under it
      await d.click(page.getByRole("link", { name: /add location/i }).first());
      await d.fill(page.getByLabel(/location name/i).first(), "Storage Bay");
      await d.click(page.getByRole("button", { name: /add location/i }).first());
      await page.waitForURL(/\/sites\/\d+$/, { timeout: 15_000 });
      // Asset in it
      await navTo(d, "Assets");
      await page.waitForURL("**/assets");
      await d.click(page.getByRole("link", { name: /add asset/i }).first());
      await d.fill(page.getByLabel(/^name/i).first(), "Dehumidifier N1");
      await d.select(page.getByLabel(/site/i).first(), "North Annex");
      await d.click(page.getByRole("button", { name: /create|save/i }).first());
      await page.waitForURL(/\/assets\/\d+/, { timeout: 15_000 });
    },
  },
  {
    role: "admin",
    name: "invite a user",
    run: async (d) => {
      const { page } = d;
      await navTo(d, "Users");
      await page.waitForURL("**/admin/users");
      await d.click(page.getByRole("link", { name: /invite/i }).first());
      await d.fill(page.getByLabel(/username/i).first(), "newtech");
      await d.fill(page.getByLabel(/display name/i).first(), "New Tech");
      await d.click(page.getByRole("button", { name: /create|invite|generate/i }).first());
      await page.getByText(/invite|link|copy/i).first().waitFor({ timeout: 15_000 });
    },
  },
  {
    role: "admin",
    name: "locate asset, open QR label",
    run: async (d) => {
      const { page } = d;
      await navTo(d, "Assets");
      await page.waitForURL("**/assets");
      await d.fill(page.getByPlaceholder(/search/i).first(), "compressor");
      await d.click(page.getByRole("button", { name: /filter/i }).first());
      await d.click(page.getByRole("link", { name: /Air Compressor 1/ }).first());
      await page.waitForURL(/\/assets\/\d+$/);
      await d.click(page.getByRole("link", { name: /qr label/i }).first());
      await page.waitForURL(/\/assets\/\d+\/label/);
    },
  },
  {
    role: "manager",
    name: "find overdue work",
    run: async (d) => {
      const { page } = d;
      // Overdue WO-0002 surfaces on the dashboard "Due soon" list in red.
      await d.click(page.getByRole("link", { name: /Repair labeler jam sensor/ }).first());
      await page.waitForURL(/\/work-orders\/\d+/);
    },
  },
  {
    role: "manager",
    name: "create, assign, schedule a work order",
    run: async (d) => {
      const { page } = d;
      await navTo(d, "Work orders");
      await page.waitForURL("**/work-orders");
      await d.click(page.getByRole("link", { name: /new work order/i }).first());
      await d.fill(page.getByLabel(/title/i).first(), "Inspect dock door seals");
      await d.select(page.getByLabel(/site/i).first(), "West Depot");
      await d.select(page.getByLabel(/priority/i).first(), "High");
      await d.click(page.getByRole("checkbox", { name: /Terry Tech/ }).first());
      await d.fill(page.locator("#dueAt"), "2026-08-15T10:00");
      await d.click(page.getByRole("button", { name: /create|save/i }).first());
      await page.waitForURL(/\/work-orders\/\d+/, { timeout: 15_000 });
    },
  },
  {
    role: "manager",
    name: "review upcoming preventive maintenance",
    run: async (d) => {
      const { page } = d;
      await navTo(d, "PM");
      await page.waitForURL("**/pm-plans");
      await d.click(page.getByRole("link", { name: /Quarterly belt inspection/ }).first());
      await page.waitForURL(/\/pm-plans\/\d+/);
    },
  },
  {
    role: "technician",
    name: "find today's assigned work, open it, start work",
    mobile: true,
    run: async (d) => {
      const { page } = d;
      // Field home → All my work → assigned WO → Start.
      await d.click(page.getByRole("link", { name: /Quarterly belt inspection/ }).first());
      await page.waitForURL(/\/work-orders\/\d+/);
      await d.click(page.getByRole("button", { name: /start work/i }).first());
      await page.getByText(/in progress/i).first().waitFor({ timeout: 15_000 });
    },
  },
  {
    role: "technician",
    name: "add note, meter reading, photo; complete the WO",
    mobile: true,
    run: async (d) => {
      const { page } = d;
      // WO-0003 (in progress, compressor asset with a meter).
      await d.click(page.getByRole("link", { name: /Compressor intake filter swap/ }).first());
      await page.waitForURL(/\/work-orders\/\d+/);
      // Forms on this page are client actions — wait out hydration so the
      // first click isn't dropped (same wait in every run; no bias).
      await page.waitForLoadState("networkidle").catch(() => {});
      // Note (comment)
      await d.fill(page.getByPlaceholder(/comment/i).first(), "Swapped filter, seals look good.");
      await d.click(page.getByRole("button", { name: /^comment$/i }).first());
      await page.getByText(/Swapped filter/).first().waitFor({ timeout: 15_000 });
      // Meter reading from the job page
      const reading = page.getByLabel(/new reading|reading/i).first();
      await reading.scrollIntoViewIfNeeded();
      await d.fill(reading, "4444");
      await d.click(page.getByRole("button", { name: /^record$/i }).first());
      await page.getByText(/4444/).first().waitFor({ timeout: 15_000 });
      // Photo
      await d.upload(page.locator('input[type="file"]').first(), "after.png");
      await page.getByText(/after\.png|uploaded|just now/i).first().waitFor({ timeout: 20_000 }).catch(() => {});
      // Complete (mobile sticky bar) → sheet → submit
      await d.click(page.getByRole("button", { name: /^complete$/i }).first());
      await d.fill(page.getByLabel(/completion notes/i).first(), "Done; ran 10 min, no leaks.");
      await d.click(page.getByRole("button", { name: /complete work order/i }).first());
      await page.getByText(/completed/i).first().waitFor({ timeout: 15_000 });
    },
  },
  {
    role: "requester",
    name: "submit a maintenance request",
    mobile: true,
    run: async (d) => {
      const { page } = d;
      await d.click(page.getByRole("link", { name: /new request/i }).first());
      await page.waitForURL("**/requests/new");
      await d.fill(page.getByLabel(/what needs attention/i).first(), "Hallway light flickering");
      await d.select(page.getByLabel(/site/i).first(), "Main Plant");
      await d.click(page.getByRole("button", { name: /submit/i }).first());
      await page.waitForURL(/\/requests(\/\d+)?/, { timeout: 15_000 });
    },
  },
  {
    role: "requester",
    name: "find the request later, check status",
    mobile: true,
    run: async (d) => {
      const { page } = d;
      await d.click(page.getByRole("navigation", { name: /field navigation/i }).getByRole("link", { name: /requests/i }));
      await page.waitForURL("**/requests");
      await d.click(page.getByRole("link", { name: /Hallway light flickering/ }).first());
      await page.waitForURL(/\/requests\/\d+/);
      await page.getByText(/submitted|under review/i).first().waitFor({ timeout: 15_000 });
    },
  },
];

async function main() {
  const browser = await chromium.launch(EXECUTABLE ? { executablePath: EXECUTABLE } : {});
  const results: TaskResult[] = [];

  for (const task of TASKS) {
    const page = task.mobile ? await loginMobile(browser, task.role) : await login(browser, task.role);
    const d = new Driver(page);
    // Login/goto-dashboard is excluded from counters: reset after warm-up.
    d.counters.clicks = 0;
    d.counters.fields = 0;
    d.counters.navigations = 0;
    d.counters.backtracks = 0;
    const t0 = Date.now();
    let completed = true;
    let error: string | undefined;
    try {
      await task.run(d);
    } catch (err) {
      completed = false;
      error = (err as Error).message.split("\n")[0];
    }
    const ms = Date.now() - t0;
    results.push({ role: task.role, task: task.name, completed, ms, ...d.counters, error });
    process.stdout.write(
      `${completed ? "PASS" : "FAIL"} ${task.role.padEnd(10)} ${task.name.padEnd(48)} ${String(ms).padStart(6)}ms clicks=${d.counters.clicks} fields=${d.counters.fields} navs=${d.counters.navigations} back=${d.counters.backtracks}${error ? `  (${error})` : ""}\n`,
    );
    await page.context().close();
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
  console.log(`\nResults → ${OUT_FILE}`);
  console.log("NOTE: this run mutated data — re-seed with `npm run db:seed`.");
  await browser.close();
  if (results.some((r) => !r.completed)) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
