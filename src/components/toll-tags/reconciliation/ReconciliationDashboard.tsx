import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../ui/tooltip";
import { UnmatchedTollsList } from "./UnmatchedTollsList";
import { UnclaimedRefundsList } from "./UnclaimedRefundsList";
import { ReconciledTollsList } from "./ReconciledTollsList";
import { useTollReconciliation } from "../../../hooks/useTollReconciliation";
import { useClaims } from "../../../hooks/useClaims";
import { Loader2, RefreshCw, Wand2, Upload, AlertTriangle, TrendingDown, TrendingUp, DollarSign, Wallet, HelpCircle } from "lucide-react";
import { Button } from "../../ui/button";
import { BulkImportTollTransactionsModal } from "../../vehicles/BulkImportTollTransactionsModal";
import { runScenarioTest } from "../../../utils/testScenario";
import { DataResetModal } from "../../admin/DataResetModal";

export function ReconciliationDashboard() {
  const [importMode, setImportMode] = React.useState<'usage' | 'topup' | null>(null);
  const [isResetModalOpen, setIsResetModalOpen] = React.useState(false);
  
  const handleRunTest = () => {
    const result = runScenarioTest();
    console.log(result);
    alert(result);
  };

  const { 
    loading: tollsLoading, 
    unreconciledTolls, 
    reconciledTolls,
    unclaimedRefunds, 
    trips, 
    suggestions, 
    reconcile, 
    unreconcile,
    autoMatchAll,
    refresh 
  } = useTollReconciliation();

  const { claims, loading: claimsLoading } = useClaims();

  // Filter out tolls that have an existing claim (Active, Resolved, or Rejected)
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

  // Calculate Financial Aggregates based on Idea 1 Categories
  let claimableAmount = 0; // Amber
  let deductibleAmount = 0; // Blue
  let personalAmount = 0;   // Purple
  let unknownAmount = 0;    // No match found

  filteredUnreconciledTolls.forEach(tx => {
    const matches = suggestions.get(tx.id);
    const bestMatch = matches?.[0];

    if (!bestMatch) {
      unknownAmount += Math.abs(tx.amount);
      return;
    }

    const amount = Math.abs(tx.amount);

    switch (bestMatch.matchType) {
      case 'AMOUNT_VARIANCE': // Amber
        // The claimable amount is the Variance (Underpayment)
        // Or should it be the full amount? 
        // If Uber paid $0, variance is Full Amount.
        // If Uber paid partial, variance is the gap.
        // Let's assume we want to know "How much money am I losing?". It's the variance.
        claimableAmount += (bestMatch.varianceAmount || amount);
        break;
      case 'DEADHEAD_MATCH': // Blue
        deductibleAmount += amount;
        break;
      case 'PERSONAL_MATCH': // Purple
        personalAmount += amount;
        break;
      case 'PERFECT_MATCH': // Green (Should be reconciled, but if not auto-matched yet)
        // No loss, but technically "Pending Reconcile"
        break;
      default:
        // Treat Possible/Unknown as potential personal or deductible
        // For now, put in Unknown to encourage manual review
        unknownAmount += amount;
    }
  });

  // Yellow: Unclaimed Refunds (Money Uber paid you, but you haven't matched to an expense)
  // This is effectively "Driver Pay"
  const refundsAmount = unclaimedRefunds.reduce((sum, t) => sum + (t.tollCharges || 0), 0);

  // Count high confidence matches for auto-button
  const highConfidenceCount = Array.from(suggestions.values())
    .filter(matches => matches[0]?.confidence === 'high')
    .length;

  return (
    <TooltipProvider>
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">Toll Reconciliation</h2>
            <p className="text-slate-500">Match toll expenses with trip refunds to identify leakage.</p>
        </div>
        <div className="flex space-x-2">
            <Button 
                variant="outline" 
                size="sm" 
                className="text-rose-600 border-rose-200 hover:bg-rose-50"
                onClick={() => setIsResetModalOpen(true)}
            >
                <AlertTriangle className="h-4 w-4 mr-2" />
                Data Reset
            </Button>
            <Button variant="ghost" size="sm" onClick={handleRunTest} className="text-slate-400 hover:text-slate-600">
                Test
            </Button>
            <Button variant="outline" size="sm" onClick={() => setImportMode('usage')}>
                <Upload className="h-4 w-4 mr-2" />
                Import Usage
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
                                <p className="max-w-[200px] text-xs">Tolls paid during an active trip that were not fully reimbursed. This represents money owed to you.</p>
                            </TooltipContent>
                        </Tooltip>
                    </div>
                    <div className="text-2xl font-bold text-slate-900 mt-1">${claimableAmount.toFixed(2)}</div>
                    <div className="text-xs text-slate-500 mt-1">Uber underpayments</div>
                </div>
                <TrendingDown className="h-5 w-5 text-orange-400" />
            </div>
        </div>

        {/* Card 2: Deductible (Blue) */}
        <div className="bg-white p-4 rounded-lg border border-blue-200 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-2 h-full bg-blue-400" />
            <div className="flex justify-between items-start">
                <div>
                    <div className="flex items-center gap-1.5">
                        <h3 className="text-xs font-medium text-blue-600 uppercase tracking-wider">Business Expense</h3>
                        <Tooltip>
                            <TooltipTrigger>
                                <HelpCircle className="h-3.5 w-3.5 text-blue-400 hover:text-blue-600 transition-colors" />
                            </TooltipTrigger>
                            <TooltipContent>
                                <p className="max-w-[200px] text-xs">Tolls paid while approaching a passenger (Deadhead). These are tax deductible but not reimbursed.</p>
                            </TooltipContent>
                        </Tooltip>
                    </div>
                    <div className="text-2xl font-bold text-slate-900 mt-1">${deductibleAmount.toFixed(2)}</div>
                    <div className="text-xs text-slate-500 mt-1">Deadhead (Tax Deductible)</div>
                </div>
                <Wallet className="h-5 w-5 text-blue-400" />
            </div>
        </div>

        {/* Card 3: Personal (Purple) */}
        <div className="bg-white p-4 rounded-lg border border-purple-200 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-2 h-full bg-purple-400" />
            <div className="flex justify-between items-start">
                <div>
                    <div className="flex items-center gap-1.5">
                        <h3 className="text-xs font-medium text-purple-600 uppercase tracking-wider">Driver Personal</h3>
                        <Tooltip>
                            <TooltipTrigger>
                                <HelpCircle className="h-3.5 w-3.5 text-purple-400 hover:text-purple-600 transition-colors" />
                            </TooltipTrigger>
                            <TooltipContent>
                                <p className="max-w-[200px] text-xs">Tolls paid during personal use or outside of any trip context. These are the driver's responsibility.</p>
                            </TooltipContent>
                        </Tooltip>
                    </div>
                    <div className="text-2xl font-bold text-slate-900 mt-1">${(personalAmount + unknownAmount).toFixed(2)}</div>
                    <div className="text-xs text-slate-500 mt-1">Charge to driver</div>
                </div>
                <TrendingUp className="h-5 w-5 text-purple-400" />
            </div>
        </div>

        {/* Card 4: Refunds (Yellow) */}
        <div className="bg-white p-4 rounded-lg border border-yellow-200 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-2 h-full bg-yellow-400" />
            <div className="flex justify-between items-start">
                <div>
                    <div className="flex items-center gap-1.5">
                        <h3 className="text-xs font-medium text-yellow-600 uppercase tracking-wider">Unclaimed Refunds</h3>
                        <Tooltip>
                            <TooltipTrigger>
                                <HelpCircle className="h-3.5 w-3.5 text-yellow-400 hover:text-yellow-600 transition-colors" />
                            </TooltipTrigger>
                            <TooltipContent>
                                <p className="max-w-[200px] text-xs">Refunds provided by the platform (e.g., Uber) where no matching toll expense was found.</p>
                            </TooltipContent>
                        </Tooltip>
                    </div>
                    <div className="text-2xl font-bold text-slate-900 mt-1">${refundsAmount.toFixed(2)}</div>
                    <div className="text-xs text-slate-500 mt-1">Pay to driver</div>
                </div>
                <DollarSign className="h-5 w-5 text-yellow-400" />
            </div>
        </div>
      </div>

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
            Unclaimed Refunds
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
                onReconcile={reconcile}
                allTrips={trips}
            />
        </TabsContent>
        
        <TabsContent value="unclaimed" className="mt-4">
            <UnclaimedRefundsList trips={unclaimedRefunds} />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
            <ReconciledTollsList 
                tolls={reconciledTolls} 
                trips={trips}
                onUnmatch={unreconcile}
            />
        </TabsContent>
      </Tabs>

      {importMode && (
          <BulkImportTollTransactionsModal
            isOpen={!!importMode}
            onClose={() => setImportMode(null)}
            vehicleId=""
            vehicleName=""
            mode={importMode}
            onSuccess={refresh}
          />
      )}

      <DataResetModal 
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        onSuccess={() => {
            setIsResetModalOpen(false);
            refresh();
        }}
      />
    </div>
    </TooltipProvider>
  );
}
