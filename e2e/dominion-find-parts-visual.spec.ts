/**
 * Find parts screens with sample answers, so the pictures can be compared
 * even when the live catalog is almost empty.
 * Run: npx playwright test -c playwright.dominion.config.ts e2e/dominion-find-parts-visual.spec.ts
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import fit from "./fixtures/find-parts/fit-2018.json" with { type: "json" };
import fullDatabase from "./fixtures/find-parts/full-database.json" with { type: "json" };

function fileHash(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

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

test("find parts car step renders with the sample car", async ({ page }) => {
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
    await route.fulfill({ json: session });
  });
  await page.route("**/functions/v1/**", async (route) => {
    const url = route.request().url();
    if (url.includes("vehicle-options")) {
      await route.fulfill({ json: { makes: ["Honda"], models: ["Fit"], years: [2018] } });
      return;
    }
    if (url.includes("find-parts/coverage")) {
      await route.fulfill({ json: { variantId: fit.candidates[0].id, areas: [] } });
      return;
    }
    if (url.includes("find-parts")) {
      await route.fulfill({
        json: {
          mode: "tiered",
          car: fit.car,
          candidates: fit.candidates,
          askVariant: true,
          variants: fit.candidates.map((row) => ({ id: row.id, make: "Honda", model: "Fit", chassis_code: row.codeLine })),
          picked: null,
          sections: [],
          plainSections: [],
          emptyTiers: [1, 2, 3, 4, 5],
        },
      });
      return;
    }
    if (url.includes("parts-overview")) {
      await route.fulfill({
        json: {
          vehicles: 1,
          partsOnFile: 11,
          fitmentsOnFile: 35,
          vehiclesWithParts: 1,
          waiting: 0,
          matchTypesOff: false,
        },
      });
      return;
    }
    if (url.includes("parts/browse")) {
      await route.fulfill({ json: { systems: [], common: [{ id: fit.part.id, plainName: fit.part.plainName }] } });
      return;
    }
    if (url.includes("parts/term")) {
      await route.fulfill({
        json: {
          hits: [{ kind: "part", id: fit.part.id, plainName: fit.part.number }],
          components: [],
          synonyms: [],
          parts: [{ id: fit.part.id, number: fit.part.number, name: fit.part.plainName }],
        },
      });
      return;
    }
    await route.fulfill({ json: {} });
  });

  await page.goto("/?page=parts-catalog");
  await expect(page.getByText("Which car is it?")).toBeVisible();
  await expect(page.getByText("Match types on")).toBeVisible();
  await expect(page.getByText("INDEX: 35 FITMENTS")).toBeVisible();
});

test("parts database keeps the tab in the address bar", async ({ page }) => {
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
    await route.fulfill({ json: session });
  });
  await page.route("**/functions/v1/**", async (route) => {
    await route.fulfill({
      json: {
        vehicles: 1,
        partsOnFile: 11,
        fitmentsOnFile: 35,
        vehiclesWithParts: 1,
        waiting: 0,
        matchTypesOff: true,
        families: [],
        batches: [],
        rows: [],
      },
    });
  });
  await page.goto("/?page=parts-catalog&tab=import");
  await expect(page.getByRole("navigation", { name: "Database sections" }).getByRole("button", { name: "Import" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Match types off")).toBeVisible();
  await page.getByRole("button", { name: "Advanced tune" }).click();
  await expect(page).toHaveURL(/tab=advanced/);
  await expect(page.getByRole("button", { name: "Advanced tune" })).toHaveAttribute("aria-pressed", "true");
  await page.goBack();
  await expect(page).toHaveURL(/tab=import/);
  await page.goto("/?page=parts-catalog&tab=vehicle");
  await expect(page).toHaveURL(/tab=database/);
  await expect(page.getByRole("navigation", { name: "Database sections" }).getByRole("button", { name: "Full database" })).toHaveAttribute("aria-current", "page");
  await page.goto("/?page=parts-catalog&tab=verify");
  await expect(page).toHaveURL(/tab=database/);
  await expect(page).toHaveURL(/status=needs_checking/);
  await expect(page.getByRole("navigation", { name: "Database sections" }).getByRole("button", { name: "Full database" })).toHaveAttribute("aria-current", "page");
  await page.goto("/?page=2&tab=database&match=oem");
  await expect(page).toHaveURL(/page=parts-catalog/);
  await expect(page).toHaveURL(/[?&]p=2/);
  await expect(page).not.toHaveURL(/[?&]page=2(?:&|$)/);
});

test("full database uses the filter panel and grouped table", async ({ page }) => {
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
    await route.fulfill({ json: session });
  });
  await page.route("**/functions/v1/**", async (route) => {
    const url = route.request().url();
    if (url.includes("parts/master")) {
      await route.fulfill({ json: fullDatabase });
      return;
    }
    if (url.includes("vehicle-options")) {
      await route.fulfill({ json: { makes: ["Toyota"], models: ["Roomy"], years: [2019] } });
      return;
    }
    await route.fulfill({
      json: { vehicles: 1, partsOnFile: 4, fitmentsOnFile: 18, vehiclesWithParts: 1, waiting: 2, matchTypesOff: false, lastCatalogChangeAt: "2026-10-30T18:15:00.000Z", families: [], items: [] },
    });
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?page=parts-catalog&tab=database");
  await expect(page.getByRole("heading", { name: "Parts database" })).toBeVisible();
  await expect(page.getByText("Every part, car family and size-based part on file")).toBeVisible();
  await expect(page.getByText("Made for the car").first()).toBeVisible();
  await expect(page.getByText("Nothing on file for: Fits the engine.")).toBeVisible();
  await expect(page.getByText("0 records matched for current filter")).toBeVisible();
  await expect(page.getByText(/INDEX .+ · \d+MS LATENCY/)).toBeVisible();
  await expect(page.getByText("Catalog notice:")).toBeVisible();
  await expect(page.getByText("OWNER_RW")).toBeVisible();
  await expect(page.getByRole("button", { name: "Verification queue" })).toHaveCount(0);
  const statusLabels = page.locator("label:has(input[name='status_radio'])");
  await expect(statusLabels.nth(0)).toContainText("2");
  await expect(statusLabels.nth(1)).toContainText("0");
  await expect(statusLabels.nth(2)).toContainText("2");
  const lightShot = "docs/stitch/dominion-redesign/screenshots/S42l-full-database-live-light.png";
  const darkShot = "docs/stitch/dominion-redesign/screenshots/S42l-full-database-live-dark.png";
  const panel = page.locator(".full-database aside");
  await page.evaluate(() => {
    document.documentElement.classList.remove("dark");
    document.documentElement.style.colorScheme = "light";
    localStorage.setItem("preference_dark_mode", "false");
  });
  await expect(panel).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await page.screenshot({ path: lightShot, fullPage: true });

  await page.evaluate(() => {
    document.documentElement.classList.add("dark");
    document.documentElement.style.colorScheme = "dark";
    localStorage.setItem("preference_dark_mode", "true");
  });
  await expect(panel).toHaveCSS("background-color", "rgb(17, 24, 39)");
  const titleColor = await page.evaluate(() => {
    const title = document.querySelector(".parts-db-title");
    return title ? getComputedStyle(title).color : "";
  });
  expect(titleColor).not.toBe("rgb(25, 27, 36)");
  await page.screenshot({ path: darkShot, fullPage: true });
  expect(fileHash(lightShot)).not.toBe(fileHash(darkShot));

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: /Filters/ })).toBeVisible();
  const overflow = await page.evaluate(() => {
    const panel = document.querySelector(".full-database");
    if (!panel) return false;
    return panel.scrollWidth <= panel.clientWidth + 8;
  });
  expect(overflow).toBe(true);
  await expect(page.locator(".group-head").getByText("OEM").first()).toBeVisible();
  await expect(page.getByText("1 record in file").first()).toBeVisible();
  await page.screenshot({ path: "docs/stitch/dominion-redesign/screenshots/S42l-full-database-live-phone.png", fullPage: true });
});
