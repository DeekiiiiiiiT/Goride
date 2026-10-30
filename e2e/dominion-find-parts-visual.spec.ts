/**
 * Find parts screens with sample answers, so the pictures can be compared
 * even when the live catalog is almost empty.
 * Run: npx playwright test -c playwright.dominion.config.ts e2e/dominion-find-parts-visual.spec.ts
 */
import { expect, test } from "@playwright/test";
import fit from "./fixtures/find-parts/fit-2018.json" with { type: "json" };

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
});
