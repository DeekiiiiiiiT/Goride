/**
 * Dominion pending catalog (S10b–S10d) stitch live PNG capture.
 * Run: pnpm test:e2e:dominion:pending-parts-capture
 */
import { expect, test } from "@playwright/test";

function token() {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode({
    aal: "aal2",
    sub: "11111111-1111-4111-8111-111111111111",
    role: "authenticated",
    exp: 4_000_000_000,
    app_metadata: { role: "platform_owner" },
  })}.sig`;
}

const mockQueue = {
  items: [
    {
      groupId: "grp-stitch-1",
      platformId: "plat-1",
      vehicleCatalogId: "plat-1",
      componentId: "cmp-intake",
      side: null,
      matchType: "Sister",
      fleetCount: 1,
      firstAsked: "2026-07-12T10:00:00Z",
      lastAsked: "2026-07-12T10:00:00Z",
      photoCount: 1,
      status: "new",
      requestIds: ["req-stitch-1"],
    },
    {
      groupId: "grp-stitch-2",
      platformId: "plat-2",
      componentId: "cmp-brake",
      side: "front",
      fleetCount: 3,
      firstAsked: "2026-07-11T08:00:00Z",
      lastAsked: "2026-07-13T14:40:00Z",
      photoCount: 0,
      status: "looking",
      requestIds: ["req-stitch-2"],
    },
  ],
  total: 2,
  weeklyTarget: 12,
};

const mockGroupDetail = {
  groupId: "grp-stitch-1",
  fleetCount: 1,
  notes: [{ id: "n1", logRef: "RF-8092", text: "Cross-reference JDM chassis microfiche." }],
  photos: [],
  onFile: [
    { brand: "Denso", partNumber: "17801-B0010", matchType: "Made for your car" },
  ],
};

const mockBrowseNames = {
  systems: [{ plainName: "Intake", components: [{ id: "cmp-intake", plainName: "Intake panel" }] }],
  common: [{ id: "cmp-brake", plainName: "Front brake pad set" }],
};

const mockVehicleBrief = {
  vehicles: [{
    id: "plat-1",
    make: "Toyota",
    model: "Roomy",
    trim_series: "Pre-Facelift",
    engine_code: "1KR-FE",
    chassis_code: "M900A",
    production_start_year: 2017,
    production_end_year: 2020,
    drivetrain: "2WD",
  }],
};

async function fulfillFunctionsRoute(url: string, route: import("@playwright/test").Route, queue = mockQueue) {
  if (url.includes("admin/pending-catalog/parts-queue/")) {
    await route.fulfill({ json: mockGroupDetail });
    return;
  }
  if (url.includes("admin/pending-catalog/parts-queue")) {
    await route.fulfill({ json: queue });
    return;
  }
  if (url.includes("admin/catalog/parts/browse")) {
    await route.fulfill({ json: mockBrowseNames });
    return;
  }
  if (url.includes("vehicle-catalog?id=")) {
    await route.fulfill({ json: mockVehicleBrief });
    return;
  }
  if (url.includes("vehicle-catalog-pending-requests")) {
    await route.fulfill({ json: { items: [], total: 0 } });
    return;
  }
  if (url.includes("platform-status")) {
    await route.fulfill({ json: { maintenanceMode: false, maintenanceMessage: "", platformName: "Dominion" } });
    return;
  }
  if (url.includes("settings/preferences")) {
    await route.fulfill({ json: { darkMode: false } });
    return;
  }
  if (url.includes("/admin/quality") || url.includes("/admin/changes") || url.includes("/admin/consumers")) {
    await route.fulfill({ json: { items: [] } });
    return;
  }
  if (url.includes("admin-stats") || url.includes("admin/coverage")) {
    await route.fulfill({ json: {} });
    return;
  }
  if (url.includes("admin/vendors")) {
    await route.fulfill({ json: { items: [] } });
    return;
  }
  if (url.includes("/auth/v1/")) {
    return;
  }
  await route.fulfill({ json: {} });
}

async function installDominionMocks(page: import("@playwright/test").Page, queue = mockQueue) {
  const access = token();
  const user = {
    id: "11111111-1111-4111-8111-111111111111",
    aud: "authenticated",
    role: "authenticated",
    email: "owner@example.com",
    app_metadata: { role: "platform_owner" },
    user_metadata: {},
  };
  const session = {
    access_token: access,
    refresh_token: "refresh",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user,
  };
  await page.addInitScript((stored) => {
    localStorage.setItem("sb-example-auth-token", JSON.stringify(stored));
  }, session);
  await page.route("**/auth/v1/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/mfa/")) {
      await route.fulfill({ json: { currentLevel: "aal2", nextLevel: "aal2" } });
      return;
    }
    await route.fulfill({ json: session });
  });
  const handler = async (route: import("@playwright/test").Route) => {
    await fulfillFunctionsRoute(route.request().url(), route, queue);
  };
  await page.route("**/functions/v1/**", handler);
  await page.route("**/__sb/functions/v1/**", handler);
}

test.describe("Dominion pending parts stitch live PNGs", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await installDominionMocks(page);
  });

  test("S10b parts queue at 1440px", async ({ page }) => {
    await page.goto("/?page=pending-motor-vehicles");
    await page.getByRole("button", { name: /Parts\s+\d/i }).click();
    await expect(page.getByText("Awaiting gate")).toBeVisible({ timeout: 20_000 });
    await page.locator(".pending-parts-stitch").screenshot({
      path: "docs/stitch/dominion-redesign/screenshots/S10b-live.png",
    });
  });

  test("S10c drawer at 1440px", async ({ page }) => {
    await page.goto("/?page=pending-motor-vehicles");
    await page.getByRole("button", { name: /Parts\s+\d/i }).click();
    await page.getByRole("button", { name: "Open" }).first().click();
    await expect(page.getByRole("heading", { name: "What they asked" })).toBeVisible({ timeout: 15_000 });
    await page.locator(".pending-parts-stitch").screenshot({
      path: "docs/stitch/dominion-redesign/screenshots/S10c-live.png",
    });
  });

  test("S10d empty state at 1440px", async ({ page }) => {
    await installDominionMocks(page, { items: [], total: 0, weeklyTarget: 12 });
    await page.goto("/?page=pending-motor-vehicles");
    await page.getByRole("button", { name: /Parts\s+\d/i }).click();
    await expect(page.getByText(/No part requests/i)).toBeVisible({ timeout: 20_000 });
    await page.locator(".pending-parts-stitch").screenshot({
      path: "docs/stitch/dominion-redesign/screenshots/S10d-live.png",
    });
  });
});
