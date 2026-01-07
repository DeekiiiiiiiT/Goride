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
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from "../components/ui/alert-dialog";

export function ClaimableLoss() {
  const { 
    loading: loadingTolls, 
    unreconciledTolls,
    reconciledTolls,
    trips,
    suggestions 
  } = useTollReconciliation();

  const { claims, loading: loadingClaims, updateClaim, deleteClaim, refresh: refreshClaims } = useClaims();
  const [drivers, setDrivers] = useState<any[]>([]);

  useEffect(() => {
    api.getDrivers().then(setDrivers).catch(console.error);
  }, []);

  const getDriverName = (driverId: string) => {
    // 1. Try Drivers List
    const driver = drivers.find(d => d.id === driverId || d.uberDriverId === driverId || d.inDriveDriverId === driverId);
    if (driver) return driver.name;

    // 2. Try Trips List (Fallback)
    // We search specifically for a trip with this driverId that has a name
    const trip = trips.find(t => t.driverId === driverId && t.driverName);
    if (trip && trip.driverName) return trip.driverName;

    return driverId;
  };

  const [selectedLoss, setSelectedLoss] = useState<{ transaction: FinancialTransaction, match: MatchResult } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [itemsToDelete, setItemsToDelete] = useState<string[]>([]);
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);

  // Create Trip Map for O(1) lookup
  const tripMap = React.useMemo(() => new Map(trips.map(t => [t.id, t])), [trips]);

  // 1. Prepare Underpaid Tolls (Losses)
  // We filter out any transaction that already has an active claim associated with it.
  const activeTransactionIds = new Set(claims.map(c => c.transactionId));

  const losses = React.useMemo(() => {
      // A. Unreconciled with 'AMOUNT_VARIANCE' suggestions
      const potentialLosses = unreconciledTolls.map(tx => {
          const matches = suggestions.get(tx.id);
          const bestMatch = matches?.[0];
          
          if (bestMatch && bestMatch.matchType === 'AMOUNT_VARIANCE') {
              return { transaction: tx, match: bestMatch };
          }
          return null;
      }).filter((item): item is { transaction: FinancialTransaction, match: MatchResult } => item !== null);

      // B. Reconciled with Negative Variance (Underpaid)
      const confirmedLosses = reconciledTolls.map(tx => {
           if (!tx.tripId) return null;
           const trip = tripMap.get(tx.tripId);
           if (!trip) return null;

           const tollCost = Math.abs(tx.amount);
           const uberRefund = trip.tollCharges || 0;
           // If refund is less than cost (allow small float diff)
           if (uberRefund < tollCost - 0.05) {
               return {
                   transaction: tx,
                   match: {
                       trip: trip,
                       matchType: 'AMOUNT_VARIANCE' as const,
                       confidence: 'high',
                       varianceAmount: uberRefund - tollCost
                   }
               };
           }
           return null;
      }).filter((item): item is { transaction: FinancialTransaction, match: MatchResult } => item !== null);

      // Merge and filter active claims
      const allLosses = [...potentialLosses, ...confirmedLosses];

      // Deduplicate by transaction ID to prevent key errors
      const uniqueLosses = Array.from(new Map(allLosses.map(item => [item.transaction.id, item])).values());

      return uniqueLosses
        .filter(item => !activeTransactionIds.has(item.transaction.id))
        .sort((a, b) => new Date(b.transaction.date).getTime() - new Date(a.transaction.date).getTime());

  }, [unreconciledTolls, reconciledTolls, suggestions, tripMap, activeTransactionIds]);


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

  const handleDeleteClaims = (ids: string[]) => {
      setItemsToDelete(ids);
      setIsDeleteAlertOpen(true);
  };

  const confirmDelete = async () => {
      try {
          await Promise.all(itemsToDelete.map(id => deleteClaim(id)));
          toast.success(`Successfully deleted ${itemsToDelete.length} claims`);
          refreshClaims();
      } catch (e) {
          toast.error("Failed to delete claims");
      } finally {
          setIsDeleteAlertOpen(false);
          setItemsToDelete([]);
      }
  };

  const handleExport = () => {
    if (pendingClaims.length === 0) {
        toast.error("No pending claims to export");
        return;
    }

    const headers = ['Date', 'Driver', 'Trip ID', 'Amount', 'Pickup', 'Dropoff', 'Status', 'Message'];
    const csvRows = [headers.join(',')];

    pendingClaims.forEach(claim => {
        const row = [
            new Date(claim.createdAt).toLocaleDateString(),
            `"${getDriverName(claim.driverId)}"`,
            claim.tripId || '',
            claim.amount.toFixed(2),
            `"${claim.pickup || ''}"`,
            `"${claim.dropoff || ''}"`,
            claim.status,
            `"${(claim.message || '').replace(/"/g, '""')}"`
        ];
        csvRows.push(row.join(','));
    });

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `uber_claims_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
        <Button onClick={handleExport} variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Export CSV
        </Button>
      </div>
      
      <Tabs defaultValue="unmatched" className="w-full">
        <TabsList className="grid w-full grid-cols-5 lg:w-[1000px]">
          <TabsTrigger value="unmatched">
            Underpaid Tolls 
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
                onDelete={handleDeleteClaims}
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

      <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete {itemsToDelete.length} resolved claims from the history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
