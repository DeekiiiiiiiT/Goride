import { describe, expect, it } from "vitest";
import type { VehicleCatalogRecord } from "../../../types/vehicleCatalog";
import { makesOf, modelsOf, partNumberOptions, UNKNOWN_YEAR, versionLabels, versionsFor, yearOptions } from "./carPick";

// Made-up catalogue rows shaped like the Roomy versions (codes are never shown to the person).
const car = (id: string, o: Partial<VehicleCatalogRecord>): VehicleCatalogRecord =>
  ({ id, make: "Toyota", model: "Roomy", production_start_year: 2016, production_end_year: 2020, trim_series: null, generation: null, body_type: "Hatchback", ...o }) as VehicleCatalogRecord;

const CARS = [
  car("a", { catalog_trim: "Custom G", drivetrain: "2WD", engine_displacement_l: 1 as never, transmission: "CVT", chassis_code: "M900A" }),
  car("b", { catalog_trim: "Custom G", drivetrain: "4WD", engine_displacement_l: 1 as never, transmission: "CVT", chassis_code: "M910A" }),
  car("c", { production_start_year: 2020, production_end_year: null, catalog_trim: "Custom G-T", drivetrain: "2WD", engine_displacement_l: 1 as never, engine_type: "Turbo", transmission: "CVT" }),
  car("d", { make: "Honda", model: "Fit", production_start_year: 2014, production_end_year: 2015 }),
];

describe("carPick", () => {
  it("lists makes and models in plain words, one entry whatever the capitals", () => {
    expect(makesOf([...CARS, car("e", { make: "TOYOTA" })])).toEqual(["Honda", "Toyota"]);
    expect(modelsOf(CARS, "toyota")).toEqual(["Roomy"]);
  });

  it("years run newest first and ongoing models reach this year", () => {
    expect(yearOptions(CARS, "Toyota", "Roomy", 2026).map((o) => o.value)).toEqual(
      ["2026", "2025", "2024", "2023", "2022", "2021", "2020", "2019", "2018", "2017", "2016"],
    );
  });

  it("a year with one version picks it; a year with several asks", () => {
    expect(versionsFor(CARS, "Toyota", "Roomy", "2023", 2026).map((c) => c.id)).toEqual(["c"]);
    expect(versionsFor(CARS, "Toyota", "Roomy", "2018", 2026).map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("rows with no build years are reachable through 'Year not known' and never join a real year", () => {
    const withUnknown = [...CARS, car("x", { production_start_year: null as never, production_end_year: null })];
    const years = yearOptions(withUnknown, "Toyota", "Roomy", 2026);
    expect(years.at(-1)).toEqual({ value: UNKNOWN_YEAR, label: "Year not known" });
    expect(versionsFor(withUnknown, "Toyota", "Roomy", "2018", 2026).map((c) => c.id)).toEqual(["a", "b"]);
    expect(versionsFor(withUnknown, "Toyota", "Roomy", UNKNOWN_YEAR, 2026).map((c) => c.id)).toEqual(["x"]);
  });

  it("version labels never show frame or engine codes", () => {
    const labels = versionLabels(CARS.slice(0, 3));
    expect(labels.get("a")).toBe("Custom G · 2WD · 1.0 L · CVT · 2016–2020");
    expect(labels.get("b")).toBe("Custom G · 4WD · 1.0 L · CVT · 2016–2020");
    expect(labels.get("c")).toBe("Custom G-T · 2WD · 1.0 L turbo · CVT · 2020–now");
    for (const l of labels.values()) expect(l).not.toMatch(/M9[01]0A|1KR/);
  });

  it("versions that still read the same get the model update, then a number", () => {
    const twins = [
      car("p", { drivetrain: "4WD", trim_series: "Pre-Facelift" }),
      car("q", { drivetrain: "4WD", trim_series: "Facelift" }),
      car("r", { drivetrain: "4WD", trim_series: "Facelift" }),
    ];
    const labels = versionLabels(twins);
    expect(labels.get("p")).toContain("Pre-Facelift");
    expect(new Set(labels.values()).size).toBe(3);
  });

  it("numbers on file become options; unchecked ones say so; no part without a number; no repeats", () => {
    expect(
      partNumberOptions([
        { name: "Brake pads", partNumber: "00000-T0001", maker: "SB", cell: "verified" },
        { name: "Wipers", partNumber: null },
        { name: "Brake pads (rear)", partNumber: "00000-t0001" },
        { name: "Cabin filter", partNumber: "00000-T0005", cell: "unverified" },
      ]),
    ).toEqual([
      { value: "00000-T0001", label: "Brake pads", hint: "SB · 00000-T0001" },
      { value: "00000-T0005", label: "Cabin filter", hint: "00000-T0005 · not checked yet" },
    ]);
  });
});
