import { describe, it, expect } from "vitest";
import {
  mapMergedTollTxToEvent,
  mapTripUnclaimedToEvent,
  mapDisputeRefundToEvent,
  dedupeTollFinancialEvents,
  sortTollFinancialEventsDesc,
  filterTollFinancialEvents,
  eventInDateRange,
} from "./tollFinancialEvent";

describe("mapMergedTollTxToEvent", () => {
  it("tags ledger vs legacy by id set", () => {
    const ledgerIds = new Set(["a1"]);
    const fromLedger = mapMergedTollTxToEvent(
      {
        id: "a1",
        date: "2024-06-01T14:00:00.000Z",
        amount: -5.5,
        driverId: "d1",
        driverName: "Ada",
        isReconciled: true,
        tripId: "t1",
        status: "Approved",
        metadata: { batchId: "b1" },
      },
      ledgerIds,
    );
    expect(fromLedger?.kind).toBe("plaza_toll");
    expect(fromLedger?.sourceSystem).toBe("toll_ledger");
    expect(fromLedger?.eventId).toBe("toll:a1");

    const legacy = mapMergedTollTxToEvent(
      {
        id: "legacy-1",
        date: "2024-06-02",
        time: "10:00:00",
        amount: -2,
        driverId: "d1",
        category: "Toll Usage",
        isReconciled: false,
        metadata: {},
      },
      ledgerIds,
    );
    expect(legacy?.kind).toBe("legacy_transaction_toll");
    expect(legacy?.sourceSystem).toBe("legacy_transaction");
  });
});

describe("mapTripUnclaimedToEvent", () => {
  it("requires positive tollCharges", () => {
    expect(mapTripUnclaimedToEvent({ id: "x", tollCharges: 0, driverId: "d" })).toBeNull();
    const ev = mapTripUnclaimedToEvent({
      id: "trip-9",
      date: "2024-05-10",
      tollCharges: 12.5,
      driverId: "d2",
      pickupLocation: "A",
      dropoffLocation: "B",
    });
    expect(ev?.eventId).toBe("trip_refund:trip-9");
    expect(ev?.kind).toBe("unlinked_refund_signal");
    expect(ev?.amount).toBe(12.5);
  });
});

describe("mapDisputeRefundToEvent", () => {
  it("maps matched status", () => {
    const ev = mapDisputeRefundToEvent({
      id: "dr1",
      supportCaseId: "sc",
      amount: 8,
      date: "2024-04-01T12:00:00.000Z",
      driverId: "d",
      driverName: "Bob",
      status: "matched",
      matchedTollId: "tollid",
      importedAt: "2024-04-02T00:00:00.000Z",
    });
    expect(ev?.workflowState).toBe("dispute_matched");
    expect(ev?.matchedTollId).toBe("tollid");
  });
});

describe("dedupeTollFinancialEvents", () => {
  it("drops duplicate eventIds", () => {
    const a = mapMergedTollTxToEvent(
      { id: "dup", date: "2024-01-01", amount: -1, driverId: "d", isReconciled: false },
      new Set(["dup"]),
    )!;
    const { events, droppedDuplicatesCount } = dedupeTollFinancialEvents([a, { ...a }]);
    expect(events.length).toBe(1);
    expect(droppedDuplicatesCount).toBe(1);
  });
});

describe("sort + filter", () => {
  it("sorts by occurredAt desc", () => {
    const a = mapMergedTollTxToEvent(
      { id: "a", date: "2024-01-01", amount: -1, driverId: "d", isReconciled: false },
      new Set(["a"]),
    )!;
    const b = mapMergedTollTxToEvent(
      { id: "b", date: "2024-02-01", amount: -1, driverId: "d", isReconciled: false },
      new Set(["b"]),
    )!;
    const s = sortTollFinancialEventsDesc([a, b]);
    expect(s[0].eventId).toBe("toll:b");
  });

  it("filters by date range on occurredAt", () => {
    expect(eventInDateRange("2024-06-15T10:00:00.000Z", "2024-06-01", "2024-06-30")).toBe(true);
    expect(eventInDateRange("2024-06-15T10:00:00.000Z", "2024-07-01", undefined)).toBe(false);
  });

  it("filterTollFinancialEvents by driverId", () => {
    const a = mapMergedTollTxToEvent(
      { id: "a", date: "2024-01-01", amount: -1, driverId: "d1", isReconciled: false },
      new Set(["a"]),
    )!;
    const b = mapMergedTollTxToEvent(
      { id: "b", date: "2024-01-02", amount: -1, driverId: "d2", isReconciled: false },
      new Set(["b"]),
    )!;
    const f = filterTollFinancialEvents([a, b], { driverId: "d1" });
    expect(f.length).toBe(1);
    expect(f[0].driverId).toBe("d1");
  });
});
