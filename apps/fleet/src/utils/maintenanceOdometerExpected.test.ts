import { describe, expect, it } from "vitest";
import {
  interpolateExpectedOdometer,
  maintenanceServiceRecordedAt,
} from "../../../../packages/finance-core/src/maintenanceOdometerExpected.ts";

describe("maintenanceServiceRecordedAt", () => {
  it("uses noon UTC on service date", () => {
    expect(maintenanceServiceRecordedAt("2026-01-06")).toBe("2026-01-06T12:00:00.000Z");
  });
});

describe("interpolateExpectedOdometer", () => {
  it("interpolates between neighbors", () => {
    const expected = interpolateExpectedOdometer({
      serviceDateYmd: "2026-01-06",
      priorReading: 122_940,
      priorRecordedAt: "2026-01-05T12:00:00.000Z",
      nextReading: 123_310,
      nextRecordedAt: "2026-01-08T12:00:00.000Z",
    });
    expect(expected).toBeGreaterThan(122_940);
    expect(expected).toBeLessThan(123_310);
  });

  it("falls back to prior reading", () => {
    expect(
      interpolateExpectedOdometer({
        serviceDateYmd: "2026-01-06",
        priorReading: 100_000,
        priorRecordedAt: "2026-01-01T12:00:00.000Z",
        nextReading: null,
        nextRecordedAt: null,
      }),
    ).toBe(100_000);
  });
});
