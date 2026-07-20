import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";
import { ReconciledTollsList } from "./ReconciledTollsList";
import { ResolvedRefundsList, ResolvedRefundRow } from "./ResolvedRefundsList";
import { UnifiedTollActivityTable } from "./UnifiedTollActivityTable";
import { ResolvedHistoryList } from "../../claimable-loss/ResolvedHistoryList";
import { FinancialTransaction, Trip, Claim, DisputeRefund } from "../../../types/data";
import { getCrossPeriodCoverage } from "../../../utils/tollWeekPeriod";

/**
 * Single History home for Underpaid & Claims — claims + period audit
 * (resolved refunds / matched tolls / all activity). Replaces the old
 * duplicate bottom History panel on the wizard.
 */
export function PeriodHistoryPanel(props: {
  /** Closed underpaid claims for this period. */
  resolvedClaims: Claim[];
  loadingClaims?: boolean;
  getDriverName: (driverId: string) => string;
  onDeleteClaims: (ids: string[]) => void;
  onUpdateClaimStatus: (
    claim: Claim,
    newReason: "Charge Driver" | "Write Off" | "Reimbursed",
  ) => void;
  onSelectClaim: (claim: Claim) => void;
  trips: Trip[];
  tollById: Map<string, FinancialTransaction>;
  onUndoUnlinkedApply?: (tripId: string) => Promise<void> | void;
  busyUnlinkedTripId?: string | null;

  resolvedRefundTrips: Trip[];
  onUndoRefund: (tripId: string) => Promise<void> | void;
  matchedTolls: FinancialTransaction[];
  allReconciledTolls: FinancialTransaction[];
  periodClaims: Claim[];
  allClaims: Claim[];
  fleetTz: string;
  disputeRefunds?: DisputeRefund[];
  onUnmatch: (tx: FinancialTransaction) => Promise<any>;
  selectedDriverId: string;
  periodStartDate: string;
  periodEndDate: string;
}) {
  return (
    <div className="space-y-4">
      <Tabs defaultValue="claims" className="w-full">
        <TabsList className="grid w-full grid-cols-2 gap-1 sm:grid-cols-4 sm:max-w-2xl">
          <TabsTrigger value="claims">
            Claims
            {props.resolvedClaims.length > 0 && (
              <span className="ml-2 bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full text-xs font-bold">
                {props.resolvedClaims.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="refunds">
            Resolved refunds
            {props.resolvedRefundTrips.length > 0 && (
              <span className="ml-2 bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full text-xs font-bold">
                {props.resolvedRefundTrips.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="matched">
            Matched
            <span className="ml-2 bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full text-xs font-bold">
              {props.matchedTolls.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="activity">All activity</TabsTrigger>
        </TabsList>

        <TabsContent value="claims" className="mt-4">
          <ResolvedHistoryList
            claims={props.resolvedClaims}
            isLoading={props.loadingClaims}
            getDriverName={props.getDriverName}
            onDelete={props.onDeleteClaims}
            onUpdateStatus={props.onUpdateClaimStatus}
            onSelectClaim={props.onSelectClaim}
            trips={props.trips}
            tollById={props.tollById}
            disputeRefunds={props.disputeRefunds}
            onUndoUnlinkedApply={props.onUndoUnlinkedApply}
            busyUnlinkedTripId={props.busyUnlinkedTripId}
          />
        </TabsContent>

        <TabsContent value="refunds" className="mt-4">
          <ResolvedRefundsList
            rows={props.resolvedRefundTrips.map((t): ResolvedRefundRow => {
              const res = t.tollRefundResolution;
              const claimId = res?.appliedToClaimId;
              const claimPool = props.allClaims?.length ? props.allClaims : props.periodClaims;
              const tollPool = props.allReconciledTolls?.length
                ? props.allReconciledTolls
                : props.matchedTolls;
              const claim = claimId
                ? claimPool.find((c) => c?.id === claimId)
                : claimPool.find((c) => c?.unlinkedTripId === t.id);
              const tollId = claim?.transactionId || res?.appliedToTollId || null;
              const toll = tollId ? tollPool.find((tx) => tx.id === tollId) : undefined;
              const targetTollDate =
                (toll as { date?: string } | undefined)?.date ||
                claim?.date ||
                (claim as { tripDate?: string } | undefined)?.tripDate ||
                null;
              const cross = getCrossPeriodCoverage(t.date, targetTollDate, props.fleetTz);
              return {
                id: t.id,
                date: t.date,
                platform: t.platform,
                driverId: t.driverId,
                driverName: t.driverName,
                tollCharges: t.tollCharges,
                pickupLocation: t.pickupLocation,
                dropoffLocation: t.dropoffLocation,
                resolution: (res?.status as ResolvedRefundRow["resolution"]) || "cash_wash",
                resolvedBy: res?.resolvedBy,
                resolvedAt: res?.resolvedAt,
                auto: res?.auto,
                appliedToClaimId: res?.appliedToClaimId,
                appliedToTollId: res?.appliedToTollId,
                resolutionSource: res?.source,
                resolutionNotes: res?.notes,
                preUnlinkedStatus: claim?.preUnlinkedStatus,
                preUnlinkedResolutionReason: claim?.preUnlinkedResolutionReason,
                targetTollAmount: toll
                  ? Math.abs(Number(toll.amount) || 0)
                  : claim
                    ? Math.abs(Number(claim.expectedAmount ?? claim.amount) || 0)
                    : null,
                targetLocation:
                  (toll as { description?: string; vendor?: string } | undefined)?.description ||
                  (toll as { vendor?: string } | undefined)?.vendor ||
                  claim?.subject ||
                  null,
                targetTollDate,
                crossPeriodTargetWeekLabel: cross?.targetWeekLabel ?? null,
              };
            })}
            onUndo={props.onUndoRefund}
            onUndoApply={props.onUndoUnlinkedApply}
            busyTripId={props.busyUnlinkedTripId}
          />
        </TabsContent>

        <TabsContent value="matched" className="mt-4">
          <ReconciledTollsList
            tolls={props.matchedTolls}
            trips={props.trips}
            claims={props.periodClaims}
            disputeRefunds={props.disputeRefunds || []}
            onUnmatch={props.onUnmatch}
          />
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <div className="mb-2">
            <p className="text-sm text-slate-600">
              One timeline across toll ledger, legacy imports, unlinked trip refunds, and Uber support
              adjustments. Amounts follow each source&apos;s sign convention (toll charges are usually
              negative; credits positive).
            </p>
          </div>
          <UnifiedTollActivityTable
            driverId={props.selectedDriverId || undefined}
            initialFrom={props.periodStartDate}
            initialTo={props.periodEndDate}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
