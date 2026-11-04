import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const base = process.env.ADMIN_BASE_URL || "http://127.0.0.1:4173";
const shots = join(process.cwd(), "docs", "stitch", "dominion-redesign", "screenshots");
const THEME_KEY = "preference_dark_mode";

function token() {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode({
    aal: "aal2",
    sub: "11111111-1111-4111-8111-111111111111",
    role: "authenticated",
    exp: 4_000_000_000,
    app_metadata: { role: "platform_owner" },
  })}.sig`;
}

const session = {
  access_token: token(),
  refresh_token: "refresh",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    aud: "authenticated",
    role: "authenticated",
    email: "owner@example.com",
    app_metadata: { role: "platform_owner" },
  },
};

async function mockRoutes(page) {
  const health = {
    engineVersion: 8,
    normVersion: 1,
    normMode: "strict",
    engineHash: "#F81-99A",
    enabled: true,
    derived: { live: 17, needsChecking: 1, suppressed: 0 },
    tierBreakdown: { "1": 8, "2": 3, "3": 1 },
    openConflicts: { oe_ambiguous: 2, position_side_mismatch: 1, index_wear_sensor: 1 },
    lastRun: {
      finished_at: new Date(Date.now() - 3600_000).toISOString(),
      duration_ms: 134000,
      rows_scanned: 428,
      error: null,
    },
    errorCount24h: 1,
    lastError24h: {
      kind: "worker-node-03",
      error: "timed out on legacy platform index table during parallel hash pass",
    },
    unresolvedPositionReports: 3,
  };
  await page.route("**/admin/auto-match/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/health")) return route.fulfill({ json: health });
    if (url.includes("/schedule")) {
      return route.fulfill({
        json: { nextRun: new Date(Date.now() + 6e6).toISOString(), cron: "0 3 * * *", intervalLabel: "Daily at 03:00 UTC" },
      });
    }
    if (url.includes("/catalog/completeness")) {
      return route.fulfill({
        json: {
          vehicleCount: 120,
          vehiclesWithOeNumbers: 80,
          platformLinkCount: 12,
          groups: 48,
          parts: 320,
          partsWithSpecAttributes: 293,
          listings: 890,
          derived: 17,
          openConflicts: 4,
          unresolvedPositionReports: 3,
        },
      });
    }
    if (url.includes("/validation-exceptions")) {
      return route.fulfill({
        json: {
          rows: [{
            id: "1",
            code: "MISMATCHED_THREAD_PITCH",
            detail: { message: "M12x1.25 parsed as standard M12x1.5" },
            affected_ref: "LUG-N-HON-091",
            source: "OEM Fitment Feed",
            severity: "medium",
          }],
        },
      });
    }
    if (url.includes("/position-reports/export")) return route.fulfill({ body: "id\n", contentType: "text/csv" });
    if (url.includes("/position-reports")) {
      const pending = !url.includes("pending=0");
      const rows = pending
        ? [
            {
              id: "11111111-1111-4111-8111-111111111114",
              table_name: "part_listing",
              row_id: "11111111-1111-4111-8111-111111111115",
              original_position: "XYZ",
              reason: "unmapped",
              created_at: "2026-11-02T03:00:00.000Z",
            },
            {
              id: "11111111-1111-4111-8111-111111111116",
              table_name: "part_listing_exclusion",
              row_id: "11111111-1111-4111-8111-111111111117",
              original_position: "FRT-LH/RH",
              reason: "unmapped",
              created_at: "2026-11-02T03:00:00.000Z",
            },
            {
              id: "11111111-1111-4111-8111-111111111118",
              table_name: "part_listing",
              row_id: "11111111-1111-4111-8111-111111111119",
              original_position: "ANY_AXLE_B",
              reason: "duplicate_after_normalization",
              survivor_id: "11111111-1111-4111-8111-111111111120",
              created_at: "2026-11-01T21:18:00.000Z",
            },
          ]
        : [{
            id: "11111111-1111-4111-8111-111111111121",
            table_name: "part_listing",
            row_id: "11111111-1111-4111-8111-111111111122",
            original_position: "F/R-BOTH",
            resolution_source: "manual",
            resolved_by: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
            resolved_at: "2026-11-02T01:14:00.000Z",
          }];
      return route.fulfill({ json: { rows } });
    }
    if (url.includes("/runs")) return route.fulfill({ json: { rows: [] } });
    return route.fulfill({ json: {} });
  });
  await page.route("**/auth/v1/**", (route) => route.fulfill({ json: session }));
}

async function capture(dark) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(({ stored, useDark, themeKey }) => {
    localStorage.setItem("sb-csfllzzastacofsvcdsc-auth-token", JSON.stringify(stored));
    localStorage.setItem(themeKey, String(useDark));
    document.documentElement.classList.toggle("dark", useDark);
    document.documentElement.style.colorScheme = useDark ? "dark" : "light";
  }, { stored: session, useDark: dark, themeKey: THEME_KEY });
  await mockRoutes(page);
  await page.goto(`${base}/?page=catalog-quality`, { waitUntil: "networkidle" });
  await page.locator(".catalog-quality-record").waitFor({ timeout: 60_000 });
  const header = page.locator('input[placeholder*="Search entities"]').locator("xpath=ancestor::header").first();
  if (await header.count()) await header.evaluate((el) => { el.style.display = "none"; });
  const root = page.locator(".catalog-quality-record").first();
  const file = join(shots, dark ? "AM-S6-app-dark.png" : "AM-S6-app.png");
  await root.screenshot({ path: file });
  await browser.close();
  return file;
}

const light = await capture(false);
const dark = await capture(true);
const differ = readFileSync(light).compare(readFileSync(dark)) !== 0;
console.log(JSON.stringify({ light, dark, differ }, null, 2));
if (!differ) process.exit(1);
