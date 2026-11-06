/**
 * Add-a-part behavioural done tests (audit § Done test).
 * SQL owns scenarios 1–6 and 12; this file covers 7–11 plus UI smoke for commerce-free copy.
 */
import { expect, test } from "@playwright/test";
import {
  AP_FORBIDDEN,
  assertNoForbidden,
  gotoAddParts,
  installAddPartsSession,
} from "./addPartsStitchHelpers";
import { createAddPartsMockState, installAddPartsMocks } from "./addPartsStitchMocks";

async function fillPartDetails(page: import("@playwright/test").Page, brand: string, number: string) {
  await page.locator('label:has-text("Brand")').locator("..").locator("input").fill(brand);
  await page.locator('label:has-text("Part number")').locator("..").locator("input").fill(number);
  await page.locator('label:has-text("Source page link")').locator("..").locator("input").fill("https://example.com/evidence");
}

async function pickTypeOpenDetails(page: import("@playwright/test").Page, typeName: string) {
  await page.getByRole("button", { name: typeName, exact: true }).click();
  const next = page.getByRole("button", { name: /Next: How it fits/i });
  await expect(next).toBeEnabled({ timeout: 10_000 });
  await next.scrollIntoViewIfNeeded();
  await next.click();
}

test.describe("Add parts done tests", () => {
  test.beforeEach(async ({ page }) => {
    await installAddPartsSession(page);
    await installAddPartsMocks(page, createAddPartsMockState());
  });

  test("7 abandon wizard at step 3 — draft clears on home", async ({ page }) => {
    page.on("dialog", (d) => d.accept());
    await gotoAddParts(page);
    await page.getByRole("button", { name: /Start/i }).click();
    await pickTypeOpenDetails(page, "Brake pads");
    await fillPartDetails(page, "MK Kashiyama", "D0051MH");
    await page.getByRole("button", { name: /Next: How it fits/i }).click();
    await expect(page.getByRole("heading", { name: /How does it fit/i })).toBeVisible();
    await page.getByRole("button", { name: /Next: replaces \(optional\)/i }).click();
    await expect(page.getByText(/Replaces a factory number/i)).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("heading", { name: "Add parts" })).toBeVisible();
    await page.getByRole("button", { name: /Start/i }).click();
    await expect(page.getByRole("heading", { name: /What kind of part/i })).toBeVisible();
    await pickTypeOpenDetails(page, "Brake pads");
    await expect(page.locator('label:has-text("Brand")').locator("..").locator("input")).toHaveValue("");
  });

  test("8 request part type appears in owner Part types", async ({ page }) => {
    page.on("dialog", (d) => d.accept());
    await gotoAddParts(page);
    await page.getByRole("button", { name: /Start/i }).click();
    await page.getByRole("button", { name: /Can't find it\? Ask to add a part type/i }).click();
    await page.getByPlaceholder("Part type name").fill("Custom widget");
    await page.getByPlaceholder("Why do you need it?").fill("Fleet uses these weekly");
    await page.getByRole("button", { name: "Submit request" }).click();
    await page.locator(".fixed.bottom-0").getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("heading", { name: "Add parts" })).toBeVisible();
    await page.getByRole("button", { name: "Part types" }).click();
    await expect(page.getByText("Custom widget")).toBeVisible();
    await page.getByRole("button", { name: "Create part type" }).first().click();
    await page.getByPlaceholder("Name").fill("AP test type");
    await page.getByPlaceholder("Op code e.g. BRK-PADS").fill("TST-AP");
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByText("AP test type")).toBeVisible();
  });

  test("9a brake pads step 2 specific cars", async ({ page }) => {
    await gotoAddParts(page);
    await page.getByRole("button", { name: /Start/i }).click();
    await pickTypeOpenDetails(page, "Brake pads");
    await fillPartDetails(page, "TestCo", "NUM-1");
    await page.getByRole("button", { name: /Next: How it fits/i }).click();
    await expect(page.getByText("Reset filters")).toBeVisible();
  });

  test("9b oil filter step 2 by engine", async ({ page }) => {
    await gotoAddParts(page);
    await page.getByRole("button", { name: /Start/i }).click();
    await pickTypeOpenDetails(page, "Oil filter");
    await fillPartDetails(page, "TestCo", "NUM-2");
    await page.getByRole("button", { name: /Next: How it fits/i }).click();
    await expect(page.getByPlaceholder(/Engine code/i)).toBeVisible();
  });

  test("9c wiper blades step 2 by spec", async ({ page }) => {
    await gotoAddParts(page);
    await page.getByRole("button", { name: /Start/i }).click();
    await pickTypeOpenDetails(page, "Wiper blades");
    await fillPartDetails(page, "TestCo", "NUM-3");
    await page.getByRole("button", { name: /Next: How it fits/i }).click();
    await expect(page.getByText(/Live catalog matcher|Driver wiper/i)).toBeVisible();
  });

  test("10 no forbidden commerce labels across wizard", async ({ page }) => {
    await gotoAddParts(page);
    await page.getByRole("button", { name: /Start/i }).click();
    await assertNoForbidden(page, AP_FORBIDDEN);
    await pickTypeOpenDetails(page, "Brake pads");
    await fillPartDetails(page, "MK Kashiyama", "D0051MH");
    await page.getByRole("button", { name: /Next: How it fits/i }).click();
    await assertNoForbidden(page, AP_FORBIDDEN, page.locator(".parts-database-stitch").last());
    await page.getByRole("button", { name: /Next: replaces \(optional\)/i }).click();
    await assertNoForbidden(page, AP_FORBIDDEN, page.locator(".parts-database-stitch").last());
  });

  test("11 non-owner staff completes brake pad flow to save", async ({ page }) => {
    await installAddPartsSession(page, { role: "platform_support" });
    const state = createAddPartsMockState();
    await installAddPartsMocks(page, state);
    await gotoAddParts(page);
    await page.getByRole("button", { name: /Start/i }).click();
    await pickTypeOpenDetails(page, "Brake pads");
    await fillPartDetails(page, "MK Kashiyama", "D0051MH");
    await page.getByRole("button", { name: /Next: How it fits/i }).click();
    await page.getByRole("button", { name: /Next: replaces \(optional\)/i }).click();
    await page.getByRole("button", { name: /Next: Review in plain words/i }).click();
    await page.getByRole("button", { name: /Save part/i }).click();
    await expect(page.getByRole("button", { name: "Add another part" })).toBeVisible({ timeout: 15_000 });
    expect(state.saveCalls).toBe(1);
  });

  test("AP3 single footer forward control", async ({ page }) => {
    await gotoAddParts(page);
    await page.getByRole("button", { name: /Start/i }).click();
    await pickTypeOpenDetails(page, "Brake pads");
    await fillPartDetails(page, "MK Kashiyama", "D0051MH");
    await expect(page.getByRole("button", { name: /Next: How it fits/i })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Submit for checking" })).toHaveCount(0);
  });

  test("5 duplicate lookup shows already exists (SQL owns full fit merge)", async ({ page }) => {
    await gotoAddParts(page);
    await page.getByRole("button", { name: /Start/i }).click();
    await pickTypeOpenDetails(page, "Brake pads");
    await fillPartDetails(page, "Dup", "EXIST-1");
    await expect(page.getByText(/already in the database/i)).toBeVisible({ timeout: 10_000 });
  });

  test("V1 part type icons are not raw icon_key words", async ({ page }) => {
    await gotoAddParts(page);
    await page.getByRole("button", { name: /Start/i }).click();
    const icons = page.locator(".material-symbols-outlined");
    const count = await icons.count();
    for (let i = 0; i < count; i++) {
      const t = (await icons.nth(i).innerText()).trim();
      expect(t).not.toMatch(/^(WRENCH|OIL|TIRES|DROPLET|WIND)$/i);
    }
  });
});
