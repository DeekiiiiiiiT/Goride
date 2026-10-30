import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fuelFreshness, orderNeeds } from "./fuelHomeFormat";

describe("fuel freshness", () => {
  it("is Current, Due, then Stale at 0, 3 and 8 days after the expected Thursday", () => {
    expect(fuelFreshness("2026-10-29", "2026-10-29")).toBe("current");
    expect(fuelFreshness("2026-10-26", "2026-10-29")).toBe("due");
    expect(fuelFreshness("2026-10-21", "2026-10-29")).toBe("stale");
  });
});

describe("needs you", () => {
  it("puts price review first, hides zero rows, and shows the sync gap even at zero", () => {
    expect(orderNeeds({
      review: 1,
      pending: 0,
      pins: 205,
      parish: 0,
      brand: 65,
      syncLogged: false,
    })).toEqual(["review", "pins", "brand", "sync"]);
  });

  it("is empty when every count is zero and a sync run is logged", () => {
    expect(orderNeeds({
      review: 0,
      pending: 0,
      pins: 0,
      parish: 0,
      brand: 0,
      syncLogged: true,
    })).toEqual([]);
  });
});

describe("fuel home copy", () => {
  it("does not hard-code the benchmark name", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const files = readdirSync(dir).filter((name) => name.endsWith(".tsx"));
    for (const name of files) {
      expect(readFileSync(join(dir, name), "utf8")).not.toMatch(/Petrojam/);
    }
  });
});
