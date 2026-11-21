import { describe, expect, it } from "vitest";
import { formatPartRequestExtras, sourceLabels } from "../../../../services/pendingPartsCatalogService";

describe("Pending parts — name, number, position, source (LS-17, LS-21, LS-23)", () => {
  it("second line: number · where on the car (Stitch D1)", () => {
    const x = formatPartRequestExtras({
      requestedName: "Front oxygen sensor",
      requestedPartNumber: "89467-B1040",
      positionScheme: "before_after_catalyst",
      positionCodes: ["before_cat"],
      origins: ["service_log"],
    });
    expect(x.requestedName).toBe("Front oxygen sensor");
    expect(x.detailLine).toBe("89467-B1040 · Front");
    expect(x.whereOnCar).toBe("Front");
  });

  it("leaves out whichever is unknown, and shows — when both are", () => {
    expect(formatPartRequestExtras({ requestedPartNumber: "11111-TEST1" }).detailLine).toBe("11111-TEST1");
    expect(
      formatPartRequestExtras({ positionScheme: "driver_passenger_rear", positionCodes: ["driver", "passenger"] }).detailLine,
    ).toBe("Driver, Passenger");
    expect(formatPartRequestExtras({}).detailLine).toBe("—");
  });

  it("Source chips: Service log first, never a count", () => {
    expect(sourceLabels(["find_parts", "service_log"])).toEqual(["Service log", "Find parts"]);
    expect(sourceLabels(["find_parts"])).toEqual(["Find parts"]);
    expect(sourceLabels(undefined)).toEqual([]);
  });
});
