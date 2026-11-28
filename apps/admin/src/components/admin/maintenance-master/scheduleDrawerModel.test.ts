import { describe, expect, it } from "vitest";
import { SEVERE_MISSING, scheduleBlocker, type BlockerInput } from "./scheduleDrawerModel";
import { versionLabel } from "./MmCarPicker";
import type { VehicleCatalogRecord } from "../../../types/vehicleCatalog";

const base: BlockerInput = {
  componentId: "part-1",
  scope: "global",
  carVersionId: "",
  platformId: "",
  engineFamilyId: "",
  carHasNoModel: false,
  carHasNoEngine: false,
  intervalKm: "5000",
  intervalMonths: "",
  sourceType: "roam_policy",
  familyForManual: "",
  manualCount: 0,
  manualId: "",
  evidencePage: "",
  oneFigure: false,
  severeKm: "",
  severeMonths: "",
  evidenceUrl: "",
};

describe("schedule drawer: what still stops Make active (rebuild step 4)", () => {
  it("an everyone Roam policy schedule with a number is ready", () => {
    expect(scheduleBlocker(base)).toBe("");
  });

  it("One model needs the model's id, not just the word (MER-01)", () => {
    expect(scheduleBlocker({ ...base, scope: "platform" })).toBe("Pick the model.");
    expect(scheduleBlocker({ ...base, scope: "platform", platformId: "fam-1" })).toBe("");
  });

  it("a car with no model family says to pick One car version", () => {
    expect(scheduleBlocker({ ...base, scope: "platform", carVersionId: "car-1", carHasNoModel: true })).toBe(
      "This car has no model family yet, so pick One car version instead.",
    );
  });

  it("One engine needs an engine id", () => {
    expect(scheduleBlocker({ ...base, scope: "engine_family" })).toBe("Pick a car with this engine.");
    expect(scheduleBlocker({ ...base, scope: "engine_family", engineFamilyId: "eng-1" })).toBe("");
  });

  it("a car maker number needs a manual and a page (MER-07)", () => {
    const cm: BlockerInput = { ...base, scope: "platform", platformId: "fam-1", familyForManual: "fam-1", sourceType: "maker_manual" };
    expect(scheduleBlocker(cm)).toBe("Needs a manual and a page.");
    expect(scheduleBlocker({ ...cm, manualCount: 1 })).toBe("Pick the manual this number is in.");
    expect(scheduleBlocker({ ...cm, manualCount: 1, manualId: "m-1" })).toBe("Needs a manual and a page.");
  });

  it("a car maker number needs harder-driving numbers or the one-figure tick (MER-05)", () => {
    const cm: BlockerInput = {
      ...base,
      scope: "platform",
      platformId: "fam-1",
      familyForManual: "fam-1",
      sourceType: "maker_manual",
      manualCount: 1,
      manualId: "m-1",
      evidencePage: "414",
    };
    expect(scheduleBlocker(cm)).toBe(SEVERE_MISSING);
    expect(scheduleBlocker({ ...cm, oneFigure: true })).toBe("");
    expect(scheduleBlocker({ ...cm, severeKm: "2500" })).toBe("");
  });

  it("a car maker number is never for everyone", () => {
    expect(scheduleBlocker({ ...base, sourceType: "maker_manual" })).toBe(
      "A car maker number is for one model. Pick One model.",
    );
  });

  it("a part maker number needs its link", () => {
    expect(scheduleBlocker({ ...base, sourceType: "part_maker" })).toBe("Add the link to the page you used.");
  });

  it("no km and no months is not a schedule", () => {
    expect(scheduleBlocker({ ...base, intervalKm: "" })).toBe("Fill in the km or the months.");
  });
});

describe("car version in plain words", () => {
  it("says trim, drive, engine size, fuel and gearbox, never a code", () => {
    const row = {
      id: "c1",
      make: "Toyota",
      model: "Roomy",
      production_start_year: 2016,
      production_end_year: 2020,
      chassis_code: "M900A",
      drivetrain: "2WD",
      engine_displacement_l: 1,
      engine_type: "Gasoline",
      transmission: "CVT",
    } as unknown as VehicleCatalogRecord;
    const label = versionLabel(row as never);
    expect(label).toBe("2WD · 1.0 petrol · CVT");
    expect(label).not.toContain("M900A");
  });

  it("a version with nothing known reads Standard", () => {
    expect(versionLabel({ id: "x", make: "A", model: "B" } as never)).toBe("Standard");
  });
});
