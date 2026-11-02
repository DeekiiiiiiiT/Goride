import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repo = process.cwd();
const stitchDir = join(repo, "docs", "stitch", "dominion-redesign", "html");
const shotsDir = join(repo, "docs", "stitch", "dominion-redesign", "screenshots");

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

async function installOwnerSession(page: import("@playwright/test").Page) {
  const access = token();
  const user = {
    id: "11111111-1111-4111-8111-111111111111",
    aud: "authenticated",
    role: "authenticated",
    email: "owner@example.com",
    app_metadata: { role: "platform_owner" },
    user_metadata: { name: "Dominion Owner" },
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
}

const mockAreas = {
  areas: [
    {
      id: "b1000000-0000-4000-8000-000000000004",
      name: "Brakes",
      opCode: "BRK",
      iconKey: "brakes",
      partsOnFile: 12,
      fitsOnFile: 35,
      partTypes: ["Brake pads", "Brake rotor"],
      needsChecking: 2,
      lastImportAt: "2026-10-30T12:00:00Z",
      templateVersion: 2,
      sortOrder: 4,
    },
  ],
};

const mockTemplate = {
  columns: [
    { name: "vehicle", required: true },
    { name: "part_type", required: true },
    { name: "brand", required: true },
    { name: "part_number", required: true },
    { name: "match_type", required: true },
    { name: "year_from", required: false },
    { name: "year_to", required: false },
    { name: "source_url", required: true },
  ],
};

function stripStitchMain(html: string): string {
  const page = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "");
  const main = (page.match(/<main[\s\S]*<\/main>/i) || [page])[0];
  return main
    .replace(/<span class="material-symbols-outlined[^"]*">[\s\S]*?<\/span>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

function stitchPhrases(htmlFile: string, minLen = 8): string[] {
  const stitch = readFileSync(join(stitchDir, htmlFile), "utf8");
  const text = stripStitchMain(stitch);
  const out = new Set<string>();
  for (const chunk of text.split(/(?<=[.!?])\s+/)) {
    const t = chunk.trim();
    if (t.length >= minLen && /[a-z]/i.test(t) && !/^(FRAME|STATUS:|MATRIX VIEW)/i.test(t)) {
      out.add(t);
    }
  }
  return [...out].slice(0, 12);
}

async function mockPartsImportApi(page: import("@playwright/test").Page, mode: "pi1" | "pi2" | "ledger" = "pi1") {
  await page.route("**/admin/parts-import/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/areas") && !url.includes("template-schema")) {
      await route.fulfill({ json: mockAreas });
      return;
    }
    if (url.includes("template-schema")) {
      await route.fulfill({ json: mockTemplate });
      return;
    }
    if (url.includes("/ledger")) {
      await route.fulfill({ json: { items: [], total: 0, perArea: {} } });
      return;
    }
    if (url.includes("/meta")) {
      await route.fulfill({ json: { engineVersion: "2.4.0", integrityRatio: 1, workspaceId: "ws-test" } });
      return;
    }
    if (mode === "pi2" && url.includes("/batches") && route.request().method() === "POST") {
      await route.fulfill({
        json: { batch: { id: "44444444-4444-4444-8444-444444444441", code: "PI-E2E-1", status: "uploaded" }, path: "x" },
      });
      return;
    }
    await route.fulfill({ json: {} });
  });
}

test.describe("Dominion parts import Stitch fidelity", () => {
  test.beforeEach(async ({ page }) => {
    await installOwnerSession(page);
  });

  test("PI1 area picker matches Stitch", async ({ page }) => {
    await mockPartsImportApi(page, "pi1");
    await page.goto("/?page=parts-catalog&tab=Import");
    await expect(page.getByRole("heading", { name: "Which area are you importing?" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Each area has its own template and checks")).toBeVisible();
    await expect(page.getByRole("button", { name: /Import ledger/i })).toBeVisible();
    for (const phrase of stitchPhrases("PI1-import-pick-area.html")) {
      await expect(page.locator("main, .find-parts-flow").first()).toContainText(phrase, { timeout: 5_000 });
    }
    await page.screenshot({ path: join(shotsDir, "PI1-app.png"), fullPage: true });
  });

  test("PI2 upload step shows template columns inline", async ({ page }) => {
    await mockPartsImportApi(page, "pi2");
    await page.goto("/?page=parts-catalog&tab=Import");
    await page.getByRole("button", { name: /Brakes/i }).click();
    await expect(page.getByText("Columns in this template")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("SECURITY: ISOLATED PARSER SANDBOX")).toBeVisible();
    await page.screenshot({ path: join(shotsDir, "PI2-app.png"), fullPage: true });
  });

  test("PI5 ledger opens from picker", async ({ page }) => {
    await mockPartsImportApi(page, "pi1");
    await page.goto("/?page=parts-catalog&tab=Import");
    await page.getByRole("button", { name: /Import ledger/i }).click();
    await expect(page.getByText(/Batch History|Import ledger/i).first()).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: join(shotsDir, "PI5-app.png"), fullPage: true });
  });

  test("PI6 no-access hidden for owner", async ({ page }) => {
    await mockPartsImportApi(page, "pi1");
    await page.goto("/?page=parts-catalog&tab=Import");
    await expect(page.getByText("Which area are you importing?")).toBeVisible();
    await expect(page.getByText("Request access")).not.toBeVisible();
  });
});
