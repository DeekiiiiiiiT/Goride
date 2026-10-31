/**
 * @vitest-environment node
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const banned = ["Kingston", "1,850", "RFQ-88402", "1505LM", "5179KZ"];

describe("find parts screens do not hard-code the picture", () => {
  const dir = join(import.meta.dirname);
  const files = readdirSync(dir).filter((name) => name.endsWith(".tsx"));
  it("has screen files", () => {
    expect(files.length).toBeGreaterThan(3);
  });
  it("leaves sample names out of the screens", () => {
    const text = files.map((name) => readFileSync(join(dir, name), "utf8")).join("\n");
    for (const word of banned) expect(text.includes(word)).toBe(false);
  });
});
