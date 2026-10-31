/**
 * @vitest-environment node
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const banned = ["Kingston", "1,850", "RFQ-88402", "1505LM", "5179KZ", "MANN-FILTER", "Honda Fit 2018", "J$ 4,850", "RQ-8821"];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === "markup" || name === "_html-jsx") continue;
      out.push(...walk(path));
    } else if (/\.(tsx|ts)$/.test(name) && !name.endsWith(".test.ts")) {
      out.push(path);
    }
  }
  return out;
}

describe("find parts screens do not hard-code the picture", () => {
  const dir = join(import.meta.dirname);
  const files = walk(dir);
  it("has screen files", () => {
    expect(files.length).toBeGreaterThan(3);
  });
  it("leaves sample names out of hand-written screens", () => {
    const text = files.map((path) => readFileSync(path, "utf8")).join("\n");
    for (const word of banned) expect(text.includes(word)).toBe(false);
  });
  it("does not use stitch embed or innerHTML", () => {
    const text = files.map((path) => readFileSync(path, "utf8")).join("\n");
    expect(text.includes("dangerouslySetInnerHTML")).toBe(false);
    expect(text.includes("find-parts/stitch/")).toBe(false);
  });
});
