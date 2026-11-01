import { expect, test } from "@playwright/test";
import {
  FIND_PARTS_FORBIDDEN_SAMPLES,
  fleetAuthSession,
  fleetCorePartsFixtures,
  fleetCoreStitchVisualFixtures,
  installFleetCoreMockRoutes,
} from "./findPartsFleetMocks";
import {
  STITCH_VISUAL_COMPONENT_ID,
  STITCH_VISUAL_PLATE,
  STITCH_VISUAL_VEHICLE_ID,
} from "./findPartsStitchVisualFixtures";

async function installFleetMocks(page: import("@playwright/test").Page) {
  const session = fleetAuthSession();
  await page.addInitScript((stored) => {
    localStorage.setItem("sb-example-auth-token", JSON.stringify(stored));
  }, session);
  await page.route("**/auth/v1/**", async (route) => {
    await route.fulfill({ json: session });
  });
  await installFleetCoreMockRoutes(page, fleetCorePartsFixtures());
}

function assertNoSamples(page: import("@playwright/test").Page) {
  return async () => {
    for (const sample of FIND_PARTS_FORBIDDEN_SAMPLES) {
      await expect(page.getByText(sample, { exact: false })).toHaveCount(0);
    }
  };
}

test.describe("Fleet find parts live fixtures", () => {
  test.beforeEach(async ({ page }) => {
    await installFleetMocks(page);
  });

  test("FP1 shows fixture plate not stitch samples", async ({ page }) => {
    await page.goto("/maintenance?tab=find-parts");
    await expect(page.getByText("Which car is it?")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("TEST-01")).toBeVisible();
    await assertNoSamples(page)();
  });

  test("FP2 variant step opens from continue", async ({ page }) => {
    await page.goto("/maintenance?tab=find-parts");
    await page.getByText("Which car is it?").waitFor({ timeout: 20_000 });
    await page.locator("#select-make").selectOption("Nissan");
    await page.locator("#select-model").selectOption("Note");
    await page.locator("#select-year").selectOption("2016");
    await page.getByRole("button", { name: /continue/i }).click();
    await expect(page.getByText("Which one is yours?", { exact: false })).toBeVisible({ timeout: 15_000 });
    await assertNoSamples(page)();
  });

  test("FP3 part browse after vehicle pick", async ({ page }) => {
    await page.goto("/maintenance?tab=find-parts&vehicle=veh-fixture-1");
    await page.getByText("What part", { exact: false }).waitFor({ timeout: 20_000 });
    await assertNoSamples(page)();
  });

  test("FP4 position step", async ({ page }) => {
    await page.goto("/maintenance?tab=find-parts&vehicle=veh-fixture-1&part=cmp-1");
    await page.getByText("Pick the axle", { exact: false }).waitFor({ timeout: 20_000 });
    await assertNoSamples(page)();
  });

  test("FP5 results grid", async ({ page }) => {
    await page.goto("/maintenance?tab=find-parts&vehicle=veh-fixture-1&part=cmp-1&pos=front");
    await page.getByText("Results", { exact: false }).waitFor({ timeout: 20_000 });
    await expect(page.getByText("Toyota", { exact: false })).toBeVisible();
    await assertNoSamples(page)();
  });

  test("FP6 drawer opens from results", async ({ page }) => {
    await page.goto("/maintenance?tab=find-parts&vehicle=veh-fixture-1&part=cmp-1&pos=front");
    await page.getByText("Results", { exact: false }).waitFor({ timeout: 20_000 });
    const detail = page.getByRole("button", { name: /details|top recommended|photo/i }).first();
    await detail.click();
    await expect(page.getByText("Part detail", { exact: false })).toBeVisible({ timeout: 10_000 });
    await assertNoSamples(page)();
  });

  test("FP7 quantity 4 is sent on quote POST", async ({ page }) => {
    await page.goto("/maintenance?tab=find-parts&vehicle=veh-fixture-1&part=cmp-1&pos=front");
    await page.getByText("Results", { exact: false }).waitFor({ timeout: 20_000 });
    let posted: Record<string, unknown> | null = null;
    await page.route("**/fleet-core/**/parts/quote", async (route) => {
      posted = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({ json: { item: { id: "quote-fixture-1" }, reference: "FIX-QUOTE" } });
    });
    await page.getByRole("button", { name: /quote|get a price/i }).first().click();
    await page.locator("#qtyInput").fill("4");
    const send = page.getByRole("button", { name: /send|broadcast/i }).first();
    const wait = page.waitForRequest((req) => req.url().includes("/parts/quote") && req.method() === "POST");
    await send.click();
    await wait;
    expect(posted?.qty).toBe(4);
    await assertNoSamples(page)();
  });

  test("FP8 request panel", async ({ page }) => {
    await page.goto("/maintenance?tab=find-parts&vehicle=veh-fixture-1&part=cmp-1");
    await page.getByText("Which car is it?").waitFor({ timeout: 20_000 });
    await page.getByRole("button", { name: /ask roam to find it/i }).first().click();
    await expect(page.getByText("Ask Roam", { exact: false })).toBeVisible({ timeout: 15_000 });
    await assertNoSamples(page)();
  });

  test("FP9 link car panel via unlinked find", async ({ page }) => {
    await page.route("**/fleet-core/**/parts/find*", async (route) => {
      await route.fulfill({ json: { linked: false, make: "Nissan", model: "Note", year: 2016, vehicle: { plate: "TEST-01" } } });
    });
    await page.goto("/maintenance?tab=find-parts");
    await page.getByText("TEST-01").waitFor({ timeout: 20_000 });
    await page.getByText("TEST-01").click();
    await expect(page.getByText("not linked", { exact: false })).toBeVisible({ timeout: 15_000 });
    await assertNoSamples(page)();
  });

  test("FP10 activity view", async ({ page }) => {
    await page.goto("/maintenance?tab=find-parts&view=activity");
    await page.getByText("Your parts activity", { exact: false }).waitFor({ timeout: 20_000 });
    await expect(page.getByText("Fixture request", { exact: false })).toBeVisible();
    await assertNoSamples(page)();
  });

  test("FP11 permission gate copy", async ({ page }) => {
    await page.addInitScript(() => {
      const raw = localStorage.getItem("sb-example-auth-token");
      if (!raw) return;
      const session = JSON.parse(raw);
      session.user.app_metadata.role = "driver";
      localStorage.setItem("sb-example-auth-token", JSON.stringify(session));
    });
    await page.goto("/maintenance?tab=find-parts");
    await expect(page.getByText("Role Authorization Gate")).toBeVisible({ timeout: 20_000 });
    await assertNoSamples(page)();
  });

  test("FP12 phone layout at 390px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/maintenance?tab=find-parts&vehicle=veh-fixture-1&part=cmp-1&pos=front");
    await page.getByText("Results", { exact: false }).waitFor({ timeout: 20_000 });
    await assertNoSamples(page)();
  });
});

async function installStitchVisualMocks(page: import("@playwright/test").Page) {
  const session = fleetAuthSession();
  await page.addInitScript((stored) => {
    localStorage.setItem("sb-example-auth-token", JSON.stringify(stored));
  }, session);
  await page.route("**/auth/v1/**", async (route) => {
    await route.fulfill({ json: session });
  });
  await installFleetCoreMockRoutes(page, fleetCoreStitchVisualFixtures());
}

async function prepareFindPartsCapture(page: import("@playwright/test").Page) {
  await page.addStyleTag({
    content: [
      "main, .overflow-y-auto, [data-app-scroll], .app-layout-scroll { overflow: visible !important; height: auto !important; max-height: none !important; }",
      ".group\\/sidebar-wrapper, [data-slot=\"sidebar-wrapper\"] { height: auto !important; max-height: none !important; min-height: 0 !important; overflow: visible !important; }",
      ".group\\/sidebar-wrapper > div, [data-slot=\"sidebar-wrapper\"] > div { height: auto !important; max-height: none !important; overflow: visible !important; }",
    ].join(" "),
  });
}

test.describe("Fleet find parts stitch live PNGs", () => {
  test.beforeEach(async ({ page }) => {
    await installStitchVisualMocks(page);
  });

  test("FP3 browse at 1440px", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/maintenance?tab=find-parts&vehicle=${STITCH_VISUAL_VEHICLE_ID}`);
    await page.getByRole("heading", { name: /What part do you need/i }).first().waitFor({ timeout: 20_000 });
    await expect(page.getByText(STITCH_VISUAL_PLATE).first()).toBeVisible();
    await expect(page.getByText("8 parts on file", { exact: false }).first()).toBeVisible();
    await prepareFindPartsCapture(page);
    await page.screenshot({
      path: "docs/stitch/roam-fleet-app/screenshots/FP3-live.png",
      fullPage: true,
    });
  });

  test("FP4 position at 1440px", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/maintenance?tab=find-parts&vehicle=${STITCH_VISUAL_VEHICLE_ID}&part=${STITCH_VISUAL_COMPONENT_ID}`);
    await page.getByRole("heading", { name: /Which brake pads\?/i }).waitFor({ timeout: 20_000 });
    await prepareFindPartsCapture(page);
    await page.screenshot({
      path: "docs/stitch/roam-fleet-app/screenshots/FP4-live.png",
      fullPage: true,
    });
  });

  test("FP5 results at 1440px", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/maintenance?tab=find-parts&vehicle=${STITCH_VISUAL_VEHICLE_ID}&part=${STITCH_VISUAL_COMPONENT_ID}&pos=front`);
    await page.getByText("Structured Match Categories", { exact: false }).waitFor({ timeout: 20_000 });
    await prepareFindPartsCapture(page);
    await page.screenshot({
      path: "docs/stitch/roam-fleet-app/screenshots/FP5-live.png",
      fullPage: true,
    });
  });

  test("FP8 request panel at 1440px", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/maintenance?tab=find-parts&vehicle=${STITCH_VISUAL_VEHICLE_ID}&part=cmp-stitch-fp8`);
    await page.getByText("Tell us what you need", { exact: false }).waitFor({ timeout: 20_000 });
    await prepareFindPartsCapture(page);
    await page.screenshot({
      path: "docs/stitch/roam-fleet-app/screenshots/FP8-live.png",
      fullPage: true,
    });
  });

  test("FP10 activity at 1440px", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/maintenance?tab=find-parts&view=activity");
    await page.getByRole("heading", { name: "Your parts activity" }).waitFor({ timeout: 20_000 });
    await prepareFindPartsCapture(page);
    await page.screenshot({
      path: "docs/stitch/roam-fleet-app/screenshots/FP10-live.png",
      fullPage: true,
    });
  });

  test("FP12 phone browse at 390px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/maintenance?tab=find-parts&vehicle=${STITCH_VISUAL_VEHICLE_ID}`);
    await page.getByRole("heading", { name: /What part do you need/i }).first().waitFor({ timeout: 20_000 });
    await prepareFindPartsCapture(page);
    await page.screenshot({
      path: "docs/stitch/roam-fleet-app/screenshots/FP12-live.png",
      fullPage: true,
    });
  });
});
