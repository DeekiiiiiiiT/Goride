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

/** Every in-scope visible button under parts-database-stitch must have fill or border (B1–B33 gate). */
export async function assertPartsDatabaseButtonsHaveBorderOrFill(page: Page) {
  const bad = await page.evaluate(() => {
    const root = document.querySelector(".parts-database-stitch");
    if (!root) return ["missing .parts-database-stitch"];
    const issues: string[] = [];
    for (const btn of root.querySelectorAll("button")) {
      if (!(btn instanceof HTMLButtonElement)) continue;
      const style = window.getComputedStyle(btn);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const rect = btn.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue;
      if (btn.closest('nav[aria-label="Database sections"]')) continue;
      if (btn.closest(".find-parts-stepbar") || btn.closest(".find-parts-trail")) continue;
      const bg = style.backgroundColor;
      const hasBg = Boolean(bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent");
      const bw = Math.max(
        parseFloat(style.borderTopWidth) || 0,
        parseFloat(style.borderRightWidth) || 0,
        parseFloat(style.borderBottomWidth) || 0,
        parseFloat(style.borderLeftWidth) || 0,
      );
      const hasBorder = bw > 0 && style.borderTopStyle !== "none";
      if (!hasBg && !hasBorder) {
        const label = (btn.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 48)
          || btn.getAttribute("aria-label")
          || "button";
        issues.push(label);
      }
    }
    return issues;
  });
  expect(bad, `Buttons missing border or fill: ${bad.join("; ")}`).toEqual([]);
}

/** Cancel wizard overlay: readable title, secondary border, solid red confirm (R1 done-test). */
export async function assertCancelOverlayButtonStyling(page: Page, dark: boolean) {
  const checks = await page.evaluate((useDark) => {
    const panel = document.querySelector('[data-slot="alert-dialog-content"]');
    if (!panel) return { ok: false, reason: "missing dialog panel" };
    const title = panel.querySelector('[data-slot="alert-dialog-title"]');
    if (!title) return { ok: false, reason: "missing title" };
    const panelStyle = window.getComputedStyle(panel);
    const titleStyle = window.getComputedStyle(title);
    const parseRgb = (color: string): [number, number, number] | null => {
      const m = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      if (!m) return null;
      return [Number(m[1]), Number(m[2]), Number(m[3])];
    };
    const lum = (r: number, g: number, b: number) => {
      const ch = (c: number) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
    };
    const contrast = (fg: string, bg: string) => {
      const f = parseRgb(fg);
      const b = parseRgb(bg);
      if (!f || !b) return null;
      const l1 = lum(...f);
      const l2 = lum(...b);
      const lighter = Math.max(l1, l2);
      const darker = Math.min(l1, l2);
      return (lighter + 0.05) / (darker + 0.05);
    };
    const ratio = contrast(titleStyle.color, panelStyle.backgroundColor);
    const keepBtn = Array.from(panel.querySelectorAll("button")).find((b) => /keep editing/i.test(b.textContent ?? ""));
    const cancelBtn = panel.querySelector(".parts-btn--danger-confirm");
    if (!keepBtn || !cancelBtn) return { ok: false, reason: "missing action buttons" };
    const keepStyle = window.getComputedStyle(keepBtn);
    const cancelStyle = window.getComputedStyle(cancelBtn);
    const borderW = Math.max(
      parseFloat(keepStyle.borderTopWidth) || 0,
      parseFloat(keepStyle.borderRightWidth) || 0,
      parseFloat(keepStyle.borderBottomWidth) || 0,
      parseFloat(keepStyle.borderLeftWidth) || 0,
    );
    const cancelBg = parseRgb(cancelStyle.backgroundColor);
    const isRed =
      cancelBg != null &&
      (useDark
        ? cancelBg[0] >= 220 && cancelBg[1] <= 90 && cancelBg[2] <= 90
        : cancelBg[0] >= 200 && cancelBg[1] <= 70 && cancelBg[2] <= 70);
    return {
      ok: true,
      ratio,
      hasKeepBorder: borderW > 0 && keepStyle.borderTopStyle !== "none",
      isRed,
    };
  }, dark);
  expect(checks.ok, "overlay DOM").toBe(true);
  if (!checks.ok) return;
  expect(checks.ratio, "title contrast on panel").toBeGreaterThanOrEqual(4.5);
  expect(checks.hasKeepBorder, "Keep editing border").toBe(true);
  expect(checks.isRed, "Cancel part red background").toBe(true);
}

export async function installPartsImportAreasMock(page: Page) {
  await page.route("**/admin/parts-import/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/areas") && !url.includes("template-schema")) {
      await route.fulfill({
        json: {
          areas: [{
            id: "b1000000-0000-4000-8000-000000000004",
            name: "Brakes",
            opCode: "BRK",
            iconKey: "brakes",
            partsOnFile: 12,
            fitsOnFile: 35,
            partTypes: ["Brake pads"],
            needsChecking: 0,
            templateVersion: 2,
            sortOrder: 4,
          }],
        },
      });
      return;
    }
    if (url.includes("/meta")) {
      await route.fulfill({ json: { engineVersion: "2.4.0", integrityRatio: 1, workspaceId: "ws-test" } });
      return;
    }
    await route.fulfill({ json: {} });
  });
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
    app_metadata: { role, roles: [role] },
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
    /** Vite testcopy uses VITE_SUPABASE_URL=http://127.0.0.1:54321 → storage key prefix `127` (first hostname segment). */
    localStorage.setItem("sb-127-auth-token", JSON.stringify(stored));
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
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes("/mfa/")) {
      await route.fulfill({ json: { currentLevel: "aal2", nextLevel: "aal2" } });
      return;
    }
    if (method === "GET" && /\/auth\/v1\/user(?:\?|$)/.test(url)) {
      await route.fulfill({ json: { user } });
      return;
    }
    await route.fulfill({ json: session });
  });
}

export async function prepareAddPartsScreen(page: Page, dark: boolean) {
  await gotoAddParts(page);
  await applyAddPartsTheme(page, dark);
  await assertAddPartsTheme(page, dark);
}

export async function gotoAddParts(page: Page, querySuffix = "") {
  const base = "/?page=parts-catalog&tab=add-parts";
  const extra = querySuffix.startsWith("?") ? querySuffix.replace("?", "&") : querySuffix;
  await page.goto(`${base}${extra}`);
  if (querySuffix.includes("addPartsStates") || querySuffix.includes("addPartsPositionCatalog")) {
    await expect(page.locator(".parts-database-stitch").first()).toBeVisible({ timeout: 20_000 });
    return;
  }
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
