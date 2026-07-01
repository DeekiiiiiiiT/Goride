import { describe, it, expect } from "vitest";
import {
  classifyRefund,
  isCashSettled,
  isSafeAutoApply,
  isRefundResolved,
  REFUND_AUTO_APPLY_MIN_CONFIDENCE,
} from "./refundClassifier";

describe("isRefundResolved (no-breakage regression)", () => {
  it("treats legacy trips (no resolution field) as NOT resolved", () => {
    expect(isRefundResolved(undefined)).toBe(false);
    expect(isRefundResolved(null)).toBe(false);
  });
  it("treats pending as NOT resolved (still shown in unlinked list)", () => {
    expect(isRefundResolved({ status: "pending" })).toBe(false);
  });
  it("treats non-pending resolutions as resolved (drop off the list)", () => {
    expect(isRefundResolved({ status: "cash_wash" })).toBe(true);
    expect(isRefundResolved({ status: "phantom" })).toBe(true);
    expect(isRefundResolved({ status: "expense_logged" })).toBe(true);
  });
});

describe("isCashSettled", () => {
  it("detects cash payment method", () => {
    expect(isCashSettled("Uber", "Cash")).toBe(true);
  });
  it("detects cash platform", () => {
    expect(isCashSettled("Cash", "Card")).toBe(true);
  });
  it("treats card/digital as not cash-settled", () => {
    expect(isCashSettled("Uber", "Digital (card/Bank)")).toBe(false);
    expect(isCashSettled("Uber", undefined)).toBe(false);
  });
});

describe("classifyRefund", () => {
  it("returns pending with 0 confidence for a non-positive refund", () => {
    const r = classifyRefund({ tollCharges: 0 });
    expect(r.status).toBe("pending");
    expect(r.confidence).toBe(0);
  });

  it("prefers pending when a tag import is still expected", () => {
    const r = classifyRefund({
      tollCharges: 5,
      paymentMethod: "Cash",
      nearestPlazaMeters: 10,
      pendingTagImport: true,
    });
    expect(r.status).toBe("pending");
  });

  it("classifies cash-settled + on-route plaza as high-confidence cash_wash", () => {
    const r = classifyRefund({
      tollCharges: 5,
      platform: "Roam",
      paymentMethod: "Cash",
      nearestPlazaMeters: 120,
      plazaRadiusMeters: 500,
    });
    expect(r.status).toBe("cash_wash");
    expect(r.confidence).toBeGreaterThanOrEqual(REFUND_AUTO_APPLY_MIN_CONFIDENCE);
    expect(isSafeAutoApply(r)).toBe(true);
  });

  it("classifies cash-settled without geo as cash_wash but below no-geo boost", () => {
    const r = classifyRefund({ tollCharges: 5, paymentMethod: "Cash", nearestPlazaMeters: null });
    expect(r.status).toBe("cash_wash");
    expect(r.confidence).toBe(80);
  });

  it("classifies platform-settled + plaza near as medium cash_wash (not auto-apply)", () => {
    const r = classifyRefund({
      tollCharges: 5,
      platform: "Uber",
      paymentMethod: "Digital (card/Bank)",
      nearestPlazaMeters: 100,
    });
    expect(r.status).toBe("cash_wash");
    expect(isSafeAutoApply(r)).toBe(false);
  });

  it("classifies geo-known + no plaza near as phantom", () => {
    const r = classifyRefund({
      tollCharges: 5,
      platform: "Uber",
      paymentMethod: "Digital (card/Bank)",
      nearestPlazaMeters: 9000,
      plazaRadiusMeters: 500,
    });
    expect(r.status).toBe("phantom");
  });

  it("falls back to pending when there is no usable signal", () => {
    const r = classifyRefund({
      tollCharges: 5,
      platform: "Uber",
      paymentMethod: "Digital (card/Bank)",
      nearestPlazaMeters: null,
    });
    expect(r.status).toBe("pending");
    expect(isSafeAutoApply(r)).toBe(false);
  });
});
