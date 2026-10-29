import { describe, expect, it } from "vitest";
import {
  fewReports,
  formatDelta,
  formatJmdPerLitre,
  narrativeSentence,
  sampleLabel,
} from "./stationAnalyticsFormat";

describe("station analytics format", () => {
  it("formats currency per litre", () => {
    expect(formatJmdPerLitre(225.4)).toBe("J$225.40/L");
    expect(formatJmdPerLitre(1200)).toBe("J$1,200.00/L");
    expect(formatJmdPerLitre(null)).toBe("—");
  });

  it("formats signed deltas", () => {
    expect(formatDelta(4.5, 225)).toBe("+J$4.50 (+2.0%)");
    expect(formatDelta(-1.1, 220)).toBe("−J$1.10 (−0.5%)");
  });

  it("marks few reports at 1 and 2 stations, not at 3", () => {
    expect(fewReports(1)).toBe(true);
    expect(fewReports(2)).toBe(true);
    expect(fewReports(3)).toBe(false);
    expect(sampleLabel(1, 1)).toBe("n = 1 stations · 1 reports");
  });

  it("hides the narrative when the pump median is empty", () => {
    expect(narrativeSentence({
      gradeLabel: "E10-87",
      pumpMedian: null,
      stations: 0,
      reporters: 0,
      gap: null,
      petrojam: 201.81,
      lowName: null,
      lowPrice: null,
      benchmarkName: "Petrojam",
    })).toBeNull();
  });

  it("adds the caution when only one station is priced", () => {
    const line = narrativeSentence({
      gradeLabel: "E10-87",
      pumpMedian: 225.4,
      stations: 1,
      reporters: 1,
      gap: 23.59,
      petrojam: 201.81,
      lowName: "FESCO Beechwood",
      lowPrice: 221.66,
      benchmarkName: "Petrojam",
    });
    expect(line).toContain("Few reports — treat as indicative.");
    expect(line).toContain("J$225.40/L");
  });
});
