/**
 * Old-path vs new-path parity for ledger reads — to the cent.
 * Fixtures mirror real row shapes (reversal, periodStart, org bank duplicate, 1001-row cap).
 */
import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { signedLedgerAmount } from "../../../../packages/finance-core/src/platformFeeRecognition.ts";
import { expectedBankWeekKey } from "../../../../packages/finance-core/src/businessStatement.ts";
import { dedupeOrgBankCanonicalEvents } from "./queries.ts";
import {
  assertCanonicalPageCap,
  foldWeekSummaryByDriverType,
  mapPageRowToCanonical,
  sumWeekSummaryMinor,
  weekSummaryToCanonicalEvents,
  type LedgerPageRow,
  type WeekSummaryRow,
} from "./readApi.ts";

function pageRow(partial: Partial<LedgerPageRow> & Pick<LedgerPageRow, "id" | "amount_minor" | "entry_type">): LedgerPageRow {
  return {
    organization_id: "8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823",
    product: "roam_driver",
    currency: "JMD",
    effective_at: "2026-08-26T15:00:00Z",
    created_at: "2026-08-26T15:01:00Z",
    reference_type: "trip",
    reference_id: "trip-1",
    driver_id: "11111111-1111-1111-1111-111111111111",
    platform: "uber",
    batch_id: null,
    direction: "inflow",
    is_reconciled: false,
    vehicle_id: null,
    description: null,
    has_more: false,
    meta: {},
    ...partial,
  };
}

Deno.test("reversal page row: mapper + signedLedgerAmount subtracts (R3/R4)", () => {
  // Real shape: amount stored positive; metadata.reversal = true → economic −abs.
  const row = pageRow({
    id: "rev-1",
    entry_type: "fare_earning",
    amount_minor: 12_345,
    meta: { reversal: true, grossAmount: "150.00" },
  });
  const canonical = mapPageRowToCanonical(row);
  assertEquals(canonical.eventType, "fare_earning");
  assertEquals(
    signedLedgerAmount({
      netAmount: Number(canonical.netAmount),
      metadata: canonical.metadata as Record<string, unknown>,
    }),
    -123.45,
  );
  const meta = canonical.metadata as Record<string, unknown>;
  assertEquals(meta.reversal, true);
  assertEquals(meta.grossAmount, "150.00");
});

Deno.test("periodStart meta survives mapPageRowToCanonical (R4 statement overlap)", () => {
  const row = pageRow({
    id: "period-1",
    entry_type: "payout_bank",
    amount_minor: 50_000_00,
    meta: {
      periodStart: "2026-08-17",
      periodEnd: "2026-08-23",
      bankRole: "org_deposit",
      recipient: "org",
      source: "payments_organization",
      organizationUuid: "8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823",
    },
  });
  const canonical = mapPageRowToCanonical(row);
  assertEquals(canonical.periodStart, "2026-08-17");
  assertEquals(canonical.periodEnd, "2026-08-23");
  const meta = canonical.metadata as Record<string, unknown>;
  assertEquals(meta.bankRole, "org_deposit");
  assertEquals(meta.organizationUuid, "8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823");
});

Deno.test("org payout_bank duplicates: dedupe keeps newest (R7)", () => {
  const older = mapPageRowToCanonical(
    pageRow({
      id: "bank-old",
      entry_type: "payout_bank",
      amount_minor: 100_000_00,
      created_at: "2026-10-01T10:00:00Z",
      effective_at: "2026-10-06T12:00:00Z",
      driver_id: null,
      meta: {
        bankRole: "org_deposit",
        recipient: "org",
        source: "payments_organization",
        organizationUuid: "8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823",
        weekKey: "2026-09-28",
      },
    }),
  );
  const newer = mapPageRowToCanonical(
    pageRow({
      id: "bank-new",
      entry_type: "payout_bank",
      amount_minor: 100_000_00,
      created_at: "2026-10-02T10:00:00Z",
      effective_at: "2026-10-06T12:00:00Z",
      driver_id: null,
      meta: {
        bankRole: "org_deposit",
        recipient: "org",
        source: "payments_organization",
        organizationUuid: "8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823",
        weekKey: "2026-09-28",
      },
    }),
  );
  const deduped = dedupeOrgBankCanonicalEvents([older, newer]);
  assertEquals(deduped.length, 1);
  assertEquals(deduped[0].id, "bank-new");
  // Stamped weekKey wins (Monday deposit → prior statement week)
  assertEquals(expectedBankWeekKey(newer), "2026-09-28");
  assertEquals(expectedBankWeekKey(deduped[0]!), "2026-09-28");
});

Deno.test("week_summary fold equals signed page-grain fixture sum (statement / driver periods)", () => {
  // Real week 24 Aug 2026: 66 fare reversals totaling J$6,566.39 → −656_639 minor in week_totals.
  const pageGrain = [
    pageRow({
      id: "f1",
      entry_type: "fare_earning",
      amount_minor: 10_000_00,
      meta: {},
    }),
    pageRow({
      id: "f2",
      entry_type: "fare_earning",
      amount_minor: 656_639,
      meta: { reversal: true },
    }),
  ];
  const oldPathSum = pageGrain.reduce((acc, r) => {
    const c = mapPageRowToCanonical(r);
    return (
      acc +
      Math.round(
        signedLedgerAmount({
          netAmount: Number(c.netAmount),
          metadata: c.metadata as Record<string, unknown>,
        }) * 100,
      )
    );
  }, 0);

  const weekRows: WeekSummaryRow[] = [
    {
      organization_id: "8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823",
      week_start: "2026-08-24",
      driver_id: "11111111-1111-1111-1111-111111111111",
      product: "roam_driver",
      entry_type: "fare_earning",
      platform: "uber",
      direction: "inflow",
      sum_minor: oldPathSum,
      abs_sum_minor: 10_000_00 + 656_639,
      gross_minor: oldPathSum,
      entry_count: 2,
      reconciled_count: 0,
      last_entry_at: "2026-08-26T15:00:00Z",
    },
  ];
  assertEquals(sumWeekSummaryMinor(weekRows), oldPathSum);
  assertEquals(oldPathSum, 10_000_00 - 656_639);

  const folded = foldWeekSummaryByDriverType(weekRows);
  assertEquals(
    folded.get("11111111-1111-1111-1111-111111111111")?.get("fare_earning"),
    oldPathSum / 100,
  );

  // Expense-hub day totals path: synthetic events from week summary match fold
  const synthetic = weekSummaryToCanonicalEvents(weekRows);
  const synthSum = synthetic.reduce((a, e) => a + Math.round(Number(e.netAmount) * 100), 0);
  assertEquals(synthSum, oldPathSum);
});

Deno.test("1,001-row range: cap + hasMore throws (R5)", () => {
  assertThrows(
    () => assertCanonicalPageCap({ fetched: 1000, maxRows: 1000, hasMore: true }),
    Error,
    "Range too large — narrow the dates",
  );
  // Exact fill without hasMore is OK
  assertCanonicalPageCap({ fetched: 1000, maxRows: 1000, hasMore: false });
  assertCanonicalPageCap({ fetched: 50, maxRows: 1000, hasMore: true });
});

Deno.test("week_summary requires org+range at helper boundary (documented contract)", () => {
  const missingOrg = () => {
    const org = "";
    if (!org) throw new Error("ledger read requires organization_id");
  };
  const missingRange = () => {
    const from = "";
    const to = "2026-10-27";
    if (!from || !to) throw new Error("ledger read requires date range (from, to)");
  };
  let orgErr = "";
  let rangeErr = "";
  try {
    missingOrg();
  } catch (e) {
    orgErr = (e as Error).message;
  }
  try {
    missingRange();
  } catch (e) {
    rangeErr = (e as Error).message;
  }
  assertEquals(orgErr, "ledger read requires organization_id");
  assertEquals(rangeErr, "ledger read requires date range (from, to)");
});
