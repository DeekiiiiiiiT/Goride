/**
 * TR-C2a: frozen inventory of period-affecting mutators that must call a seal guard.
 * Source scan — importing the boot module needs a live DB.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SEAL_GUARD_RE =
  /refuseIfTollPeriodSealed|refuseSealedForTollId|refuseSealedForTripId|refuseSealedForWeekKeys/;

/**
 * Every money / readiness-mutating route that must refuse sealed weeks.
 * Adding a route here forces the author to wire a seal guard in the handler body.
 */
const SEALED_MUTATING_ROUTE_INVENTORY: Array<{
  /** Unique substring that identifies the route registration site. */
  routeMarker: string;
  label: string;
}> = [
  { routeMarker: "`${BASE}/reconcile`,", label: "POST /reconcile" },
  { routeMarker: "`${BASE}/unreconcile`,", label: "POST /unreconcile" },
  { routeMarker: "`${BASE}/edit`,", label: "PATCH /edit" },
  { routeMarker: "`${BASE}/approve`,", label: "POST /approve" },
  { routeMarker: "`${BASE}/reject`,", label: "POST /reject" },
  { routeMarker: "`${BASE}/resolve`,", label: "POST /resolve" },
  { routeMarker: "`${BASE}/bulk-reconcile`,", label: "POST /bulk-reconcile" },
  { routeMarker: "`${BASE}/reset-for-reconciliation`,", label: "POST /reset-for-reconciliation" },
  { routeMarker: "`${BASE}/reset-period`,", label: "POST /reset-period" },
  { routeMarker: "`${BASE}/personal-use/auto-charge`,", label: "POST /personal-use/auto-charge" },
  { routeMarker: "`${BASE}/unlinked-refunds/apply-to-claim`,", label: "POST /unlinked-refunds/apply-to-claim" },
  // TR-C2a six + siblings
  { routeMarker: "`${BASE}/resolve-refund`,", label: "POST /resolve-refund" },
  { routeMarker: "`${BASE}/resolve-refund/bulk`,", label: "POST /resolve-refund/bulk" },
  { routeMarker: "`${BASE}/unlinked-refunds/undo-apply`,", label: "POST /unlinked-refunds/undo-apply" },
  { routeMarker: "voidTollLedgerEntryHandler", label: "POST /toll-ledger/:id/void" },
  { routeMarker: "`${BASE}/auto-match`,", label: "POST /auto-match" },
  { routeMarker: "`${BASE}/auto-resolve-refunds`,", label: "POST /auto-resolve-refunds" },
  { routeMarker: "`${BASE}/unlinked-refunds/repair-split`,", label: "POST /unlinked-refunds/repair-split" },
  { routeMarker: "`${BASE}/repair-dispute-partial-claims`,", label: "POST /repair-dispute-partial-claims" },
];

function handlerChunkAfterMarker(source: string, marker: string): string {
  const idx = source.indexOf(marker);
  if (idx < 0) return "";
  // From this registration to the next app.(get|post|…) — covers full handler body.
  const rest = source.slice(idx);
  const next = rest.slice(marker.length).search(/\napp\.(get|post|put|patch|delete)\(/);
  if (next < 0) return rest.slice(0, 12000);
  return rest.slice(0, marker.length + next);
}

Deno.test("TR-C2a: SEALED_MUTATING_ROUTE_INVENTORY each has a seal guard nearby", async () => {
  const source = await Deno.readTextFile(new URL("./toll_controller.tsx", import.meta.url));
  const missing: string[] = [];
  for (const { routeMarker, label } of SEALED_MUTATING_ROUTE_INVENTORY) {
    const chunk = handlerChunkAfterMarker(source, routeMarker);
    if (!chunk || !SEAL_GUARD_RE.test(chunk)) {
      missing.push(label);
    }
  }
  assertEquals(
    missing,
    [],
    `Routes missing refuseIfTollPeriodSealed / refuseSealed*: ${missing.join(", ")}`,
  );
});

Deno.test("TR-C2a: seal-guard helpers exist on the controller", async () => {
  const source = await Deno.readTextFile(new URL("./toll_controller.tsx", import.meta.url));
  assertEquals(/async function refuseSealedForTripId/.test(source), true);
  assertEquals(/async function refuseSealedForWeekKeys/.test(source), true);
  assertEquals(/async function refuseSealedForTollId/.test(source), true);
});

Deno.test("periodSealedBody still documents reopenPath for TR-C2a routes", async () => {
  const { periodSealedBody, TollPeriodSealedError } = await import("./toll_period_writable.ts");
  const body = periodSealedBody(new TollPeriodSealedError("2026-09-07", "period"));
  assertEquals(body.error, "PERIOD_SEALED");
  assertEquals(typeof body.reopenPath, "string");
});
