import { createHash } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const AP_FORBIDDEN = [/confidence\s*:\s*\d/i, /\bprice\b/i, /\bsupplier\b/i, /NODE:\s*OK/i];

const stitchHtmlDir = join(process.cwd(), "docs", "stitch", "dominion-add-a-part", "html");

export function fileHash(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function applyAddPartsTheme(page: Page, dark: boolean) {
  return page.evaluate((useDark) => {
    if (useDark) {
      document.documentElement.classList.add("dark");
      document.documentElement.style.colorScheme = "dark";
      localStorage.setItem("preference_dark_mode", "true");
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.style.colorScheme = "light";
      localStorage.setItem("preference_dark_mode", "false");
    }
  }, dark);
}

export async function assertAddPartsTheme(page: Page, dark: boolean) {
  const bg = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
  if (dark) {
    expect(bg).not.toBe("rgb(255, 255, 255)");
  } else {
    expect(bg).not.toBe("rgb(17, 24, 39)");
  }
}

export function ownerToken(role: "platform_owner" | "platform_support" = "platform_owner") {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode({
    aal: "aal2",
    sub: "11111111-1111-4111-8111-111111111111",
    role: "authenticated",
    exp: 4_000_000_000,
    app_metadata: { role },
  })}.sig`;
}

export async function installAddPartsSession(page: Page, opts?: { dark?: boolean; role?: "platform_owner" | "platform_support" }) {
  const access = ownerToken(opts?.role ?? "platform_owner");
  const role = opts?.role ?? "platform_owner";
  const user = {
    id: "11111111-1111-4111-8111-111111111111",
    aud: "authenticated",
    role: "authenticated",
    email: role === "platform_owner" ? "owner@example.com" : "staff@example.com",
    app_metadata: { role },
    user_metadata: { name: role === "platform_owner" ? "Dominion Owner" : "Dominion Staff" },
  };
  const session = {
    access_token: access,
    refresh_token: "refresh",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user,
  };
  await page.addInitScript(({ stored, useDark }) => {
    localStorage.setItem("sb-example-auth-token", JSON.stringify(stored));
    localStorage.setItem("sb-csfllzzastacofsvcdsc-auth-token", JSON.stringify(stored));
    if (useDark) {
      document.documentElement.classList.add("dark");
      document.documentElement.style.colorScheme = "dark";
      localStorage.setItem("preference_dark_mode", "true");
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.style.colorScheme = "light";
      localStorage.setItem("preference_dark_mode", "false");
    }
  }, { stored: session, useDark: Boolean(opts?.dark) });
  await page.route("**/auth/v1/**", async (route) => {
    await route.fulfill({ json: session });
  });
}

export async function prepareAddPartsScreen(page: Page, dark: boolean) {
  await gotoAddParts(page);
  await applyAddPartsTheme(page, dark);
  await assertAddPartsTheme(page, dark);
}

export async function gotoAddParts(page: Page) {
  await page.goto("/?page=parts-catalog&tab=add-parts");
  await expect(page.getByRole("heading", { name: "Add parts" })).toBeVisible({ timeout: 20_000 });
}

export async function assertNoForbidden(page: Page, patterns: RegExp[], scope?: import("@playwright/test").Locator) {
  const text = await (scope ?? page.locator("body")).innerText();
  for (const re of patterns) expect(text).not.toMatch(re);
}

export function stitchPhrases(htmlFile: string, minLen = 8): string[] {
  const stitch = readFileSync(join(stitchHtmlDir, htmlFile), "utf8");
  const out = new Set<string>();
  for (const m of stitch.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)) {
    const t = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (t.length >= minLen && t.length <= 120) out.add(t);
  }
  return [...out];
}

export async function assertStitchHeadings(page: Page, htmlFile: string, scope: import("@playwright/test").Locator) {
  const phrases = stitchPhrases(htmlFile);
  const text = await scope.innerText();
  for (const phrase of phrases.slice(0, 6)) {
    expect(text, `Missing Stitch heading: ${phrase}`).toContain(phrase);
  }
}

export async function assertEveryControlDoesSomething(page: Page, scope: import("@playwright/test").Locator) {
  const controls = scope.locator(
    'button:visible, a[href]:visible, [role="tab"]:visible, input[type="checkbox"]:visible, input[type="radio"]:visible',
  );
  const count = await controls.count();
  for (let i = 0; i < count; i++) {
    const control = controls.nth(i);
    const label = (await control.innerText().catch(() => "")).replace(/\s+/g, " ").trim()
      || (await control.getAttribute("aria-label")) || `control-${i}`;
    if (/^(Close|Dismiss|Cancel)$/i.test(label)) continue;
    if (!await control.isVisible().catch(() => false)) continue;
    const urlBefore = page.url();
    const dialogsBefore = await page.getByRole("dialog").count();
    let apiHits = 0;
    const onReq = (req: import("@playwright/test").Request) => {
      if (req.url().includes("/admin/catalog/") && req.method() !== "GET") apiHits++;
    };
    page.on("request", onReq);
    await control.click({ timeout: 5_000 }).catch(() => undefined);
    await page.waitForTimeout(200);
    page.off("request", onReq);
    const dialogOpen = (await page.getByRole("dialog").count()) > dialogsBefore;
    const moved = page.url() !== urlBefore;
    const expanded = await control.getAttribute("aria-expanded").catch(() => null);
    const pressed = await control.getAttribute("aria-pressed").catch(() => null);
    const replacedByForm = (await scope.getByRole("button", { name: label, exact: true }).count()) === 0
      && (await scope.locator("input:visible, textarea:visible, select:visible").count()) > 0;
    expect(
      moved || dialogOpen || apiHits > 0 || expanded === "true" || pressed === "true" || replacedByForm,
      `Control did nothing: ${label}`,
    ).toBeTruthy();
    if (dialogOpen) {
      await page.keyboard.press("Escape").catch(() => undefined);
    }
    if (moved) await page.goBack().catch(() => undefined);
  }
}

export async function wizardThroughStep2BrakePads(page: Page) {
  await gotoAddParts(page);
  await page.getByRole("button", { name: /Start/i }).click();
  await page.getByRole("button", { name: "Brake pads" }).click();
  await page.getByLabel(/^Brand$/i).fill("MK Kashiyama");
  await page.getByLabel(/^Part number$/i).fill("D0051MH");
  await page.getByLabel(/Source link/i).fill("https://example.com/src");
  await page.getByRole("button", { name: "Next" }).click();
}
