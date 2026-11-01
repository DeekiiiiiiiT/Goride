/**
 * @vitest-environment node
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FIND_PARTS_FORBIDDEN_SAMPLES } from "./findParts.noSample.banned";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      out.push(...walk(path));
    } else if (/\.(tsx|ts|jsx)$/.test(name) && !name.endsWith(".test.ts") && name !== "findParts.noSample.banned.ts") {
      out.push(path);
    }
  }
  return out;
}

function joinedStringLiterals(source: string): string[] {
  const chunks: string[] = [];
  const re = /(?:["'`])([^"'`]*)(?:["'`])(?:\s*\+\s*(?:["'`])([^"'`]*)(?:["'`]))+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    chunks.push(m[0].replace(/["'`]/g, "").replace(/\s*\+\s*/g, ""));
  }
  const joinRe = /\[(?:\s*(?:["'`])([^"'`]*)(?:["'`])\s*,?)+\]\.join\s*\(\s*(?:["'`])\s*(?:["'`])\s*\)/g;
  while ((m = joinRe.exec(source))) {
    const inner = m[0].match(/["'`]([^"'`]+)["'`]/g);
    if (inner) chunks.push(inner.map((q) => q.slice(1, -1)).join(""));
  }
  return chunks;
}

describe("find parts screens do not hard-code Stitch sample data", () => {
  const dir = join(import.meta.dirname);
  const files = walk(dir);

  it("has screen files", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("leaves forbidden sample strings out of all find-parts sources", () => {
    const text = files.map((path) => readFileSync(path, "utf8")).join("\n");
    for (const word of FIND_PARTS_FORBIDDEN_SAMPLES) {
      expect(text.includes(word), `found banned sample: ${word}`).toBe(false);
    }
  });

  it("does not recompose banned tokens via split strings", () => {
    for (const path of files) {
      const source = readFileSync(path, "utf8");
      for (const composed of joinedStringLiterals(source)) {
        for (const word of FIND_PARTS_FORBIDDEN_SAMPLES) {
          expect(composed.includes(word), `${path} composes ${word}`).toBe(false);
        }
      }
    }
  });

  it("does not use stitch embed or innerHTML", () => {
    const text = files.map((path) => readFileSync(path, "utf8")).join("\n");
    expect(text.includes("dangerouslySetInnerHTML")).toBe(false);
    expect(text.includes("find-parts/stitch/")).toBe(false);
  });

  it("does not use DOM fill or text-click patterns", () => {
    const banned = ["applyFindPartsLiveText", "createTreeWalker", "onFpClick", "@ts-nocheck", "Auto-generated from Stitch"];
    const text = files.map((path) => readFileSync(path, "utf8")).join("\n");
    for (const token of banned) expect(text.includes(token)).toBe(false);
    expect(text.split("label.includes").length - 1).toBe(0);
  });

  it("does not embed string literals longer than 300 characters", () => {
    for (const path of files) {
      const source = readFileSync(path, "utf8");
      for (const line of source.split("\n")) {
        if (line.includes("${")) continue;
        for (const m of line.matchAll(/"([^"]*)"/g)) {
          expect(m[1].length, `${path} line >300 chars`).toBeLessThanOrEqual(300);
        }
        for (const m of line.matchAll(/'([^']*)'/g)) {
          expect(m[1].length, `${path} line >300 chars`).toBeLessThanOrEqual(300);
        }
      }
    }
  });
});
