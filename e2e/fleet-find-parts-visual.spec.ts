import { expect, test } from "@playwright/test";
import {
  FIND_PARTS_FORBIDDEN_SAMPLES,
  fleetAuthSession,
  fleetCorePartsFixtures,
  mockFleetCoreRoute,
} from "./findPartsFleetMocks";

async function installFleetMocks(page: import("@playwright/test").Page) {
  const session = fleetAuthSession();
  await page.addInitScript((stored) => {
    localStorage.setItem("sb-example-auth-token", JSON.stringify(stored));
  }, session);
  await page.route("**/auth/v1/**", async (route) => {
    await route.fulfill({ json: session });
  });
  const fixtures = fleetCorePartsFixtures();
  await page.route("**/fleet-core/**", async (route) => {
    const json = await mockFleetCoreRoute(route.request().url(), route.request().method(), fixtures);
    if (json != null) {
      await route.fulfill({ json });
      return;
    }
    await route.continue();
  });
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
    await page.goto("/?tab=find-parts");
    await expect(page.getByText("Which car is it?")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("TEST-01")).toBeVisible();
    await assertNoSamples(page)();
  });

  test("FP2 variant step opens from continue", async ({ page }) => {
    await page.goto("/?tab=find-parts");
    await page.getByText("Which car is it?").waitFor({ timeout: 20_000 });
    await page.locator("#select-make").selectOption("Nissan");
    await page.locator("#select-model").selectOption("Note");
    await page.locator("#select-year").selectOption("2016");
    await page.getByRole("button", { name: /continue/i }).click();
    await expect(page.getByText("Which one is yours?", { exact: false })).toBeVisible({ timeout: 15_000 });
    await assertNoSamples(page)();
  });

  test("FP3 part browse after vehicle pick", async ({ page }) => {
    await page.goto("/?tab=find-parts&vehicle=veh-fixture-1");
    await page.getByText("What part", { exact: false }).waitFor({ timeout: 20_000 });
    await assertNoSamples(page)();
  });

  test("FP4 position step", async ({ page }) => {
    await page.goto("/?tab=find-parts&vehicle=veh-fixture-1&part=cmp-1");
    await page.getByText("Front or back", { exact: false }).waitFor({ timeout: 20_000 });
    await assertNoSamples(page)();
  });

  test("FP5 results grid", async ({ page }) => {
    await page.goto("/?tab=find-parts&vehicle=veh-fixture-1&part=cmp-1&pos=front");
    await page.getByText("Results", { exact: false }).waitFor({ timeout: 20_000 });
    await expect(page.getByText("Fixture Motors", { exact: false })).toBeVisible();
    await assertNoSamples(page)();
  });

  test("FP6 drawer opens from results", async ({ page }) => {
    await page.goto("/?tab=find-parts&vehicle=veh-fixture-1&part=cmp-1&pos=front");
    await page.getByText("Results", { exact: false }).waitFor({ timeout: 20_000 });
    const detail = page.getByRole("button", { name: /details|top recommended|photo/i }).first();
    await detail.click();
    await expect(page.getByText("Part detail", { exact: false })).toBeVisible({ timeout: 10_000 });
    await assertNoSamples(page)();
  });

  test("FP7 quantity 4 is sent on quote POST", async ({ page }) => {
    await page.goto("/?tab=find-parts&vehicle=veh-fixture-1&part=cmp-1&pos=front");
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
    await page.goto("/?tab=find-parts&vehicle=veh-fixture-1&part=cmp-1");
    await page.getByText("Which car is it?").waitFor({ timeout: 20_000 });
    await page.getByRole("button", { name: /ask roam to find it/i }).first().click();
    await expect(page.getByText("Ask Roam", { exact: false })).toBeVisible({ timeout: 15_000 });
    await assertNoSamples(page)();
  });

  test("FP9 link car panel via unlinked find", async ({ page }) => {
    await page.route("**/fleet-core/**/parts/find*", async (route) => {
      await route.fulfill({ json: { linked: false, make: "Nissan", model: "Note", year: 2016, vehicle: { plate: "TEST-01" } } });
    });
    await page.goto("/?tab=find-parts");
    await page.getByText("TEST-01").waitFor({ timeout: 20_000 });
    await page.getByText("TEST-01").click();
    await expect(page.getByText("not linked", { exact: false })).toBeVisible({ timeout: 15_000 });
    await assertNoSamples(page)();
  });

  test("FP10 activity view", async ({ page }) => {
    await page.goto("/?tab=find-parts&view=activity");
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
    await page.goto("/?tab=find-parts");
    await expect(page.getByText("Role Authorization Gate")).toBeVisible({ timeout: 20_000 });
    await assertNoSamples(page)();
  });

  test("FP12 phone layout at 390px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?tab=find-parts&vehicle=veh-fixture-1&part=cmp-1&pos=front");
    await page.getByText("Results", { exact: false }).waitFor({ timeout: 20_000 });
    await assertNoSamples(page)();
  });
});

test("find parts tab screenshot hooks", async ({ page }) => {
  await installFleetMocks(page);
  await page.goto("/?tab=find-parts");
  await page.getByText("Which car is it?").waitFor({ timeout: 20_000 });
  await page.screenshot({ path: "docs/stitch/roam-fleet-app/screenshots/FP1-live.png", fullPage: true });
});
