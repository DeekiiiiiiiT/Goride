import React, { useState, useEffect } from 'react';
import { LossList } from "../components/claimable-loss/LossList";
import { PendingReimbursementList } from "../components/claimable-loss/PendingReimbursementList";
import { DisputeLostList } from "../components/claimable-loss/DisputeLostList";
import { ResolvedHistoryList } from "../components/claimable-loss/ResolvedHistoryList";
import { DisputeModal } from "../components/claimable-loss/DisputeModal";
import { useTollReconciliation } from "../hooks/useTollReconciliation";
import { useClaims } from "../hooks/useClaims";
import { api } from "../services/api";
import { FinancialTransaction, Claim } from "../types/data";
import { MatchResult } from "../utils/tollReconciliation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { toast } from "sonner";

export function ClaimableLoss() {
  const { 
    loading: loadingTolls, 
    unreconciledTolls, 
    suggestions 
  } = useTollReconciliation();

  const { claims, loading: loadingClaims, updateClaim, refresh: refreshClaims } = useClaims();
  const [drivers, setDrivers] = useState<any[]>([]);

  useEffect(() => {
    api.getDrivers().then(setDrivers).catch(console.error);
  }, []);

  const getDriverName = (driverId: string) => {
    const driver = drivers.find(d => d.id === driverId || d.uberDriverId === driverId || d.inDriveDriverId === driverId);
    return driver ? driver.name : driverId;
  };

  const [selectedLoss, setSelectedLoss] = useState<{ transaction: FinancialTransaction, match: MatchResult } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // 1. Prepare Unmatched Tolls (Losses)
  // We filter out any transaction that already has an active claim associated with it.
  const activeTransactionIds = new Set(claims.map(c => c.transactionId));

  const losses = unreconciledTolls.map(tx => {
      const matches = suggestions.get(tx.id);
      const bestMatch = matches?.[0];
      
      // We only care about "AMOUNT_VARIANCE" which means it matched a trip but the amount was wrong (Underpaid)
      if (bestMatch && bestMatch.matchType === 'AMOUNT_VARIANCE') {
          return { transaction: tx, match: bestMatch };
      }
      return null;
  }).filter((item): item is { transaction: FinancialTransaction, match: MatchResult } => 
      item !== null && !activeTransactionIds.has(item.transaction.id)
  );

  // 2. Prepare Pending Claims (Submitted to Uber)
  const pendingClaims = claims.filter(c => c.status === 'Submitted_to_Uber');

  // 3. Prepare Rejected/Lost Claims
  const lostClaims = claims.filter(c => c.status === 'Rejected');
  
  // 4. Awaiting Driver Claims
  const awaitingDriverClaims = claims.filter(c => c.status === 'Sent_to_Driver');

  // 5. Resolved Claims (History)
  const resolvedClaims = claims.filter(c => c.status === 'Resolved');


  // Handlers
  const handleResolve = async (claim: Claim) => {
      try {
          await updateClaim({ 
              ...claim, 
              status: 'Resolved', 
              resolutionReason: 'Reimbursed',
              updatedAt: new Date().toISOString() 
          });
          toast.success("Claim resolved and verified!");
          refreshClaims();
      } catch (e) {
          toast.error("Failed to resolve claim");
      }
  };

  const handleRevert = async (claim: Claim) => {
      try {
          await updateClaim({ ...claim, status: 'Rejected', updatedAt: new Date().toISOString() });
          toast.info("Claim marked as rejected/lost.");
          refreshClaims();
      } catch (e) {
          toast.error("Failed to revert claim");
      }
  };

  const handleRetry = async (claim: Claim) => {
      try {
          await updateClaim({ ...claim, status: 'Sent_to_Driver', updatedAt: new Date().toISOString() });
          toast.success("Claim re-opened and sent to driver.");
          refreshClaims();
      } catch (e) {
          toast.error("Failed to re-open claim");
      }
  };

  const handleChargeDriver = async (claim: Claim) => {
      try {
          // Writing off means we resolve it but accept the loss. 
          // Status is 'Resolved' (Closed).
          // Ideally, this would also trigger a deduction transaction.
          await updateClaim({ 
              ...claim, 
              status: 'Resolved', 
              resolutionReason: 'Charge Driver',
              updatedAt: new Date().toISOString() 
          });
          toast.success(`Claim resolved. $${claim.amount.toFixed(2)} will be deducted from driver pay.`);
          refreshClaims();
      } catch (e) {
          toast.error("Failed to charge driver");
      }
  };

  const handleWriteOff = async (claim: Claim) => {
      try {
          await updateClaim({ 
              ...claim, 
              status: 'Resolved', 
              resolutionReason: 'Write Off',
              updatedAt: new Date().toISOString() 
          });
          toast.success("Claim written off as company loss.");
          refreshClaims();
      } catch (e) {
          toast.error("Failed to write off claim");
      }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Claimable Loss</h1>
            <p className="text-slate-500 text-sm mt-1">
                Manage the full lifecycle of toll reimbursements and disputes.
            </p>
        </div>
      </div>
      
      <Tabs defaultValue="unmatched" className="w-full">
        <TabsList className="grid w-full grid-cols-5 lg:w-[1000px]">
          <TabsTrigger value="unmatched">
            Unmatched Tolls 
            {losses.length > 0 && <span className="ml-2 bg-slate-200 text-slate-700 px-1.5 rounded-full text-xs">{losses.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="awaiting">
            Awaiting Driver
            {awaitingDriverClaims.length > 0 && <span className="ml-2 bg-orange-100 text-orange-700 px-1.5 rounded-full text-xs">{awaitingDriverClaims.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="pending">
            Reimbursement Pending
            {pendingClaims.length > 0 && <span className="ml-2 bg-blue-100 text-blue-700 px-1.5 rounded-full text-xs">{pendingClaims.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="lost">
            Dispute Lost
            {lostClaims.length > 0 && <span className="ml-2 bg-red-100 text-red-700 px-1.5 rounded-full text-xs">{lostClaims.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="resolved">
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="unmatched" className="mt-6">
            <LossList 
                losses={losses} 
                isLoading={loadingTolls || loadingClaims} 
                onSelectLoss={(item) => {
                    setSelectedLoss(item);
                    setIsModalOpen(true);
                }}
            />
        </TabsContent>

        <TabsContent value="awaiting" className="mt-6">
             <PendingReimbursementList 
                claims={awaitingDriverClaims}
                isLoading={loadingClaims}
                onResolve={(c) => handleRetry(c)} 
                onRevert={(c) => handleRevert(c)}
                title="Awaiting Driver Submission"
                description="Claims sent to drivers but not yet submitted to Uber."
                getDriverName={getDriverName}
             />
             <p className="text-xs text-slate-500 mt-2 text-center">
                * These claims have been sent to drivers but they haven't submitted them to Uber yet.
             </p>
        </TabsContent>

        <TabsContent value="pending" className="mt-6">
            <PendingReimbursementList 
                claims={pendingClaims}
                isLoading={loadingClaims}
                onResolve={handleResolve}
                onRevert={handleRevert}
                getDriverName={getDriverName}
            />
        </TabsContent>

        <TabsContent value="lost" className="mt-6">
            <DisputeLostList 
                claims={lostClaims}
                isLoading={loadingClaims}
                onRetry={handleRetry}
                onChargeDriver={handleChargeDriver}
                onWriteOff={handleWriteOff}
                getDriverName={getDriverName}
            />
        </TabsContent>

        <TabsContent value="resolved" className="mt-6">
            <ResolvedHistoryList 
                claims={resolvedClaims}
                isLoading={loadingClaims}
                getDriverName={getDriverName}
            />
        </TabsContent>
      </Tabs>

      <DisputeModal 
        isOpen={isModalOpen}
        onClose={() => {
            setIsModalOpen(false);
            refreshClaims(); 
        }}
        lossItem={selectedLoss}
      />
    </div>
  );
}
