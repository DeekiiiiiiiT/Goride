import { describe, expect, it } from "vitest";
import { odometerProblem, parseOdometerKm } from "./OdometerUseStep";

describe("Add a car — odometer (maintenance step 8, MER-26)", () => {
  const today = "2026-11-27";
  it("a car can't be saved without a reading", () => {
    expect(odometerProblem({ km: "", date: today }, today)).toBe("Type the odometer reading.");
    expect(odometerProblem({ km: "0", date: today }, today)).toBe("The reading must be more than 0 km.");
    expect(odometerProblem({ km: "12.5", date: today }, today)).toBe("Type the reading as a whole number of km.");
  });
  it("a future date or an impossible reading is refused", () => {
    expect(odometerProblem({ km: "143220", date: "2026-12-01" }, today)).toBe("The date can't be in the future.");
    expect(odometerProblem({ km: "3,000,000", date: today }, today)).toBe("That reading is too high. Check the number.");
  });
  it("a normal reading passes, with or without commas", () => {
    expect(odometerProblem({ km: "143,220", date: today }, today)).toBeNull();
    expect(parseOdometerKm("143 220")).toBe(143220);
  });
});
