/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { buildPartSearchText } from "./buildPartSearchText";

const roomy: import("../../../../services/pendingPartsCatalogService").VehicleCatalogBrief = {
  id: "vc-1",
  make: "Toyota",
  model: "Roomy",
  trim_series: "Pre-Facelift",
  catalog_trim: "Custom G",
  chassis_code: "M900A",
  engine_code: "1KR-FE",
  production_start_year: 2016,
  production_end_year: 2020,
  drivetrain: "2WD",
  transmission: "CVT",
};

describe("buildPartSearchText", () => {
  it("includes position for a brake request with side", () => {
    const text = buildPartSearchText(
      {
        groupId: "g1",
        platformId: "p1",
        componentId: "cmp-pads",
        side: "both",
        fitDescriptor: "front:both",
        fleetCount: 1,
        firstAsked: null,
        lastAsked: null,
        photoCount: 0,
        status: "open",
        requestIds: ["r1"],
      },
      roomy,
      "Brake pads",
      [{ id: "n1", logRef: "A", text: "04465-1190" }],
      true,
    );
    expect(text).toContain("Brake pads — Toyota Roomy 2016–2020");
    expect(text).toContain("Position:");
    expect(text).toContain("Search: Toyota Roomy M900A 1KR-FE brake pads part number");
    expect(text).toContain('Old part number / notes: "04465-1190"');
    expect(text).not.toMatch(/fleet|plate|5179/i);
  });

  it("omits position for drive belt", () => {
    const text = buildPartSearchText(
      {
        groupId: "g2",
        platformId: "p1",
        componentId: "cmp-belt",
        side: null,
        fitDescriptor: null,
        fleetCount: 1,
        firstAsked: null,
        lastAsked: null,
        photoCount: 0,
        status: "open",
        requestIds: ["r2"],
      },
      roomy,
      "Drive belt",
      [],
      false,
    );
    expect(text).toContain("Drive belt — Toyota Roomy 2016–2020");
    expect(text).not.toContain("Position:");
    expect(text).toContain("Search: Toyota Roomy M900A 1KR-FE drive belt part number");
  });
});
