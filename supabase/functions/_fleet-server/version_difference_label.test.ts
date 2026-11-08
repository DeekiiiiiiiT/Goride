/** Keep in sync with packages/vehicle-catalog-core/src/versionDifferenceLabel.test.ts */
import { assertEquals } from "jsr:@std/assert@1";
import { versionDifferenceLabel } from "./version_difference_label.ts";

Deno.test("versionDifferenceLabel Roomy 2WD", () => {
  assertEquals(
    versionDifferenceLabel({
      drivetrain: "2WD",
      engine_code: "1KR-FE",
      engine_displacement_l: 1.0,
      fuel_type: "Petrol",
    }),
    "2WD · 1.0 petrol",
  );
});
