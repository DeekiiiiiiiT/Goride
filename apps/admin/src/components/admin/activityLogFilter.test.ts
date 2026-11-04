import { describe, expect, it } from "vitest";
import { filterAuditLogEntries } from "./activityLogFilter";

describe("filterAuditLogEntries conflict param", () => {
  const entries = [
    {
      actorName: "Deeki T",
      action: "part_match_conflict_keep",
      targetId: "e5555555-5555-4555-8555-555555555555",
      details: "Kept conflict e5555555-5555-4555-8555-555555555555",
      timestamp: "2026-11-01T12:00:00.000Z",
    },
    {
      actorName: "Deeki T",
      action: "suspend_user",
      targetId: "user-2",
      details: "Suspended account",
      timestamp: "2026-11-01T13:00:00.000Z",
    },
  ];

  it("returns only rows matching conflict query param", () => {
    const filtered = filterAuditLogEntries(entries, {
      conflictId: "e5555555-5555-4555-8555-555555555555",
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.action).toBe("part_match_conflict_keep");
  });

  it("applies conflict filter before topic filter", () => {
    const filtered = filterAuditLogEntries(entries, {
      conflictId: "e5555555-5555-4555-8555-555555555555",
      topicFilter: "conflict",
    });
    expect(filtered).toHaveLength(1);
  });
});
