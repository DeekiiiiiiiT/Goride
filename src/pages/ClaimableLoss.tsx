import React, { useState } from 'react';
import { LossList } from "../components/claimable-loss/LossList";
import { PendingReimbursementList } from "../components/claimable-loss/PendingReimbursementList";
import { DisputeLostList } from "../components/claimable-loss/DisputeLostList";
import { DisputeModal } from "../components/claimable-loss/DisputeModal";
import { useTollReconciliation } from "../hooks/useTollReconciliation";
import { useClaims } from "../hooks/useClaims";
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


  // Handlers
  const handleResolve = async (claim: Claim) => {
      try {
          await updateClaim({ ...claim, status: 'Resolved', updatedAt: new Date().toISOString() });
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

  const handleArchive = async (claim: Claim) => {
      try {
          // Writing off means we resolve it but accept the loss. 
          // Status is 'Resolved' (Closed).
          await updateClaim({ ...claim, status: 'Resolved', updatedAt: new Date().toISOString() });
          toast.success("Claim written off and closed.");
          refreshClaims();
      } catch (e) {
          toast.error("Failed to archive claim");
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
        <TabsList className="grid w-full grid-cols-4 lg:w-[800px]">
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
            />
        </TabsContent>

        <TabsContent value="lost" className="mt-6">
            <DisputeLostList 
                claims={lostClaims}
                isLoading={loadingClaims}
                onRetry={handleRetry}
                onArchive={handleArchive}
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
