import { describe, expect, it } from "vitest";
import {
  buildS10eStripViewModel,
  formatResearchStateLabel,
  researchFilterForJobState,
  scanPayloadForPii,
} from "./pendingCatalogViewModels";

describe("pendingCatalogViewModels", () => {
  it("formats today jobs line", () => {
    const vm = buildS10eStripViewModel({
      queued: 3,
      workingOn: 1,
      needsReview: 2,
      failed: 0,
      todayResearchCount: 14,
      dailyJobLimit: 40,
      enabled: true,
      paused: false,
      shadowStreak: 12,
      shadowMode: true,
    });
    expect(vm.todayJobsLabel).toBe("Today 14 / 40 jobs");
    expect(vm.dispatcherLabel).toBe("Pause Dispatcher");
  });

  it("shows resume when paused", () => {
    const vm = buildS10eStripViewModel({
      queued: 0,
      needsReview: 0,
      failed: 0,
      enabled: true,
      paused: true,
      dailyJobLimit: 40,
    });
    expect(vm.dispatcherLabel).toBe("Resume Dispatcher");
  });

  it("maps research job states to filters", () => {
    expect(researchFilterForJobState("checking")).toBe("researching");
    expect(formatResearchStateLabel("auto_added")).toBe("Added automatically");
  });

  it("flags obvious PII patterns", () => {
    expect(scanPayloadForPii("fleet@example.com").clean).toBe(false);
    expect(scanPayloadForPii("drive belt only").clean).toBe(true);
  });
});
