import { describe, expect, it } from "vitest";
import { requestStatusLabel, trustUiLabel } from "./everydayLabels";

describe("everydayLabels", () => {
  it("maps sourcing request statuses", () => {
    expect(requestStatusLabel("looking").pill).toBe("We're looking");
    expect(requestStatusLabel("added").pill).toBe("Added");
    expect(requestStatusLabel("cant_find").pill).toBe("We couldn't find it");
  });

  it("maps trust labels for fleet UI", () => {
    expect(trustUiLabel("Confirmed")).toBe("Verified");
    expect(trustUiLabel("pending")).toBe("Check before buying");
  });
});
