import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
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

const base = process.env.FLEET_BASE_URL || "http://127.0.0.1:3000";
const shots = join(process.cwd(), "docs", "stitch", "roam-fleet-app", "screenshots");

function unclampCaptureAncestors() {
  const anchors = [
    document.querySelector(".fleet-am-s4f-hub-head"),
    document.querySelector(".find-parts-am-results"),
    document.querySelector(".fp5-am-engine-footer"),
  ].filter(Boolean);
  const seen = new Set<Element>();
  for (const node of anchors) {
    let el: Element | null = node;
    while (el && el !== document.documentElement) {
      if (seen.has(el)) break;
      seen.add(el);
      const html = el as HTMLElement;
      html.style.setProperty("overflow", "visible", "important");
      html.style.setProperty("overflow-x", "visible", "important");
      html.style.setProperty("overflow-y", "visible", "important");
      html.style.setProperty("height", "auto", "important");
      html.style.setProperty("max-height", "none", "important");
      html.style.setProperty("min-height", "0", "important");
      el = el.parentElement;
    }
  }
}

async function prepareFindPartsCapture(page: import("@playwright/test").Page) {
  await page.addStyleTag({
    content: [
      "html, body, #root { overflow: visible !important; height: auto !important; max-height: none !important; }",
      "main, .overflow-y-auto, .overflow-hidden, [data-app-scroll], .app-layout-scroll { overflow: visible !important; height: auto !important; max-height: none !important; }",
      ".group\\/sidebar-wrapper, [data-slot=\"sidebar-wrapper\"] { height: auto !important; max-height: none !important; min-height: 0 !important; overflow: visible !important; }",
      ".group\\/sidebar-wrapper > div, [data-slot=\"sidebar-wrapper\"] > div { height: auto !important; max-height: none !important; overflow: visible !important; }",
      ".find-parts-screen-root, .fp-screen-root, .fp5-am-root, .fleet-find-parts-stitch { overflow: visible !important; height: auto !important; max-height: none !important; }",
      ".dark .fleet-am-s4f-hub-head, .dark .fleet-find-parts-stitch.find-parts-am-results { background-color: #252525 !important; }",
    ].join(" "),
  });
  await page.evaluate(unclampCaptureAncestors);
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function measureAmS4FClip(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const head = document.querySelector(".fleet-am-s4f-hub-head");
    const foot = document.querySelector(".fp5-am-engine-footer");
    if (!head || !foot) throw new Error("AM-S4F capture anchors missing");
    const pageLeft = Math.min(head.getBoundingClientRect().left, foot.getBoundingClientRect().left) + window.scrollX;
    const top = head.getBoundingClientRect().top + window.scrollY;
    let bottom = foot.getBoundingClientRect().bottom + window.scrollY;
    let right = Math.max(head.getBoundingClientRect().right, foot.getBoundingClientRect().right) + window.scrollX;
    for (const tier of document.querySelectorAll(".fp5-am-tier")) {
      const r = tier.getBoundingClientRect();
      bottom = Math.max(bottom, r.bottom + window.scrollY);
      right = Math.max(right, r.right + window.scrollX);
    }
    return {
      x: Math.floor(pageLeft),
      y: Math.floor(top),
      width: Math.ceil(right - pageLeft),
      height: Math.ceil(bottom - top),
      tiers: document.querySelectorAll(".fp5-am-tier").length,
    };
  });
}

async function screenshotAmS4F(
  page: import("@playwright/test").Page,
  file: string,
  expectedTiers: number,
) {
  await prepareFindPartsCapture(page);
  await page.getByRole("heading", { name: "Fleet Maintenance" }).waitFor({ timeout: 30_000 });
  await page.locator(".fp5-am-engine-footer").waitFor({ timeout: 30_000 });
  let clip = await measureAmS4FClip(page);
  if (clip.tiers < expectedTiers) {
    throw new Error(`AM-S4F capture: expected ${expectedTiers} tiers, saw ${clip.tiers}`);
  }
  const viewportHeight = Math.ceil(clip.y + clip.height + 48);
  await page.setViewportSize({ width: 1440, height: Math.max(900, viewportHeight) });
  await prepareFindPartsCapture(page);
  clip = await measureAmS4FClip(page);
  const { tiers: _tiers, ...shotClip } = clip;
  await page.screenshot({ path: file, clip: shotClip });
}

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
  await page.route("**/auth/v1/**", async (route) => {
    await route.fulfill({ json: session });
  });
  await installFleetCoreMockRoutes(page, fleetCoreStitchVisualFixtures());
  await page.goto(
    `${base}/maintenance?tab=find-parts&vehicle=${STITCH_VISUAL_VEHICLE_ID}&part=${STITCH_VISUAL_COMPONENT_ID}&pos=front`,
    { waitUntil: "networkidle" },
  );
  await page.locator(".fp5-am-root").waitFor({ timeout: 60_000 });
  await page.getByRole("heading", { name: "Front brake pad set" }).waitFor({ timeout: 30_000 });
  await page.getByText("Advics").first().waitFor({ timeout: 30_000 });
  await page.getByText("Fits by size").first().waitFor({ timeout: 30_000 });
  const file = join(shots, dark ? "AM-S4F-app-dark.png" : "AM-S4F-app.png");
  await screenshotAmS4F(page, file, 5);
  await browser.close();
  return file;
}

async function captureChecking() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const session = fleetAuthSession();
  await seedFleetAuthSession(page, session);
  await page.addInitScript(() => {
    localStorage.setItem("preference_dark_mode", "false");
    document.documentElement.classList.remove("dark");
    document.documentElement.style.colorScheme = "light";
  });
  await page.route("**/auth/v1/**", async (route) => {
    await route.fulfill({ json: session });
  });
  const fixtures = fleetCoreStitchVisualFixtures();
  const { stitchAutoMatchFindSectionsAllChecking } = await import("../e2e/findPartsStitchAutoMatchFixtures");
  fixtures.find = { ...fixtures.find, sections: stitchAutoMatchFindSectionsAllChecking() };
  await installFleetCoreMockRoutes(page, fixtures);
  await page.goto(
    `${base}/maintenance?tab=find-parts&vehicle=${STITCH_VISUAL_VEHICLE_ID}&part=${STITCH_VISUAL_COMPONENT_ID}&pos=front`,
    { waitUntil: "networkidle" },
  );
  await page.locator(".fp5-am-root").waitFor({ timeout: 60_000 });
  await page.getByText("3 unconfirmed candidates").waitFor({ timeout: 30_000 });
  await page.getByText("Roam Fleet Match Intelligence Engine").waitFor({ timeout: 30_000 });
  const file = join(shots, "AM-S4F-app-checking.png");
  await screenshotAmS4F(page, file, 1);
  await browser.close();
  return file;
}

const light = await capture(false);
const dark = await capture(true);
const checking = await captureChecking();
const differ = readFileSync(light).compare(readFileSync(dark)) !== 0;
console.log(JSON.stringify({ light, dark, checking, differ }, null, 2));
if (!differ) process.exit(1);
