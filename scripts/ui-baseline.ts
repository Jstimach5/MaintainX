/**
 * Rendered-UI baseline capture (docs/UI_BASELINE.md evidence).
 *
 * Boots nothing itself — expects the app running at BASE_URL (default
 * http://localhost:3000) against a freshly seeded dev database
 * (`npm run db:migrate && npm run db:seed`, logins from scripts/seed.ts).
 *
 * For every (role × screen × viewport) in the inventory it saves a
 * viewport-clipped PNG (plus a full-page PNG where the page scrolls) under
 * docs/ui-baseline/<role>/<slug>--WxH[--full].png and records mechanical
 * metrics (horizontal overflow, main-column dead space, below-fold ratio)
 * into docs/ui-baseline/metrics.json.
 *
 * Mutation-free by design: it clicks only reveal-toggles (e.g. the WO
 * "Mark completed…" disclosure), never submits, so it can re-run on the
 * same seed and produce comparable captures. Re-run after the pilot and
 * after rollout with OUT_DIR=docs/ui-after to build before/after pairs.
 *
 * Usage: npx tsx scripts/ui-baseline.ts [--roles admin,tech] [--screens dashboard,...]
 */
import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const OUT_DIR = process.env.OUT_DIR ?? "docs/ui-baseline";
const EXECUTABLE = fs.existsSync("/opt/pw-browsers/chromium")
  ? "/opt/pw-browsers/chromium"
  : undefined;

const VIEWPORTS = [
  { w: 1440, h: 900, touch: false },
  { w: 1280, h: 800, touch: false },
  { w: 1024, h: 768, touch: false },
  { w: 768, h: 1024, touch: false },
  { w: 390, h: 844, touch: true },
  { w: 360, h: 800, touch: true },
] as const;

const MOBILE_ONLY = VIEWPORTS.filter((v) => v.touch);

type RoleKey = "admin" | "manager" | "technician" | "requester";
const LOGINS: Record<RoleKey, { username: string; password: string }> = {
  admin: { username: "admin", password: "admin-demo-123" },
  manager: { username: "morgan", password: "morgan-demo-123" },
  technician: { username: "taylor", password: "taylor-demo-123" },
  requester: { username: "riley", password: "riley-demo-123" },
};

/**
 * A screen to capture. `path` may be a literal path or a resolver that
 * navigates/derives the URL from seeded content (e.g. "the in-progress WO").
 * `prepare` runs after navigation for reveal-only interactions.
 */
type Screen = {
  slug: string;
  roles: RoleKey[] | "anon";
  viewports?: readonly { w: number; h: number; touch: boolean }[];
  path: string | ((page: Page) => Promise<string>);
  prepare?: (page: Page) => Promise<void>;
  note?: string;
};

/** Find a seeded record's detail URL by following its list-page link. */
function detailPath(listPath: string, linkText: string | RegExp) {
  return async (page: Page): Promise<string> => {
    await page.goto(BASE_URL + listPath, { waitUntil: "load" });
    const link = page.getByRole("link", { name: linkText }).first();
    await link.waitFor({ state: "visible", timeout: 15_000 });
    const href = await link.getAttribute("href");
    if (!href) throw new Error(`No href for ${String(linkText)} on ${listPath}`);
    return href;
  };
}

const SCREENS: Screen[] = [
  { slug: "login", roles: "anon", path: "/login" },
  { slug: "dashboard", roles: ["admin", "manager", "technician", "requester"], path: "/dashboard" },
  { slug: "schedule", roles: ["admin", "manager", "technician"], path: "/schedule" },
  { slug: "work-orders", roles: ["admin", "manager", "technician"], path: "/work-orders" },
  { slug: "work-orders-empty", roles: ["admin"], path: "/work-orders?q=zzzznothing" },
  {
    slug: "work-order-detail",
    roles: ["admin", "technician"],
    path: detailPath("/work-orders", /Compressor intake filter swap/),
    note: "in-progress WO with procedure-less panel, comment, photo, labor",
  },
  {
    slug: "work-order-complete-form",
    roles: ["technician"],
    viewports: MOBILE_ONLY,
    path: detailPath("/work-orders?mine=1", /Compressor intake filter swap/),
    prepare: async (page) => {
      // Reveal-only: opens the completion form without submitting.
      // Desktop says "Mark completed…", the mobile sticky bar says "Complete".
      const btn = page
        .getByRole("button", { name: /mark completed|^complete$/i })
        .first();
      if (await btn.isVisible().catch(() => false)) await btn.click();
      await page.waitForTimeout(300);
    },
  },
  { slug: "requests", roles: ["admin", "requester"], path: "/requests" },
  {
    slug: "request-detail",
    roles: ["manager", "requester"],
    path: detailPath("/requests", /Breakroom fridge leaking/),
  },
  { slug: "request-new", roles: ["requester"], viewports: MOBILE_ONLY, path: "/requests/new" },
  { slug: "assets", roles: ["admin", "technician"], path: "/assets" },
  { slug: "assets-empty", roles: ["admin"], path: "/assets?q=zzzznothing" },
  {
    slug: "asset-detail",
    roles: ["admin", "technician"],
    path: detailPath("/assets", /Air Compressor 1/),
    note: "photo attachment, meter, histories",
  },
  {
    slug: "site-detail",
    roles: ["admin"],
    path: detailPath("/sites", /Main Plant/),
  },
  { slug: "meters", roles: ["admin", "technician"], path: "/meters" },
  {
    slug: "meter-detail",
    roles: ["admin", "technician"],
    path: detailPath("/meters", /Compressor run hours/),
  },
  { slug: "pm-plans", roles: ["admin", "manager"], path: "/pm-plans" },
  { slug: "reports", roles: ["admin", "manager"], path: "/reports" },
  { slug: "admin-users", roles: ["admin"], path: "/admin/users" },
  { slug: "account", roles: ["technician"], viewports: MOBILE_ONLY, path: "/account" },
  { slug: "notifications", roles: ["technician"], viewports: MOBILE_ONLY, path: "/notifications" },
  { slug: "work-orders-mine", roles: ["technician"], viewports: MOBILE_ONLY, path: "/work-orders?mine=1" },
  { slug: "forbidden", roles: ["technician"], path: "/admin/users", note: "redirects to /forbidden" },
  { slug: "not-found", roles: ["admin"], viewports: [VIEWPORTS[1]], path: "/no-such-page" },
];

type Metric = {
  role: string;
  slug: string;
  viewport: string;
  url: string;
  title: string;
  overflowX: boolean;
  mainWidthPct: number | null;
  foldRatio: number;
  screenshot: string;
};

async function login(browser: Browser, role: RoleKey): Promise<string> {
  const ctx = await browser.newContext({ baseURL: BASE_URL });
  const page = await ctx.newPage();
  await page.goto("/login", { waitUntil: "load" });
  await page.getByLabel(/username/i).fill(LOGINS[role].username);
  await page.getByLabel(/password/i).fill(LOGINS[role].password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/dashboard", { timeout: 20_000 });
  const statePath = path.join(OUT_DIR, `.auth-${role}.json`);
  await ctx.storageState({ path: statePath });
  await ctx.close();
  return statePath;
}

async function measure(page: Page): Promise<Omit<Metric, "role" | "slug" | "viewport" | "url" | "screenshot">> {
  return page.evaluate(() => {
    const main = document.querySelector("main");
    const mainRect = main?.getBoundingClientRect();
    return {
      title: document.title,
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      mainWidthPct: mainRect ? Math.round((mainRect.width / window.innerWidth) * 100) : null,
      foldRatio: Math.round((document.documentElement.scrollHeight / window.innerHeight) * 100) / 100,
    };
  });
}

async function main() {
  const roleFilter = process.argv.find((a) => a.startsWith("--roles"))?.split("=")[1]?.split(",");
  const screenFilter = process.argv.find((a) => a.startsWith("--screens"))?.split("=")[1]?.split(",");

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch(EXECUTABLE ? { executablePath: EXECUTABLE } : {});
  const metrics: Metric[] = [];
  const authState: Partial<Record<RoleKey, string>> = {};

  for (const screen of SCREENS) {
    if (screenFilter && !screenFilter.includes(screen.slug)) continue;
    const roles: (RoleKey | "anon")[] = screen.roles === "anon" ? ["anon"] : screen.roles;
    for (const role of roles) {
      if (roleFilter && role !== "anon" && !roleFilter.includes(role)) continue;
      if (role !== "anon" && !authState[role]) authState[role] = await login(browser, role);

      // Resolve dynamic paths once per role in a desktop context.
      let target: string;
      if (typeof screen.path === "function") {
        const ctx = await browser.newContext({
          baseURL: BASE_URL,
          viewport: { width: 1280, height: 800 },
          storageState: role === "anon" ? undefined : authState[role as RoleKey],
        });
        const p = await ctx.newPage();
        try {
          target = await screen.path(p);
        } finally {
          await ctx.close();
        }
      } else {
        target = screen.path;
      }

      for (const vp of screen.viewports ?? VIEWPORTS) {
        const ctx: BrowserContext = await browser.newContext({
          baseURL: BASE_URL,
          viewport: { width: vp.w, height: vp.h },
          isMobile: vp.touch,
          hasTouch: vp.touch,
          deviceScaleFactor: vp.touch ? 2 : 1,
          storageState: role === "anon" ? undefined : authState[role as RoleKey],
        });
        const page = await ctx.newPage();
        try {
          await page.goto(target, { waitUntil: "load", timeout: 60_000 });
          await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
          if (screen.prepare) await screen.prepare(page);

          const roleDir = path.join(OUT_DIR, role);
          fs.mkdirSync(roleDir, { recursive: true });
          const base = `${screen.slug}--${vp.w}x${vp.h}`;
          const shot = path.join(roleDir, `${base}.png`);
          await page.screenshot({ path: shot });
          const m = await measure(page);
          if (m.foldRatio > 1.05) {
            await page.screenshot({ path: path.join(roleDir, `${base}--full.png`), fullPage: true });
          }
          metrics.push({
            role,
            slug: screen.slug,
            viewport: `${vp.w}x${vp.h}`,
            url: page.url().replace(BASE_URL, ""),
            screenshot: path.relative(OUT_DIR, shot),
            ...m,
          });
          process.stdout.write(
            `${role.padEnd(10)} ${screen.slug.padEnd(26)} ${`${vp.w}x${vp.h}`.padEnd(9)} overflowX=${m.overflowX ? "YES" : "no "} main=${m.mainWidthPct ?? "-"}% fold=${m.foldRatio}\n`,
          );
        } catch (err) {
          process.stdout.write(`FAIL ${role} ${screen.slug} ${vp.w}x${vp.h}: ${(err as Error).message}\n`);
        } finally {
          await ctx.close();
        }
      }
    }
  }

  fs.writeFileSync(path.join(OUT_DIR, "metrics.json"), JSON.stringify(metrics, null, 2));
  // Auth-state files are throwaway session cookies — do not commit them.
  for (const f of fs.readdirSync(OUT_DIR)) {
    if (f.startsWith(".auth-")) fs.rmSync(path.join(OUT_DIR, f));
  }
  console.log(`\n${metrics.length} captures → ${OUT_DIR}/ (+ metrics.json)`);
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
