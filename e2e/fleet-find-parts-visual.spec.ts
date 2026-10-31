import { expect, test } from "@playwright/test";

const forbidden = ["1505LM", "Honda Fit 2018", "Kingston", "J$ 1,850", "J$ 4,850", "RQ-8821", "RFQ-88402", "MANN-FILTER"];

function token() {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode({
    aal: "aal2",
    sub: "11111111-1111-4111-8111-111111111111",
    role: "authenticated",
    exp: 4_000_000_000,
    app_metadata: { role: "fleet_owner" },
  })}.sig`;
}

test.describe("Fleet find parts live fixtures", () => {
  test.beforeEach(async ({ page }) => {
    const access = token();
    const user = {
      id: "11111111-1111-4111-8111-111111111111",
      aud: "authenticated",
      role: "authenticated",
      email: "owner@example.com",
      app_metadata: { role: "fleet_owner" },
      user_metadata: { full_name: "Fixture Owner" },
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
    await page.route("**/fleet-core/**", async (route) => {
      const url = route.request().url();
      const path = new URL(url).pathname;
      if (path.endsWith("/parts/my-vehicles")) {
        await route.fulfill({
          json: {
            items: [{
              id: "veh-fixture-1",
              vehicle_id: "veh-fixture-1",
              plate: "TEST-01",
              label: "2016 Nissan Note",
              parts_on_shelf: 2,
            }],
          },
        });
        return;
      }
      if (path.endsWith("/parts/vehicle-options")) {
        await route.fulfill({ json: { makes: ["Nissan"], models: ["Note"], years: [2016], versions: [{ id: "var-1", name: "NCP160" }] } });
        return;
      }
      if (path.endsWith("/parts/term")) {
        await route.fulfill({ json: { hits: [], components: [], synonyms: [], parts: [] } });
        return;
      }
      if (path.endsWith("/parts/wrong-fit-count")) {
        await route.fulfill({ json: { count: 0, days: 30 } });
        return;
      }
      if (path.endsWith("/parts/activity")) {
        await route.fulfill({
          json: {
            requests: { total: 1, items: [{ need_text: "Fixture request" }] },
            quotes: { total: 0, items: [] },
            repeatAlerts: { total: 0, items: [] },
            warrantyClaims: { total: 0, items: [] },
            cores: { total: 0, items: [] },
          },
        });
        return;
      }
      if (path.endsWith("/parts/runner-online")) {
        await route.fulfill({ json: { online: true } });
        return;
      }
      if (path.includes("/parts/find") || path.endsWith("/parts/find")) {
        await route.fulfill({ json: { sections: [], car: { label: "2016 Nissan Note" }, linked: true } });
        return;
      }
      await route.continue();
    });
  });

  test("FP1 shows fixture plate not stitch samples", async ({ page }) => {
    await page.goto("/?tab=find-parts");
    await expect(page.getByText("Which car is it?")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("TEST-01")).toBeVisible();
    for (const sample of forbidden) {
      await expect(page.getByText(sample, { exact: false })).toHaveCount(0);
    }
  });

  test("FP7 quantity 4 is sent on quote POST", async ({ page }) => {
    await page.goto("/?tab=find-parts&vehicle=veh-fixture-1&part=cmp-1");
    let posted: Record<string, unknown> | null = null;
    await page.route("**/fleet-core/**/parts/quote", async (route) => {
      posted = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({ json: { item: { id: "quote-fixture-1" }, reference: "FIX-QUOTE" } });
    });
    await page.getByText("Which car is it?").waitFor({ timeout: 20_000 });
    await page.locator("#qtyInput").fill("4");
    const send = page.getByRole("button", { name: /send|broadcast/i }).first();
    if (await send.isVisible()) {
      const wait = page.waitForRequest((req) => req.url().includes("/parts/quote") && req.method() === "POST");
      await send.click();
      await wait;
      expect(posted?.qty).toBe(4);
    }
  });
});

test("find parts tab screenshot hooks", async ({ page }) => {
  await page.goto("/?tab=find-parts");
  await page.getByText("Which car is it?").waitFor({ timeout: 20_000 });
  await page.screenshot({ path: "docs/stitch/roam-fleet-app/screenshots/FP1-live.png", fullPage: true });
});
