/**
 * T1. deno test supabase/functions/_fleet-server/vehicleVariantLabel.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { variantCodeLine, variantPlainLabel, type VariantLabelRow } from "../../../packages/types/src/vehicleVariantLabel.ts";

const fit: VariantLabelRow[] = [
  { id: "gk5", chassis_code: "GK5", engine_code: "L15B", engine_displacement_l: 1.5, fuel_type: "Petrol", transmission: "CVT", drivetrain: "FWD" },
  { id: "gk3", chassis_code: "GK3", engine_code: "L13B", engine_displacement_l: 1.3, fuel_type: "Petrol", transmission: "CVT", drivetrain: "FWD" },
  { id: "gp5", chassis_code: "GP5", engine_code: "LEB", engine_displacement_l: 1.5, fuel_category: "Hybrid", transmission: "7-speed DCT", drivetrain: "FWD" },
];

const roomy: VariantLabelRow[] = [
  { id: "m900", chassis_code: "M900A", engine_code: "1KR-FE", engine_displacement_l: 1.0, fuel_type: "Petrol", drivetrain: "2WD", transmission: "CVT" },
  { id: "m910", chassis_code: "M910A", engine_code: "1KR-FE", engine_displacement_l: 1.0, fuel_type: "Petrol", drivetrain: "4WD", transmission: "CVT" },
];

Deno.test("Fit 2018 versions read as petrol and hybrid", () => {
  assertEquals(fit.map((row) => variantPlainLabel(row, fit)), ["1.5 petrol", "1.3 petrol", "1.5 hybrid"]);
  assertEquals(variantCodeLine(fit[2]), "GP5 · LEB · 7-speed DCT");
});

Deno.test("Roomy 2019 versions read as 2WD and 4WD", () => {
  assertEquals(roomy.map((row) => variantPlainLabel(row, roomy)), ["2WD", "4WD"]);
});

Deno.test("a single version asks no question", () => {
  const only = fit[0];
  assertEquals(variantPlainLabel(only, [only]), "");
});

Deno.test("a missing engine size falls back to the chassis code", () => {
  const rows: VariantLabelRow[] = [
    { id: "a", chassis_code: "AAA", fuel_type: "Petrol" },
    { id: "b", chassis_code: "BBB", engine_displacement_l: 1.5, fuel_type: "Petrol" },
  ];
  assertEquals(variantPlainLabel(rows[0], rows), "AAA");
  assertEquals(variantPlainLabel(rows[1], rows), "1.5 petrol");
});

Deno.test("1.0 stays one decimal, and matching cards keep the next difference", () => {
  const belta: VariantLabelRow[] = [
    { id: "a", chassis_code: "NCP96", engine_displacement_l: 1.3, fuel_type: "Petrol", transmission: "CVT" },
    { id: "b", chassis_code: "KSP92", engine_displacement_l: 1, fuel_type: "Petrol", transmission: "CVT" },
    { id: "c", chassis_code: "SCP92", engine_displacement_l: 1.3, fuel_type: "Petrol", transmission: "4-speed" },
  ];
  assertEquals(belta.map((row) => variantPlainLabel(row, belta)), [
    "1.3 petrol · CVT",
    "1.0 petrol · CVT",
    "1.3 petrol · 4-speed",
  ]);

  const roomy: VariantLabelRow[] = [
    { id: "a", chassis_code: "M900A", engine_displacement_l: 1, fuel_type: "Petrol", drivetrain: "2WD" },
    { id: "b", chassis_code: "M900A", engine_displacement_l: 1, fuel_type: "Petrol", drivetrain: "2WD", engine_type: "turbo" },
    { id: "c", chassis_code: "M910A", engine_displacement_l: 1, fuel_type: "Petrol", drivetrain: "4WD" },
    { id: "d", chassis_code: "M910A", engine_displacement_l: 1, fuel_type: "Petrol", drivetrain: "4WD" },
  ];
  const labels = roomy.map((row) => variantPlainLabel(row, roomy));
  assertEquals(labels[0].includes("2WD"), true);
  assertEquals(labels[1].includes("turbo"), true);
  assertEquals(labels[2], labels[3]);
  assertEquals(labels[2].includes("M910A"), true);
});
