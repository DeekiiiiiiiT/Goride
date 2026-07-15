import { describe, expect, it } from "vitest";
import type { DriverMetrics } from "../types/data";
import {
  filterUberCashEligibleMetrics,
  resolveUberPeriodCashCollected,
} from "./resolveUberPeriodCash";

const weekStart = new Date("2026-06-29T00:00:00");
const weekEnd = new Date("2026-07-05T23:59:59");

function paymentOnlyMetric(overrides: Partial<DriverMetrics> = {}): DriverMetrics {
  return {
    id: "dm-pay-ghost",
    driverId: "driver-1",
    periodStart: "2026-06-29T00:00:00.000Z",
    periodEnd: "2026-07-05T00:00:00.000Z",
    cashCollected: 4863.83,
    uberPaymentsTransactionCashColumnSum: 4863.83,
    dataSources: ["payment", "payment_transaction_cash_sum"],
    onlineHours: 0,
    onTripHours: 0,
    tripsCompleted: 0,
    ...overrides,
  };
}

describe("resolveUberPeriodCashCollected", () => {
  it("blocks payment-only metric when no Uber trips in period", () => {
    const result = resolveUberPeriodCashCollected({
      csvMetrics: [paymentOnlyMetric()],
      rangeFrom: weekStart,
      rangeTo: weekEnd,
      trips: [],
      isAllPlatforms: true,
    });
    expect(result.magnitude).toBeNull();
    expect(result.branch).toBe("blocked_no_operational_signal");
    expect(result.eligibleMetricIds).toEqual(["dm-pay-ghost"]);
  });

  it("allows cash when Uber completed trips exist in period", () => {
    const result = resolveUberPeriodCashCollected({
      csvMetrics: [paymentOnlyMetric()],
      rangeFrom: weekStart,
      rangeTo: weekEnd,
      trips: [
        {
          id: "t1",
          driverId: "driver-1",
          date: "2026-06-30T12:00:00.000Z",
          platform: "Uber",
          status: "Completed",
          amount: 25,
        },
      ],
      isAllPlatforms: true,
    });
    expect(result.magnitude).toBe(4863.83);
    expect(result.branch).toBe("payment_driver_cash");
  });

  it("prefers payments_driver cash over inflated transaction column sum", () => {
    const result = resolveUberPeriodCashCollected({
      csvMetrics: [
        paymentOnlyMetric({
          cashCollected: 34051.85,
          uberPaymentsTransactionCashColumnSum: 49246.85,
        }),
      ],
      rangeFrom: weekStart,
      rangeTo: weekEnd,
      trips: [
        {
          id: "t1",
          driverId: "driver-1",
          date: "2026-06-30T12:00:00.000Z",
          platform: "Uber",
          status: "Completed",
          amount: 25,
        },
      ],
      isAllPlatforms: true,
    });
    expect(result.magnitude).toBeCloseTo(34051.85, 2);
    expect(result.branch).toBe("payment_driver_cash");
  });

  it("does not match prior-week statement that only overlaps the range end", () => {
    const priorWeek = paymentOnlyMetric({
      id: "dm-pay-prior",
      periodStart: "2026-06-22T00:00:00.000Z",
      periodEnd: "2026-06-28T00:00:00.000Z",
      onTripDistance: 120,
      tripsCompleted: 40,
      dataSources: ["payment", "activity"],
    });
    const eligible = filterUberCashEligibleMetrics([priorWeek], weekStart, weekEnd);
    expect(eligible).toHaveLength(0);
  });

  it("blocks metric with embedded activity rollups when no Uber trips in period", () => {
    const result = resolveUberPeriodCashCollected({
      csvMetrics: [
        paymentOnlyMetric({
          dataSources: ["payment", "activity"],
          onTripDistance: 246.58,
          tripsCompleted: 38,
        }),
      ],
      rangeFrom: weekStart,
      rangeTo: weekEnd,
      trips: [],
      isAllPlatforms: true,
    });
    expect(result.magnitude).toBeNull();
    expect(result.branch).toBe("blocked_no_operational_signal");
  });
});
