/**
 * @vitest-environment node
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repo = join(import.meta.dirname, "..", "..", "..", "..", "..", "..");

const DESIGN_TOKEN =
  /^(font|text)-(headline|body|caption|label|mono)(-[a-z0-9]+)?$|^(space-[xy]-space-|gap-[xy]-space-|gap-space-|divide-space-)|^(-mx|-mb|-mt|mx|my|mt|mb|ml|mr|p|px|py|pt|pb|pl|pr|m)-(space-|margin|gutter)/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (/\.tsx$/.test(name)) out.push(path);
  }
  return out;
}

function extractClasses(source: string): string[] {
  const tokens = new Set<string>();
  for (const m of source.matchAll(/className="([^"]*)"/g)) {
    for (const part of m[1].split(/\s+/)) {
      const t = part.trim();
      if (t && !/["{}]/.test(t)) tokens.add(t);
    }
  }
  return [...tokens];
}

function cssDefinesClass(css: string, scope: string, token: string): boolean {
  if (/["{}]/.test(token)) return true;
  const group = token.match(/^group-hover:(.+)$/);
  if (group) {
    const rest = group[1].replace(/:/g, "\\:").replace(/\//g, "\\/");
    return css.includes(`.${scope}`) && css.includes(`.group:hover .group-hover\\:${rest}`);
  }
  const hover = token.match(/^hover:(.+)$/);
  if (hover) {
    const rest = hover[1].replace(/:/g, "\\:").replace(/\//g, "\\/");
    if (css.includes(`.${scope} .hover\\:${rest}:hover`)) return true;
  }
  const opacity = token.match(/^(.+)\/(\d+)$/);
  const bare = opacity ? opacity[1] : token;
  const escaped = bare.replace(/:/g, "\\:").replace(/\//g, "\\/");
  const needle = `.${scope} .${escaped}`;
  if (css.includes(needle)) return true;
  if (opacity && css.includes(`.${scope} .${escaped}\\\\/${opacity[2]}`)) return true;
  return false;
}

function needsDesignTokenRule(token: string): boolean {
  if (!token || token.includes("[") || token.includes("(") || /["{}]/.test(token)) return false;
  if (/^bg-amber|^text-amber|^border-amber/.test(token)) return false;
  let bare = token;
  const prefixed = token.match(/^(hover|group-hover):(.*)$/);
  if (prefixed) bare = prefixed[2];
  if (DESIGN_TOKEN.test(bare)) return true;
  if (/^(bg|text|border)-.+\/\d+$/.test(bare)) return true;
  const colorPrefix = bare.replace(/^(bg|text|border)-/, "");
  if (/^(surface|on-|primary|secondary|tertiary|error|outline|inverse|background|inverse-)/.test(colorPrefix)) return true;
  if (/^(hover|group-hover):(bg|text|border)-(surface|on-|primary|secondary|tertiary|error|outline|inverse)/.test(token)) return true;
  return false;
}

function assertCoverage(scope: string, cssPath: string, scanDirs: string[]) {
  const css = readFileSync(cssPath, "utf8");
  const missing: string[] = [];
  for (const dir of scanDirs) {
    for (const file of walk(dir).filter((f) => !f.includes("markup/") && !f.endsWith(".css"))) {
      const src = readFileSync(file, "utf8");
      for (const token of extractClasses(src)) {
        if (!needsDesignTokenRule(token)) continue;
        if (!cssDefinesClass(css, scope, token)) missing.push(`${token} (${file})`);
      }
    }
  }
  expect(missing, missing.slice(0, 25).join("\n")).toEqual([]);
}

describe("find parts stitch CSS coverage", () => {
  it("defines custom design tokens used in fleet find-parts TSX", () => {
    assertCoverage(
      "fleet-find-parts-stitch",
      join(repo, "apps/fleet/src/components/vehicles/find-parts/findParts.css"),
      [join(repo, "apps/fleet/src/components/vehicles/find-parts")],
    );
  });

  it("defines custom design tokens used in dominion pending-parts TSX", () => {
    assertCoverage(
      "pending-parts-stitch",
      join(repo, "apps/admin/src/components/admin/vehicle-catalog/pending-parts/pendingParts.css"),
      [join(repo, "apps/admin/src/components/admin/vehicle-catalog/pending-parts")],
    );
  });
});
