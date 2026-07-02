import { describe, it, expect } from "vitest";
import {
  isOffTagToll,
  isTagLedgerTx,
  isTagUsage,
  isTagCredit,
  type TagTxLike,
} from "./tollTagLedger";

// Rows as they arrive from GET /toll-logs (tollLedgerToTxShape / legacy passthrough).
const ledgerTagUsage: TagTxLike = { category: "Toll Usage", paymentMethod: "Tag Balance", amount: -380, type: "Usage" };
const ledgerTopUp: TagTxLike = { category: "Toll Usage", paymentMethod: "Tag Balance", amount: 5000, type: "Top-up" };
const ledgerRefund: TagTxLike = { category: "Toll Usage", paymentMethod: "Tag Balance", amount: 200, type: "Refund" };
const ledgerCashToll: TagTxLike = { category: "Toll Usage", paymentMethod: "Cash", amount: -250, type: "Usage" };
const geofenceFleetToll: TagTxLike = { category: "Toll Usage", paymentMethod: "Fleet Account", amount: -100, type: "Usage" };
const cardToll: TagTxLike = { category: "Toll Usage", paymentMethod: "Card", amount: -120, type: "Usage" };
const receiptToll: TagTxLike = { category: "Toll Usage", paymentMethod: "Tag Balance", amount: -300, receiptUrl: "https://x/y.jpg" };
const legacyCashToll: TagTxLike = { category: "Tolls", amount: -380 };
const legacyCashTollSingular: TagTxLike = { category: "Toll", amount: -380 };
const legacyTopUp: TagTxLike = { category: "Toll Top-up", amount: 3000 };

describe("isOffTagToll", () => {
  it("keeps genuine tag-ledger rows on-tag", () => {
    for (const tx of [ledgerTagUsage, ledgerTopUp, ledgerRefund, legacyTopUp]) {
      expect(isOffTagToll(tx)).toBe(false);
    }
  });

  it("flags ledger cash tolls as off-tag (latent balance bug fix)", () => {
    expect(isOffTagToll(ledgerCashToll)).toBe(true);
  });

  it("flags card and fleet-account/geofence tolls as off-tag", () => {
    expect(isOffTagToll(cardToll)).toBe(true);
    expect(isOffTagToll(geofenceFleetToll)).toBe(true);
  });

  it("flags legacy cash-category tolls as off-tag", () => {
    expect(isOffTagToll(legacyCashToll)).toBe(true);
    expect(isOffTagToll(legacyCashTollSingular)).toBe(true);
  });

  it("flags receipt-backed rows as off-tag", () => {
    expect(isOffTagToll(receiptToll)).toBe(true);
  });

  it("treats missing payment method as on-tag (ledger default is tag_balance)", () => {
    expect(isOffTagToll({ category: "Toll Usage", amount: -100 })).toBe(false);
  });
});

describe("isTagLedgerTx", () => {
  it("is the inverse of isOffTagToll", () => {
    for (const tx of [ledgerTagUsage, ledgerCashToll, legacyTopUp, geofenceFleetToll]) {
      expect(isTagLedgerTx(tx)).toBe(!isOffTagToll(tx));
    }
  });
});

describe("isTagUsage / isTagCredit", () => {
  it("classifies tag debits as usage", () => {
    expect(isTagUsage(ledgerTagUsage)).toBe(true);
    expect(isTagCredit(ledgerTagUsage)).toBe(false);
  });

  it("classifies top-ups and refunds as credits", () => {
    expect(isTagCredit(ledgerTopUp)).toBe(true);
    expect(isTagCredit(ledgerRefund)).toBe(true);
    expect(isTagCredit(legacyTopUp)).toBe(true);
    expect(isTagUsage(ledgerTopUp)).toBe(false);
  });

  it("never classifies off-tag rows as usage or credit", () => {
    for (const tx of [ledgerCashToll, cardToll, geofenceFleetToll, legacyCashToll, receiptToll]) {
      expect(isTagUsage(tx)).toBe(false);
      expect(isTagCredit(tx)).toBe(false);
    }
  });
});

describe("tag balance derivation (signed sum of tag-ledger rows)", () => {
  it("excludes cash so the balance is not wrongly reduced", () => {
    const rows = [ledgerTopUp, ledgerTagUsage, ledgerCashToll, legacyCashToll];
    const balance = rows.filter(isTagLedgerTx).reduce((s, r) => s + (r.amount ?? 0), 0);
    // 5000 top-up − 380 tag usage; the two cash tolls are excluded.
    expect(balance).toBe(4620);
  });
});
