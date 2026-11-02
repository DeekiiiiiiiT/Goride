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

async function mockPartsImportApi(page: import("@playwright/test").Page, mode: "pi1" | "pi2" | "pi3" | "pi4" | "ledger" | "pi6" = "pi1") {
  const batchId = "44444444-4444-4444-8444-444444444441";
  const mockSummary = {
    rowsTotal: 3,
    importableCount: 2,
    statusCounts: { valid: 2, error: 1 },
    issueCounts: [{ code: "MISSING_FIELD", count: 1 }],
    actions: { create_part: 2, add_fit: 2, update_part: 0, update_fit: 0 },
    engineVersion: "2.4.0",
    checkedAt: "2026-11-02T12:00:00Z",
  };
  const mockRows = {
    total: 3,
    rows: [
      { line_no: 1, status: "valid", accepted: true, raw: { vehicle: "Toyota", part_type: "Pad", brand: "OEM", part_number: "123" }, issues: [] },
      { line_no: 2, status: "error", accepted: false, raw: { vehicle: "?", part_number: "x" }, issues: [{ code: "MISSING_FIELD", message: "Missing brand" }] },
    ],
  };
  await page.route("**/admin/parts-import/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes("/areas") && !url.includes("template-schema")) {
      await route.fulfill({ json: mockAreas });
      return;
    }
    if (url.includes("template-schema")) {
      await route.fulfill({ json: mockTemplate });
      return;
    }
    if (url.includes("/ledger")) {
      if (mode === "pi6") {
        await route.fulfill({ json: { items: [], total: 0, perArea: {} } });
        return;
      }
      await route.fulfill({
        json: {
          items: [
            {
              id: batchId,
              code: "PI-E2E-1",
              area_id: mockAreas.areas[0].id,
              area_name: "Brakes",
              file_name: "brakes-ok.csv",
              status: "imported",
              rows_valid: 2,
              rows_error: 0,
              parts_created: 2,
              fits_created: 2,
              promoted_at: "2026-11-02T12:00:00Z",
              undo_open: true,
            },
          ],
          total: 1,
          perArea: { [mockAreas.areas[0].id]: 1 },
        },
      });
      return;
    }
    if (url.includes("/meta")) {
      await route.fulfill({ json: { engineVersion: "2.4.0", integrityRatio: 1, workspaceId: "ws-test" } });
      return;
    }
    if (url.includes("/summary") && method === "GET") {
      await route.fulfill({ json: mockSummary });
      return;
    }
    if (url.includes("/rows") && method === "GET" && !url.includes("/inspect")) {
      await route.fulfill({ json: mockRows });
      return;
    }
    if (url.includes("/inspect") && method === "GET") {
      await route.fulfill({
        json: {
          lineNo: 2,
          status: "error",
          schemaValidation: { passed: false, issues: [{ code: "MISSING_FIELD", message: "Missing brand" }] },
          fitmentAttributes: {},
          crossReferences: [],
        },
      });
      return;
    }
    if (mode === "pi2" && url.includes("/batches") && method === "POST") {
      await route.fulfill({
        json: { batch: { id: batchId, code: "PI-E2E-1", status: "uploaded" }, path: "x" },
      });
      return;
    }
    if ((mode === "pi3" || mode === "pi4") && url.includes(`/batches/${batchId}`) && method === "GET" && !url.includes("/rows/")) {
      const postPromote = url.includes("limit=500");
      await route.fulfill({
        json: {
          batch: {
            id: batchId,
            code: "PI-E2E-1",
            status: postPromote || mode === "pi4" ? "imported" : "checked",
            rows_total: 3,
            rows_valid: 2,
            rows_labelled: 0,
            rows_error: 1,
            checked_at: "2026-11-02T12:00:00Z",
            promoted_at: postPromote || mode === "pi4" ? "2026-11-02T12:05:00Z" : null,
            ledger_hash: "abc123def4567890",
            parts_created: 2,
            fits_created: 2,
          },
          rows: mockRows.rows,
          total: mockRows.total,
        },
      });
      return;
    }
    if (url.includes("/progress") && method === "GET") {
      await route.fulfill({
        json: { batch: { status: "checked", rows_checked: 3, rows_total: 3, check_stage: "fitment_matrix" } },
      });
      return;
    }
    if (url.includes("/source") && method === "POST") {
      await route.fulfill({ json: { ok: true, bytes: 512, path: "staging/x.csv" } });
      return;
    }
    if (url.includes("/check") && method === "POST") {
      await route.fulfill({ json: { batch: { id: batchId, status: "checked", rows_total: 3 } } });
      return;
    }
    if (url.includes("/promote") && method === "POST") {
      await route.fulfill({
        json: {
          result: {
            rowsImported: 2,
            partsCreated: 2,
            fitsCreated: 2,
            partsUpdated: 0,
            fitsUpdated: 0,
            ledgerHash: "abc123def4567890",
          },
        },
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
    await expect(page.getByText(/PARSER ENGINE:/i)).toBeVisible();
    await page.screenshot({ path: join(shotsDir, "PI5-app.png"), fullPage: true });
  });

  test("PI3 check step after upload (mocked API)", async ({ page }) => {
    await mockPartsImportApi(page, "pi3");
    const csv = join(repo, "supabase", "tests", "fixtures", "parts-import", "brakes-ok.csv");
    await page.goto("/?page=parts-catalog&tab=Import");
    await page.getByRole("button", { name: /Brakes/i }).click();
    await expect(page.getByText("Columns in this template")).toBeVisible({ timeout: 15_000 });
    await page.locator('input[type="file"]').setInputFiles(csv);
    await page.getByRole("button", { name: /Upload and check/i }).click();
    await expect(page.getByText("Will create")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: /Import \d+ rows/i })).toBeVisible();
    await page.getByRole("button", { name: "Inspect line 2" }).click();
    await expect(page.getByText("Line 2 Inspection")).toBeVisible();
    await page.screenshot({ path: join(shotsDir, "PI3-app.png"), fullPage: true });
  });

  test("PI4 done step after promote (mocked API)", async ({ page }) => {
    await mockPartsImportApi(page, "pi3");
    const csv = join(repo, "supabase", "tests", "fixtures", "parts-import", "brakes-ok.csv");
    await page.goto("/?page=parts-catalog&tab=Import");
    await page.getByRole("button", { name: /Brakes/i }).click();
    await page.locator('input[type="file"]').setInputFiles(csv);
    await page.getByRole("button", { name: /Upload and check/i }).click();
    await expect(page.getByRole("button", { name: /Import \d+ rows/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: /Import \d+ rows/i }).click();
    await expect(page.getByText(/Imported .* rows into Brakes/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/LEDGER HASH:/i)).toBeVisible();
    await page.screenshot({ path: join(shotsDir, "PI4-app.png"), fullPage: true });
  });

  test("PI6 empty ledger area chip", async ({ page }) => {
    await mockPartsImportApi(page, "pi6");
    await page.goto("/?page=parts-catalog&tab=Import");
    await page.getByRole("button", { name: /Import ledger/i }).click();
    await page.getByRole("button", { name: /Brakes 0/i }).click();
    await expect(page.getByText("No Brakes imports yet")).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: join(shotsDir, "PI6-app.png"), fullPage: true });
  });

  test("PI6 no-access hidden for owner", async ({ page }) => {
    await mockPartsImportApi(page, "pi1");
    await page.goto("/?page=parts-catalog&tab=Import");
    await expect(page.getByText("Which area are you importing?")).toBeVisible();
    await expect(page.getByText("Request access")).not.toBeVisible();
  });
});
