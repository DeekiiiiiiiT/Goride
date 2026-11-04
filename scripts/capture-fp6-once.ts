import { chromium } from "@playwright/test";
import { join } from "node:path";
import {
  fleetAuthSession,
  fleetCoreStitchVisualFixtures,
  installFleetCoreMockRoutes,
  seedFleetAuthSession,
} from "../e2e/findPartsFleetMocks";
import {
  STITCH_VISUAL_COMPONENT_ID,
  STITCH_VISUAL_VEHICLE_ID,
} from "../e2e/findPartsStitchVisualFixtures";

const base = process.env.FLEET_BASE_URL || "http://127.0.0.1:3001";
const shots = join(process.cwd(), "docs", "stitch", "roam-fleet-app", "screenshots");

async function capture(dark: boolean) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const session = fleetAuthSession();
  await seedFleetAuthSession(page, session);
  await page.addInitScript(({ useDark }) => {
    localStorage.setItem("preference_dark_mode", String(useDark));
    document.documentElement.classList.toggle("dark", useDark);
    document.documentElement.style.colorScheme = useDark ? "dark" : "light";
  }, { useDark: dark });
  await page.route("**/auth/v1/**", async (route) => route.fulfill({ json: session }));
  await installFleetCoreMockRoutes(page, fleetCoreStitchVisualFixtures());
  await page.goto(
    `${base}/maintenance?tab=find-parts&vehicle=${STITCH_VISUAL_VEHICLE_ID}&part=${STITCH_VISUAL_COMPONENT_ID}&pos=front`,
    { waitUntil: "networkidle" },
  );
  await page.locator(".find-parts-screen-root.find-parts-am-results").first().waitFor({ timeout: 60_000 });
  await page.getByRole("button", { name: /View details/i }).first().click();
  const drawer = page.locator("#part-detail-drawer");
  await drawer.waitFor({ timeout: 15_000 });
  const file = join(shots, dark ? "FP6-app-dark.png" : "FP6-app.png");
  await drawer.screenshot({ path: file });
  await browser.close();
  return file;
}

const light = await capture(false);
const dark = await capture(true);
console.log(JSON.stringify({ light, dark }, null, 2));
