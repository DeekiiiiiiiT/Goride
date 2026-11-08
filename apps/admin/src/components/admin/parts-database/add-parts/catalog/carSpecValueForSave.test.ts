import { describe, expect, it } from "vitest";
import { carSpecValueForSave } from "./carSpecValueForSave";

describe("carSpecValueForSave", () => {
  it("uses brand + number for product-type fluid keys", () => {
    expect(carSpecValueForSave("brake_fluid", "Toyota", "2500H-A", "DOT 3")).toBe("Toyota 2500H-A");
  });

  it("keeps spec value for size-type keys", () => {
    expect(carSpecValueForSave("engine_oil_grade", "Mobil", "ignored", "0W-20")).toBe("0W-20");
  });
});
