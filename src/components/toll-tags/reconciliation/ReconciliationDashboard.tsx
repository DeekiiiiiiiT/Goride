import React, { useMemo, useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../ui/tooltip";
import { UnmatchedTollsList } from "./UnmatchedTollsList";
import { UnclaimedRefundsList } from "./UnclaimedRefundsList";
import { ReconciledTollsList } from "./ReconciledTollsList";
import { useTollReconciliation } from "../../../hooks/useTollReconciliation";
import { useClaims } from "../../../hooks/useClaims";
import { Loader2, RefreshCw, Wand2, AlertTriangle, TrendingDown, TrendingUp, DollarSign, Wallet, HelpCircle, Filter, Bot } from "lucide-react";
import { Button } from "../../ui/button";
import { runScenarioTest } from "../../../utils/testScenario";
import { DisputeModal } from "../../claimable-loss/DisputeModal";
import { FinancialTransaction } from "../../../types/data";
import { MatchResult, calculateTollFinancials } from "../../../utils/tollReconciliation";
import { toast } from "sonner@2.0.3";
import { Trip as TripType } from "../../../types/data";
import { api } from "../../../services/api";

export function ReconciliationDashboard() {
  const handleRunTest = () => {
    const result = runScenarioTest();
    console.log(result);
    alert(result);
  };

  // Phase 5: Driver filter
  const [drivers, setDrivers] = useState<any[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');

  useEffect(() => {
    api.getDrivers().then(setDrivers).catch(console.error);
  }, []);

  const { 
    loading: tollsLoading, 
    unreconciledTolls, 
    reconciledTolls,
    unclaimedRefunds, 
    trips, 
    suggestions, 
    reconcile, 
    unreconcile,
    approve,
    reject,
    autoMatchAll,
    autoReconciledCount,
    refresh 
  } = useTollReconciliation(selectedDriverId || undefined);

  const { claims, loading: claimsLoading, refresh: refreshClaims, createClaim } = useClaims();

  const [isDisputeOpen, setIsDisputeOpen] = React.useState(false);
  const [disputeTarget, setDisputeTarget] = React.useState<{ transaction: FinancialTransaction, match: MatchResult } | null>(null);

  // Create Trip Map for O(1) lookup. MOVED UP before early return to obey Rules of Hooks.
  const tripMap = useMemo(() => new Map(trips.map(t => [t.id, t])), [trips]);

  const handleOpenDispute = (transaction: FinancialTransaction, match: MatchResult) => {
    setDisputeTarget({ transaction, match });
    setIsDisputeOpen(true);
  };

  // Phase 4: Action Logic Handlers
  // These handlers direct the user intent to the correct logical flow.
  // In Phase 5, we will add the specific API calls (approveExpense, rejectExpense) inside these.

  const handleApprove = async (tx: FinancialTransaction) => {
      // Case: Cash/Green (Perfect Match)
      // Action: Reimburse Driver (Fleet owes Driver)
      // Logic: Link the trip (Reconcile) AND set status to 'Approved'.
      
      const match = suggestions.get(tx.id)?.[0];
      if (match) {
          // 1. Link the toll to the trip
          await reconcile(tx, match.trip);
          // 2. Mark as Approved (Resolved)
          await approve(tx, "Matched & Approved via Dashboard");
      }
  };

  const handleReject = async (tx: FinancialTransaction) => {
      // Case: Cash/Purple (Personal)
      // Action: Personal Expense (Driver Liability)
      // Logic: Set status to 'Rejected'. 
      
      const match = suggestions.get(tx.id)?.[0];
      const reason = match?.matchType === 'PERSONAL_MATCH' ? "Identified as Personal Trip" : "Rejected by Admin";
      await reject(tx, reason);
  };

  const handleFlag = async (tx: FinancialTransaction) => {
      // Case: Cash/Amber (Variance/Partial)
      // Action: Flag for Claim -> Now just Match & Reconcile
      // Rationale: These are already surfaced in "Claimable Loss" based on the reconciliation status and variance.
      // So we just need to confirm the link here.
      
      const match = suggestions.get(tx.id)?.[0];
      if (match) {
          // Just reconcile directly. 
          // The variance will automatically make it show up in Claimable Loss if logic allows (it does).
          await reconcile(tx, match.trip);
          toast.success("Flagged for claim");
          
          // Force refresh to ensure list is updated (workaround for sticky state)
          refresh();
      }
  };

  const handleManualResolve = async (tx: FinancialTransaction, type: 'Personal' | 'WriteOff' | 'Business') => {
      try {
          const commonData = {
              transactionId: tx.id,
              amount: Math.abs(tx.amount),
              status: 'Resolved' as const,
              type: 'Toll_Refund' as const,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
          };

          if (type === 'Personal') {
              await createClaim({
                  ...commonData,
                  driverId: tx.driverId || 'unknown',
                  resolutionReason: 'Charge Driver',
                  subject: 'Unmatched Toll - Personal Use',
                  message: 'This toll was identified as personal usage and charged to your account.'
              });
              // Update transaction status to Rejected (driver liability, no fleet reimbursement)
              await reject(tx, 'Manual Resolution: Personal (Driver Pays)');
              toast.success("Marked as Personal (Driver Liability)");
          } else if (type === 'WriteOff') {
               await createClaim({
                  ...commonData,
                  driverId: tx.driverId || 'fleet',
                  resolutionReason: 'Write Off',
                  subject: 'Unmatched Toll - Write Off',
                  message: 'Fleet wrote off this expense.'
              });
              // Update transaction status to Approved (fleet absorbs cost → triggers wallet credit for Cash tolls)
              await approve(tx, 'Manual Resolution: Write Off (Fleet Pays)');
              toast.success("Written off as Fleet Loss");
          } else if (type === 'Business') {
               await createClaim({
                  ...commonData,
                  driverId: tx.driverId || 'fleet',
                  resolutionReason: 'Write Off', // Effectively a fleet absorption
                  subject: 'Business Expense',
                  message: 'Legitimate business expense (e.g. maintenance).'
              });
              // Update transaction status to Approved (fleet absorbs cost → triggers wallet credit for Cash tolls)
              await approve(tx, 'Manual Resolution: Business Expense');
              toast.success("Marked as Business Expense");
          }
          
          // Refresh both datasets to update UI
          await Promise.all([refresh(), refreshClaims()]);
      } catch (error) {
          console.error("Manual resolution failed", error);
          toast.error("Failed to resolve transaction");
      }
  };

  const handleEditToll = async (transactionId: string, updates: Record<string, any>) => {
      try {
          await api.editToll(transactionId, updates);
          toast.success("Transaction updated successfully");
          await refresh();
      } catch (error) {
          console.error("Edit toll failed", error);
          toast.error("Failed to update transaction");
      }
  };

  // Filter out tolls that have an existing claim
  // This ensures we don't double-process a toll or see items we've already handled.
  const claimedTransactionIds = new Set(claims.map(c => c.transactionId));
  const filteredUnreconciledTolls = unreconciledTolls.filter(tx => !claimedTransactionIds.has(tx.id));

  const isLoading = tollsLoading || claimsLoading;

  if (isLoading) {
    return (
        <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            <span className="ml-2 text-slate-500">Analyzing toll data...</span>
        </div>
    );
  }

  // Calculate Financial Aggregates
  let claimableAmount = 0; // Amber: Unreconciled Underpayments
  let unreconciledPersonal = 0;   // Purple: Unreconciled Personal matches
  let unknownAmount = 0;    // No match found (Potential Personal)

  filteredUnreconciledTolls.forEach(tx => {
    const matches = suggestions.get(tx.id);
    const bestMatch = matches?.[0];
    const amount = Math.abs(tx.amount);

    if (!bestMatch) {
      unknownAmount += amount;
      return;
    }

    switch (bestMatch.matchType) {
      case 'AMOUNT_VARIANCE': // Amber
        claimableAmount += (bestMatch.varianceAmount || amount);
        break;
      case 'PERSONAL_MATCH': // Purple
        unreconciledPersonal += amount;
        break;
      // Phase 6: PERFECT_MATCH tolls are now auto-reconciled server-side (Phase 1)
      // and never appear in filteredUnreconciledTolls, so no case needed.
      default:
        unknownAmount += amount;
    }
  });

  // Calculate Reconciled Stats (History)
  let reconciledLiability = 0;
  let recoveredAmount = 0;

  reconciledTolls.forEach(tx => {
      const trip = tripMap.get(tx.tripId || '');
      const claim = claims.find(c => c.transactionId === tx.id);
      
      const financials = calculateTollFinancials(tx, trip, claim);

      // Recovered: Platform + Driver
      recoveredAmount += financials.totalRecovered;

      // Liability: Net Loss (what the fleet actually paid)
      // NOTE: "Driver Liability" card traditionally means "What we need to charge the driver"
      // But now that we have claims, "Driver Liability" should essentially be:
      // 1. Unreconciled Personal (Needs to be charged)
      // 2. Net Loss (Deficit that hasn't been charged yet?)
      // Wait, let's stick to the definition:
      // If it's recovered via Driver Charge (Claim), it's not a liability anymore, it's Recovered.
      // So Liability should track UNRECOVERED personal usage or deficits.
      
      // If financials.netLoss > 0, that is money the fleet lost.
      // Is it driver liability? Only if it SHOULD have been charged.
      // For now, let's map "Net Loss" to the liability bucket if we assume strict fleet controls.
      // However, the previous logic was: variance < -0.01 -> add to liability.
      
      // New Logic: 
      // If netLoss > 0, it contributes to fleet loss (which might be driver liability if we pursue it).
      reconciledLiability += financials.netLoss;
  });

  const totalDriverLiability = unreconciledPersonal + reconciledLiability + unknownAmount;

  // Yellow: Unclaimed Refunds (Money Uber paid you, but you haven't matched to an expense)
  const refundsAmount = unclaimedRefunds.reduce((sum, t) => sum + (t.tollCharges || 0), 0);

  // Count high confidence matches for auto-button
  // Phase 5: Scope to filteredUnreconciledTolls only (excludes claimed items)
  const filteredTollIds = new Set(filteredUnreconciledTolls.map(tx => tx.id));
  const highConfidenceCount = Array.from(suggestions.entries())
    .filter(([txId, matches]) => filteredTollIds.has(txId) && matches[0]?.confidence === 'high')
    .length;

  const handleSmartReconcile = async (tx: FinancialTransaction, trip: TripType) => {
      // Check if this is a personal match
      const match = suggestions.get(tx.id)?.find(m => m.trip.id === trip.id);
      
      if (match?.matchType === 'PERSONAL_MATCH') {
          try {
              // 1. Link the trip (Reconcile)
              await reconcile(tx, trip);
              
              // 2. Create the "Charge Driver" claim automatically
              await createClaim({
                  transactionId: tx.id,
                  driverId: trip.driverId || tx.driverId || 'unknown',
                  amount: Math.abs(tx.amount),
                  status: 'Resolved',
                  type: 'Toll_Refund',
                  resolutionReason: 'Charge Driver',
                  subject: 'Unmatched Toll - Personal Use',
                  message: `System identified this toll as personal usage during trip ${trip.id}.`,
                  tripId: trip.id,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString()
              });
              
              toast.success("Linked to Trip & Charged to Driver");
              refreshClaims();
          } catch (e) {
              console.error(e);
              toast.error("Failed to process Personal Match");
          }
      } else {
          // Standard reconcile for other types
          await reconcile(tx, trip);
          toast.success("Transaction Linked Successfully");
      }
  };

  return (
    <TooltipProvider>
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">Toll Reconciliation</h2>
            <p className="text-slate-500">Match toll expenses with trip refunds to identify leakage.</p>
        </div>
        <div className="flex items-center space-x-2">
            {/* Phase 5: Driver filter */}
            <div className="flex items-center gap-1.5">
                <Filter className="h-4 w-4 text-slate-400" />
                <select
                    value={selectedDriverId}
                    onChange={(e) => setSelectedDriverId(e.target.value)}
                    className="h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                    <option value="">All Drivers</option>
                    {drivers.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                </select>
            </div>
            <Button variant="ghost" size="sm" onClick={handleRunTest} className="text-slate-400 hover:text-slate-600">
                Test
            </Button>
            {highConfidenceCount > 0 && (
                <Button variant="default" size="sm" onClick={autoMatchAll} className="bg-indigo-600 hover:bg-indigo-700">
                    <Wand2 className="h-4 w-4 mr-2" />
                    Auto-match {highConfidenceCount}
                </Button>
            )}
            <Button variant="outline" size="sm" onClick={refresh}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh Data
            </Button>
        </div>
      </div>

      {/* Financial Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Claimable (Amber) */}
        <div className="bg-white p-4 rounded-lg border border-orange-200 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-2 h-full bg-orange-400" />
            <div className="flex justify-between items-start">
                <div>
                    <div className="flex items-center gap-1.5">
                        <h3 className="text-xs font-medium text-orange-600 uppercase tracking-wider">Claimable Loss</h3>
                        <Tooltip>
                            <TooltipTrigger>
                                <HelpCircle className="h-3.5 w-3.5 text-orange-400 hover:text-orange-600 transition-colors" />
                            </TooltipTrigger>
                            <TooltipContent>
                                <p className="max-w-[200px] text-xs">Tolls paid during an active trip that were not fully reimbursed. This represents money owed to you by Uber.</p>
                            </TooltipContent>
                        </Tooltip>
                    </div>
                    <div className="text-2xl font-bold text-slate-900 mt-1">${claimableAmount.toFixed(2)}</div>
                    <div className="text-xs text-slate-500 mt-1">Uber underpayments</div>
                </div>
                <TrendingDown className="h-5 w-5 text-orange-400" />
            </div>
        </div>

        {/* Card 2: Recovered (Green) - Replaces Deadhead */}
        <div className="bg-white p-4 rounded-lg border border-emerald-200 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-2 h-full bg-emerald-400" />
            <div className="flex justify-between items-start">
                <div>
                    <div className="flex items-center gap-1.5">
                        <h3 className="text-xs font-medium text-emerald-600 uppercase tracking-wider">Recovered</h3>
                        <Tooltip>
                            <TooltipTrigger>
                                <HelpCircle className="h-3.5 w-3.5 text-emerald-400 hover:text-emerald-600 transition-colors" />
                            </TooltipTrigger>
                            <TooltipContent>
                                <p className="max-w-[200px] text-xs">Total toll expenses successfully covered by Uber reimbursements.</p>
                            </TooltipContent>
                        </Tooltip>
                    </div>
                    <div className="text-2xl font-bold text-slate-900 mt-1">${recoveredAmount.toFixed(2)}</div>
                    <div className="text-xs text-slate-500 mt-1">Paid by Uber</div>
                </div>
                <TrendingUp className="h-5 w-5 text-emerald-400" />
            </div>
        </div>

        {/* Card 3: Personal/Liability (Purple) */}
        <div className="bg-white p-4 rounded-lg border border-purple-200 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-2 h-full bg-purple-400" />
            <div className="flex justify-between items-start">
                <div>
                    <div className="flex items-center gap-1.5">
                        <h3 className="text-xs font-medium text-purple-600 uppercase tracking-wider">Driver Liability</h3>
                        <Tooltip>
                            <TooltipTrigger>
                                <HelpCircle className="h-3.5 w-3.5 text-purple-400 hover:text-purple-600 transition-colors" />
                            </TooltipTrigger>
                            <TooltipContent>
                                <p className="max-w-[200px] text-xs">Total liability to be charged to the driver (Unreconciled Personal + Reconciled Deficits).</p>
                            </TooltipContent>
                        </Tooltip>
                    </div>
                    <div className="text-2xl font-bold text-slate-900 mt-1">${totalDriverLiability.toFixed(2)}</div>
                    <div className="text-xs text-slate-500 mt-1">Charge to driver</div>
                </div>
                <Wallet className="h-5 w-5 text-purple-400" />
            </div>
        </div>

        {/* Card 4: Refunds (Yellow) */}
        <div className="bg-white p-4 rounded-lg border border-yellow-200 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-2 h-full bg-yellow-400" />
            <div className="flex justify-between items-start">
                <div>
                    <div className="flex items-center gap-1.5">
                        <h3 className="text-xs font-medium text-yellow-600 uppercase tracking-wider">Unlinked Refunds</h3>
                        <Tooltip>
                            <TooltipTrigger>
                                <HelpCircle className="h-3.5 w-3.5 text-yellow-400 hover:text-yellow-600 transition-colors" />
                            </TooltipTrigger>
                            <TooltipContent>
                                <p className="max-w-[200px] text-xs">Trips where the platform reimbursed a toll through the fare, but no matching toll expense record exists. This usually means the toll tag charge hasn't been imported yet.</p>
                            </TooltipContent>
                        </Tooltip>
                    </div>
                    <div className="text-2xl font-bold text-slate-900 mt-1">${refundsAmount.toFixed(2)}</div>
                    <div className="text-xs text-slate-500 mt-1">Missing expense records</div>
                </div>
                <DollarSign className="h-5 w-5 text-yellow-400" />
            </div>
        </div>
      </div>

      {/* Phase 6: Auto-match session banner */}
      {autoReconciledCount > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-lg text-sm text-indigo-700">
          <Bot className="h-4 w-4 shrink-0" />
          <span>
            <strong>{autoReconciledCount}</strong> toll{autoReconciledCount === 1 ? ' was' : 's were'} auto-matched to trips this session.{' '}
            <span className="text-indigo-500">View in Matched History.</span>
          </span>
        </div>
      )}

      <Tabs defaultValue="unmatched" className="w-full">
        <TabsList className="grid w-full grid-cols-3 lg:w-[600px]">
          <TabsTrigger value="unmatched">
            Unmatched Tolls
            {filteredUnreconciledTolls.length > 0 && (
                <span className="ml-2 bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full text-xs font-bold">
                    {filteredUnreconciledTolls.length}
                </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="unclaimed">
            Unlinked Refunds
            {unclaimedRefunds.length > 0 && (
                <span className="ml-2 bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded-full text-xs font-bold">
                    {unclaimedRefunds.length}
                </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">
            Matched History
            <span className="ml-2 bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full text-xs font-bold">
                    {reconciledTolls.length}
            </span>
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="unmatched" className="mt-4">
            <UnmatchedTollsList 
                tolls={filteredUnreconciledTolls} 
                suggestions={suggestions}
                onReconcile={handleSmartReconcile}
                allTrips={trips}
                onOpenDispute={handleOpenDispute}
                onApprove={handleApprove}
                onReject={handleReject}
                onFlag={handleFlag}
                onManualResolve={handleManualResolve}
                onEdit={handleEditToll}
            />
        </TabsContent>
        
        <TabsContent value="unclaimed" className="mt-4">
            <UnclaimedRefundsList trips={unclaimedRefunds} />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
            <ReconciledTollsList 
                tolls={reconciledTolls} 
                trips={trips}
                claims={claims}
                onUnmatch={unreconcile}
            />
        </TabsContent>
      </Tabs>

      <DisputeModal
        isOpen={isDisputeOpen}
        onClose={() => setIsDisputeOpen(false)}
        lossItem={disputeTarget}
        onClaimSuccess={async () => {
            if (disputeTarget) {
                // Link the toll to the trip as we've just created a claim for the variance
                await reconcile(disputeTarget.transaction, disputeTarget.match.trip);
                setIsDisputeOpen(false);
                await refreshClaims();
                refresh();
            }
        }}
      />
    </div>
    </TooltipProvider>
  );
}