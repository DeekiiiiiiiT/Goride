import { expect, test } from "@playwright/test";
import {
  FIND_PARTS_FORBIDDEN_SAMPLES,
  fleetAuthSession,
  fleetCoreEverydayCaptureFixtures,
  installFleetCoreMockRoutes,
  seedFleetAuthSession,
} from "./findPartsFleetMocks";
import { EVERYDAY_PLATE, EVERYDAY_VEHICLE_ID } from "./findPartsEverydayCaptureFixtures";

async function installEverydayMocks(page: import("@playwright/test").Page) {
  const session = fleetAuthSession();
  await seedFleetAuthSession(page, session);
  await page.route("**/auth/v1/**", async (route) => {
    await route.fulfill({ json: session });
  });
  await installFleetCoreMockRoutes(page, fleetCoreEverydayCaptureFixtures());
}

function assertNoSamples(page: import("@playwright/test").Page) {
  return async () => {
    for (const sample of FIND_PARTS_FORBIDDEN_SAMPLES) {
      await expect(page.getByText(sample, { exact: false })).toHaveCount(0);
    }
  };
}

test.describe("Fleet find parts everyday", () => {
  test.beforeEach(async ({ page }) => {
    await installEverydayMocks(page);
  });

  test("shows which car step with Roomy plate", async ({ page }) => {
    await page.goto("/maintenance?tab=find-parts");
    await expect(page.getByText("Which car is it for?")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(EVERYDAY_PLATE).first()).toBeVisible();
    await assertNoSamples(page)();
  });

  test("capture home shows car header", async ({ page }) => {
    await page.goto(`/maintenance?tab=find-parts&vehicle=${EVERYDAY_VEHICLE_ID}&findPartsCapture=car_home_what_do_you_need_toyota_roomy`);
    await expect(page.getByText("Toyota Roomy").first()).toBeVisible({ timeout: 20_000 });
    await assertNoSamples(page)();
  });

  test("unlinked fleet car opens link flow", async ({ page }) => {
    await page.route("**/parts/find**", async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      await route.fulfill({
        json: { linked: false, askVariant: true, pickedVariantId: null, car: { make: "Toyota", model: "Roomy", year: 2019 } },
      });
    });
    await page.goto("/maintenance?tab=find-parts");
    await page.getByText(EVERYDAY_PLATE).click();
    await expect(page.getByText("Link this car once")).toBeVisible({ timeout: 15_000 });
    await assertNoSamples(page)();
  });
});
