import { describe, expect, it, vi, afterEach } from "vitest";
import { formatMaintenanceScheduledDate } from "./maintenanceDisplayFormat";

describe("formatMaintenanceScheduledDate", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("labels today in Jamaica not UTC", () => {
    // 2026-11-01 02:00 UTC = 2026-10-31 21:00 Jamaica — Jamaica calendar still Oct 31
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T02:00:00.000Z"));
    expect(formatMaintenanceScheduledDate("2026-10-31")).toBe("Today");
    expect(formatMaintenanceScheduledDate("2026-11-01")).toBe("Tomorrow");
  });

  it("formats other dates normally", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00.000Z"));
    expect(formatMaintenanceScheduledDate("2026-08-01")).toMatch(/1 Aug 2026/);
  });
});

describe("formatMaintenanceServiceDateLabel (R-02)", () => {
  it("shows fitted date unknown when flagged", async () => {
    const { formatMaintenanceServiceDateLabel } = await import("./maintenanceDisplayFormat");
    expect(formatMaintenanceServiceDateLabel("2026-11-01", true)).toBe("Fitted — date unknown");
    expect(formatMaintenanceServiceDateLabel("2026-10-14", false)).toMatch(/14 Oct 2026/);
  });
});
