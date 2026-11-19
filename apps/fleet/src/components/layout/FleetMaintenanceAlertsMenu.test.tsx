/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { partsNoticeTitle } from "./FleetMaintenanceAlertsMenu";

describe("parts notice title (Slice C, Stitch screen 8)", () => {
  it("names the job and the car without the year", () => {
    expect(partsNoticeTitle({ title: "Part on file", jobName: "Oxygen sensor", carLabel: "Toyota Roomy 2019" })).toBe(
      "Roam added the oxygen sensor for your Toyota Roomy",
    );
  });
  it("falls back to the server title", () => {
    expect(partsNoticeTitle({ title: "Part on file", jobName: null, carLabel: null })).toBe("Part on file");
    expect(partsNoticeTitle({ title: "", jobName: null, carLabel: null })).toBe("Roam added a part");
  });
});
