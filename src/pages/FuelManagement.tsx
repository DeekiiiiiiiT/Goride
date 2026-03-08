import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { FuelLayout } from '../components/fuel/FuelLayout';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Fuel, Plus, CreditCard, Banknote, Upload, RefreshCw, History, Loader2, Link2, ShieldCheck, AlertTriangle } from 'lucide-react'; // cache-bust: AlertTriangle import fix v2
import { FuelCardList } from '../components/fuel/FuelCardList';
import { FuelCardModal } from '../components/fuel/FuelCardModal';
import { FuelLogModal } from '../components/fuel/FuelLogModal';
import { FuelLogTable } from '../components/fuel/FuelLogTable';
import { ReportsPage } from '../components/fuel/ReportsPage';
import { FuelConfiguration } from '../components/fuel/FuelConfiguration';
import { ReconciliationTable } from '../components/fuel/ReconciliationTable';
import { BucketReconciliationView } from '../components/fuel/BucketReconciliationView';
import { DatePickerWithRange } from '../components/ui/date-range-picker';
import { MileageAdjustmentModal } from '../components/fuel/MileageAdjustmentModal';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "../components/ui/sheet";
import { DisputeResolutionModal } from '../components/fuel/DisputeResolutionModal';
import { FuelReimbursementTable } from '../components/fuel/FuelReimbursementTable';
import { SubmitExpenseModal } from '../components/fuel/SubmitExpenseModal';
import { FuelAuditDashboard } from '../components/fuel/FuelAuditDashboard';
import { IntegrityGapDashboard } from '../components/fuel/IntegrityGapDashboard';
import { startOfWeek, endOfWeek } from 'date-fns';
import { useFuelAnchors } from '../hooks/useFuelAnchors';
import { fuelService } from '../services/fuelService';
import { settlementService } from '../services/settlementService';
import { FuelDisputeService } from '../services/fuelDisputeService';
import { api } from '../services/api';
import { FinalizedReportsTab } from '../components/fuel/FinalizedReportsTab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Badge } from '../components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { Checkbox } from '../components/ui/checkbox';
import { Label } from '../components/ui/label';
import { toast } from 'sonner@2.0.3';
import { DateRange } from 'react-day-picker';
import type { FuelCard, FuelEntry, FuelScenario, MileageAdjustment, FuelDispute, WeeklyFuelReport } from '../types/fuel';
import type { FinancialTransaction } from '../types/data';
import type { Trip } from '../types/data';
import type { Vehicle } from '../types/vehicle';

export function FuelManagement({ defaultTab = 'dashboard', onViewDriverLedger, onTabChange }: { 
    defaultTab?: string, 
    onViewDriverLedger?: (driverId: string) => void,
    onTabChange?: (tab: string) => void
}) {
  const [activeTab, setActiveTab] = useState(defaultTab);

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  // Decoupled Date Range States for specific audit views
  const [logDateRange, setLogDateRange] = useState<DateRange | undefined>({
      from: startOfWeek(new Date(), { weekStartsOn: 1 }),
      to: endOfWeek(new Date(), { weekStartsOn: 1 })
  });

  const [reimbursementDateRange, setReimbursementDateRange] = useState<DateRange | undefined>({
      from: startOfWeek(new Date(), { weekStartsOn: 1 }),
      to: endOfWeek(new Date(), { weekStartsOn: 1 })
  });

  const [reconciliationDateRange, setReconciliationDateRange] = useState<DateRange | undefined>({
      from: startOfWeek(new Date(), { weekStartsOn: 1 }),
      to: endOfWeek(new Date(), { weekStartsOn: 1 })
  });

  // Fuel Card State
  const [cards, setCards] = useState<FuelCard[]>([]);
  const [isCardModalOpen, setIsCardModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<FuelCard | null>(null);

  // Fuel Log State
  const [logs, setLogs] = useState<FuelEntry[]>([]);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<FuelEntry | null>(null);

  // Reimbursement State
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [isSubmitExpenseModalOpen, setIsSubmitExpenseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<FinancialTransaction | null>(null);
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<string | null>(null);
  const [deleteLogConfirmationId, setDeleteLogConfirmationId] = useState<string | null>(null);
  const [cascadeDelete, setCascadeDelete] = useState(true);

  // Adjustment State
  const [adjustments, setAdjustments] = useState<MileageAdjustment[]>([]);
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
  const [adjustmentDefaults, setAdjustmentDefaults] = useState<{ vehicleId?: string, date?: Date }>({});

  // Dispute State
  const [disputes, setDisputes] = useState<FuelDispute[]>([]);
  const [selectedDispute, setSelectedDispute] = useState<FuelDispute | null>(null);
  const [isResolutionModalOpen, setIsResolutionModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Phase 3: Bucket View State
  const [selectedBucketVehicle, setSelectedBucketVehicle] = useState<Vehicle | null>(null);
  const [isBucketSheetOpen, setIsBucketSheetOpen] = useState(false);

  // Assignment Data
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [scenarios, setScenarios] = useState<FuelScenario[]>([]);
  const [finalizedCount, setFinalizedCount] = useState(0);

  // Effect to reload trips when Reconciliation Date Range changes
  useEffect(() => {
    const fetchTripsForRange = async () => {
        if (!reconciliationDateRange?.from) return;
        try {
            // Using getTripsFiltered is more efficient and accurate for reconciliation than raw getTrips
            const response = await api.getTripsFiltered({
                startDate: reconciliationDateRange.from.toISOString(),
                endDate: reconciliationDateRange.to?.toISOString() || new Date().toISOString(),
                limit: 1500 // Cap at 1500 to prevent browser lag, but cover the week
            });
            setTrips(response.data || []);
        } catch (e) {
            console.error("Failed to fetch trips for range", e);
            // Don't toast error here to avoid spamming on mount if it fails silently
        }
    };
    fetchTripsForRange();
  }, [reconciliationDateRange]);

  const loadData = useCallback(async (silent = false) => {
      if (!silent) setIsRefreshing(true);
      try {
          // Fetch critical configuration and identifiers first
          const [vData, dData, scenariosData] = await Promise.all([
              api.getVehicles().catch(() => []),
              api.getDrivers().catch(() => []),
              fuelService.getFuelScenarios().catch(() => [])
          ]);

          setVehicles(vData);
          setDrivers(dData);
          setScenarios(scenariosData);

          // Fetch operational data in secondary batch to prevent Edge Function timeout
          // Note: Trips are now handled by the dateRange effect, but we fetch a small batch here for initial state if needed
          // or just rely on the effect. To be safe and populate "Dashboard" stats immediately without waiting for date range effect:
          const [cardsData, logsData, adjsData, disputesData, txData] = await Promise.all([
              fuelService.getFuelCards().catch(() => []),
              fuelService.getFuelEntries().catch(() => []),
              fuelService.getMileageAdjustments().catch(() => []),
              FuelDisputeService.getAllDisputes().catch(() => []),
              api.getTransactions().catch(() => []),
          ]);
          
          setCards(cardsData);
          setLogs(logsData);
          setAdjustments(adjsData);
          setDisputes(disputesData);
          setTransactions(txData);

          // Fetch finalized report count for the badge
          try {
            const finalizedData = await api.getFinalizedReports();
            setFinalizedCount(Array.isArray(finalizedData) ? finalizedData.length : 0);
          } catch {
            // Non-critical — badge just won't show a count
          }

          if (!silent) toast.success("Data refreshed");
      } catch (e) {
          console.error("Failed to load fuel management data", e);
          toast.error("Failed to load initial data");
      } finally {
          setIsRefreshing(false);
      }
  }, []);

  useEffect(() => {
    loadData(true);
  }, []);

  // Lightweight refresh for fuel entries only (used after Bulk Assign)
  const refreshLogs = useCallback(async () => {
    try {
      const logsData = await fuelService.getFuelEntries();
      setLogs(logsData);
    } catch (e) {
      console.error("[FuelManagement] Failed to refresh fuel entries after bulk assign", e);
    }
  }, []);

  // Card Handlers
  const handleSaveCard = useCallback(async (card: FuelCard) => {
      try {
          const savedCard = await fuelService.saveFuelCard(card);
          if (editingCard) {
              setCards(prev => prev.map(c => c.id === savedCard.id ? savedCard : c));
              toast.success("Fuel card updated");
          } else {
              setCards(prev => [...prev, savedCard]);
              toast.success("Fuel card added");
          }
          setIsCardModalOpen(false);
          setEditingCard(null);
      } catch (e) {
          console.error(e);
          toast.error("Failed to save fuel card");
      }
  }, [editingCard]);

  const handleDeleteCard = useCallback(async (id: string) => {
      try {
          await fuelService.deleteFuelCard(id);
          setCards(prev => prev.filter(c => c.id !== id));
          toast.success("Fuel card deleted");
      } catch (e) {
          console.error(e);
          toast.error("Failed to delete fuel card");
      }
  }, []);

  // Log Handlers
  const handleSaveLog = async (entryOrEntries: FuelEntry | FuelEntry[]) => {
      setIsSyncing(true);
      try {
          if (Array.isArray(entryOrEntries)) {
              // Bulk Mode
              const promises = entryOrEntries.map(entry => fuelService.saveFuelEntry(entry));
              const savedLogs = await Promise.all(promises);
              
              // Process settlements for bulk entries
              const scenariosData = await fuelService.getFuelScenarios();
              /* 
                 Phase 6: Legacy Auto-Settlement Disabled.
                 Settlement is now handled via the "Finalize" flow in Reconciliation Table.
              */
              
              setLogs(prev => [...savedLogs, ...prev]);
              toast.success(`Successfully recorded ${savedLogs.length} transactions (Pending Reconciliation)`);
          } else {
              // Single Mode
              const entry = entryOrEntries;
              
              // Phase 1: Foundation & Persistence
              // If we are editing, we should mark it as edited in metadata
              const payload = editingLog ? {
                  ...entry,
                  metadata: {
                      ...entry.metadata,
                      isEdited: true,
                      lastEditedAt: new Date().toISOString(),
                      editReason: entry.metadata?.editReason
                  }
              } : entry;

              const savedLog = await fuelService.saveFuelEntry(payload);
              
              // Process settlement
              const scenariosData = await fuelService.getFuelScenarios();
              /* 
                 Phase 6: Legacy Auto-Settlement Disabled.
                 Settlement is now handled via the "Finalize" flow in Reconciliation Table.
              */

              if (editingLog) {
                  // Phase 13: Financial Ledger Sync Hardening (Step 13.1)
                  const transactionId = savedLog.transactionId;
                  const existingTx = transactions.find(t => (transactionId && t.id === transactionId) || t.metadata?.sourceId === savedLog.id);
                  
                  if (existingTx) {
                      try {
                          await api.saveTransaction({
                              ...existingTx,
                              // Preserve the sign of the original transaction while updating the magnitude
                              amount: existingTx.amount < 0 ? -Math.abs(savedLog.amount) : Math.abs(savedLog.amount),
                              date: (savedLog.date || entry.date || '').split('T')[0],
                              description: `Fuel: ${savedLog.location || 'Unknown Station'} - ${savedLog.liters}L @ $${(savedLog.amount / (savedLog.liters || 1)).toFixed(3)}/L`,
                              driverId: savedLog.driverId,
                              vehicleId: savedLog.vehicleId,
                              driverName: getDriverName(savedLog.driverId),
                              odometer: savedLog.odometer,
                              quantity: savedLog.liters,
                              metadata: {
                                  ...existingTx.metadata,
                                  isEdited: true,
                                  lastEditedAt: new Date().toISOString(),
                                  editReason: entry.metadata?.editReason,
                                  syncSource: 'fuel_log',
                                  odometer: savedLog.odometer,
                                  fuelVolume: savedLog.liters
                              }
                          });
                      } catch (e) {
                          console.error("Failed to sync changes to associated financial transaction", e);
                      }
                  }
                  
                  setLogs(prev => prev.map(l => l.id === savedLog.id ? savedLog : l));
                  toast.success("Transaction updated & financial ledger synced");
              } else {
                  setLogs(prev => [savedLog, ...prev]);
                  toast.success("Transaction recorded (Pending Reconciliation)");
              }
          }
          setIsLogModalOpen(false);
          setEditingLog(null);
          loadData(true); // Full reload to refresh ledger balances
      } catch (e) {
          console.error(e);
          toast.error(e instanceof Error ? e.message : "Failed to save transaction(s)");
      } finally {
          setIsSyncing(false);
      }
  };

  const handleDeleteLog = useCallback(async (id: string) => {
      setDeleteLogConfirmationId(id);
      setCascadeDelete(true);
  }, []);

  const handleVerifyLog = async (id: string) => {
      // Optimistic UI Update (Phase 3: Fuel Management & Odometer Audit Core)
      const originalLogs = [...logs];
      const entry = logs.find(l => l.id === id);
      
      if (!entry) return;

      const updatedEntry = {
          ...entry,
          metadata: {
              ...entry.metadata,
              isVerified: true,
              verifiedAt: new Date().toISOString()
          }
      };

      setLogs(prev => prev.map(l => l.id === id ? updatedEntry : l));

      try {
          await fuelService.saveFuelEntry(updatedEntry);
          toast.success("Log verified successfully");
          
          // Trigger integrity recalculation
          const promise = api.runFuelBackfill();
          toast.promise(promise, {
              loading: 'Recalculating fleet integrity...',
              success: 'Audit trail updated',
              error: 'Background sync failed'
          });
      } catch (e) {
          console.error("Verify Log Error:", e);
          setLogs(originalLogs); // Rollback
          toast.error("Failed to verify log. Reverting changes.");
      }
  };

  // Reimbursement Handlers
  const handleApproveReimbursement = useCallback(async (id: string, notes?: string) => {
      try {
          const updated = await api.approveExpense(id, notes);
          setTransactions(prev => prev.map(t => t.id === id ? updated : t));
          
          // Phase 3: Automated Financial Settlement
          // If it was a fuel reimbursement, trigger the credit settlement
          if (updated.category === 'Fuel' || updated.category === 'Fuel Reimbursement') {
              const scenariosData = await fuelService.getFuelScenarios();
              /* 
                 Phase 6: Legacy Auto-Settlement Disabled.
              */
              toast.success("Reimbursement Approved (Pending Reconciliation)");
          } else {
              toast.success("Reimbursement Approved");
          }
      } catch (e) {
          console.error(e);
          toast.error("Failed to approve reimbursement");
      }
  }, []);

  const handleRejectReimbursement = useCallback(async (id: string, reason?: string) => {
      try {
          const updated = await api.rejectExpense(id, reason);
          setTransactions(prev => prev.map(t => t.id === id ? updated : t));
          toast.success("Reimbursement Rejected");
      } catch (e) {
          console.error(e);
          toast.error("Failed to reject reimbursement");
      }
  }, []);

    const handleSaveExpense = async (transactionData: any, shouldRefresh = true) => {
        setIsSyncing(true);
        try {
            const savedTx = await api.saveTransaction(transactionData);
            
            // If admin saves as 'Approved' immediately, process settlement
            if (savedTx.status === 'Approved' && (savedTx.category === 'Fuel' || savedTx.category === 'Fuel Reimbursement')) {
                const scenariosData = await fuelService.getFuelScenarios();
                 /* 
                 Phase 6: Legacy Auto-Settlement Disabled.
                 */
            }

            if (editingExpense) {
                // Safeguard: if payment source changed away from driver_cash on an approved transaction,
                // delete the orphaned wallet credit that was created during original approval
                const oldPaymentSource = editingExpense.metadata?.paymentSource;
                const newPaymentSource = savedTx.metadata?.paymentSource || savedTx.metadata?.previousPaymentSource;
                const actualNewSource = savedTx.metadata?.paymentSource;
                if (
                    editingExpense.status === 'Approved' &&
                    oldPaymentSource === 'driver_cash' &&
                    actualNewSource && actualNewSource !== 'driver_cash'
                ) {
                    try {
                        const creditId = `fuel-credit-${savedTx.id}`;
                        await api.deleteTransaction(creditId);
                        console.log(`[handleSaveExpense] Deleted orphaned wallet credit ${creditId} — payment source changed from driver_cash to ${actualNewSource}`);
                    } catch (creditErr: any) {
                        // Credit may not exist — that's OK, log and continue
                        console.warn(`[handleSaveExpense] Could not delete wallet credit fuel-credit-${savedTx.id}:`, creditErr?.message || creditErr);
                    }
                }

                // ... logic to sync with logs ...
                if (savedTx.category === 'Fuel' || savedTx.category === 'Fuel Reimbursement') {
                    const linkedLog = logs.find(l => l.transactionId === savedTx.id || l.id === savedTx.metadata?.sourceId);
                    if (linkedLog) {
                        try {
                            const updatedLog = {
                                ...linkedLog,
                                amount: Math.abs(savedTx.amount),
                                date: savedTx.date.includes('T') ? savedTx.date : `${savedTx.date}T${savedTx.time || '12:00:00'}`,
                                location: savedTx.vendor || savedTx.merchant || linkedLog.location,
                                vendor: savedTx.vendor || savedTx.merchant || linkedLog.vendor,
                                matchedStationId: savedTx.matchedStationId || savedTx.metadata?.matchedStationId || linkedLog.matchedStationId,
                                driverId: savedTx.driverId || linkedLog.driverId,
                                vehicleId: savedTx.vehicleId || linkedLog.vehicleId,
                                odometer: savedTx.odometer || linkedLog.odometer,
                                liters: savedTx.quantity || linkedLog.liters,
                                metadata: {
                                    ...linkedLog.metadata,
                                    isEdited: true,
                                    lastEditedAt: new Date().toISOString(),
                                    syncSource: 'financial_transaction',
                                    editReason: 'Financial record reconciliation sync'
                                }
                            };
                            
                            if (updatedLog.liters && updatedLog.liters > 0) {
                                updatedLog.pricePerLiter = Number((updatedLog.amount / updatedLog.liters).toFixed(3));
                                if (updatedLog.metadata) updatedLog.metadata.pricePerLiter = updatedLog.pricePerLiter;
                            }

                            await fuelService.saveFuelEntry(updatedLog);
                            setLogs(prev => prev.map(l => l.id === updatedLog.id ? updatedLog : l));
                        } catch (e) {
                            console.error("Failed to sync changes back to fuel log", e);
                        }
                    }
                }
                setTransactions(prev => prev.map(t => t.id === savedTx.id ? savedTx : t));
                toast.success("Expense updated and linked fuel records synced");
            } else {
                setTransactions(prev => [savedTx, ...prev]);
                // We don't toast here if it's bulk, the modal will toast at the end
            }
            
            if (shouldRefresh) {
                await loadData(true);
            }
        } catch (e) {
            console.error(e);
            throw e; // Let the modal catch it
        } finally {
            setIsSyncing(false);
        }
    };

  const handleEditExpense = useCallback((tx: FinancialTransaction) => {
      setEditingExpense(tx);
      setIsSubmitExpenseModalOpen(true);
  }, []);

  const confirmDeleteLog = async () => {
      if (!deleteLogConfirmationId) return;
      
      const logEntry = logs.find(l => l.id === deleteLogConfirmationId);
      if (!logEntry) {
        setDeleteLogConfirmationId(null);
        return;
      }

      setIsSyncing(true);
      try {
          // 1. Discover all related records (Step 1.3/2.1)
          const cleanupMap = await fuelService.getCleanupMap(deleteLogConfirmationId);
          const transactionsToDelete = cleanupMap.relatedTransactions;
          
          // 2. Perform Atomic Deletion Sequence (Step 2.2)
          // Always delete the primary fuel log first
          await fuelService.deleteFuelEntry(deleteLogConfirmationId);
          
          let deletedTxCount = 0;
          if (cascadeDelete && transactionsToDelete.length > 0) {
              // Delete all discovered financial records (Debit + Credit/Settlement)
              const deletePromises = transactionsToDelete.map(tx => api.deleteTransaction(tx.id));
              await Promise.all(deletePromises);
              deletedTxCount = transactionsToDelete.length;
          }

          // 3. Update Local State
          setLogs(prev => prev.filter(l => l.id !== deleteLogConfirmationId));
          if (cascadeDelete && transactionsToDelete.length > 0) {
              const txIdsToDelete = transactionsToDelete.map(tx => tx.id);
              setTransactions(prev => prev.filter(t => !txIdsToDelete.includes(t.id)));
          }
          
          // 4. Detailed UI Feedback (Step 2.3)
          const detailsText = ` (${logEntry.liters}L, $${logEntry.amount.toFixed(2)})`;
          const successMessage = cascadeDelete && deletedTxCount > 0
              ? `Fuel log and ${deletedTxCount} associated ledger records purged successfully.`
              : `Fuel log entry deleted successfully.`;
          
          toast.success(successMessage, {
              description: cascadeDelete && deletedTxCount > 0 
                  ? "The system has performed a total recall to prevent ledger imbalances."
                  : "Only the fuel log was removed. Financial records may still exist.",
              duration: 5000
          });

      } catch (e) {
          console.error("[FuelManagement] Deletion failure:", e);
          toast.error("Critical failure during atomic deletion. Some records may remain.");
      } finally {
          setIsSyncing(false);
          setDeleteLogConfirmationId(null);
      }
  };

  const handleDeleteExpense = useCallback((id: string) => {
      setDeleteConfirmationId(id);
      setCascadeDelete(true);
  }, []);

  const confirmDeleteExpense = async () => {
      if (!deleteConfirmationId) return;
      
      const txToDelete = transactions.find(t => t.id === deleteConfirmationId);
      if (!txToDelete) {
          setDeleteConfirmationId(null);
          return;
      }

      setIsSyncing(true);
      try {
          // 1. Bi-Directional Discovery (Step 3.1)
          // Find the parent fuel entry that likely spawned this transaction
          const parentEntry = await settlementService.getParentFuelEntry(txToDelete);
          
          let recordsToPurge: { entryId?: string, transactionIds: string[] } = {
              transactionIds: [deleteConfirmationId]
          };

          if (parentEntry && cascadeDelete) {
              // If we found a parent, we do a "Total Recall" of all its children
              const relatedTxs = await settlementService.getRelatedTransactions(parentEntry);
              recordsToPurge = {
                  entryId: parentEntry.id,
                  transactionIds: Array.from(new Set([...relatedTxs.map(t => t.id), deleteConfirmationId]))
              };
          }

          // 2. Atomic Purge Sequence (Step 3.2)
          if (recordsToPurge.entryId) {
              await fuelService.deleteFuelEntry(recordsToPurge.entryId);
          }
          
          const deletePromises = recordsToPurge.transactionIds.map(id => api.deleteTransaction(id));
          await Promise.all(deletePromises);

          // 3. Sync State
          if (recordsToPurge.entryId) {
              setLogs(prev => prev.filter(l => l.id !== recordsToPurge.entryId));
          }
          setTransactions(prev => prev.filter(t => !recordsToPurge.transactionIds.includes(t.id)));

          // 4. Recovery Context Feedback
          const detailsText = ` ($${Math.abs(txToDelete.amount).toFixed(2)})`;
          const count = recordsToPurge.transactionIds.length;
          
          toast.success(
            recordsToPurge.entryId && cascadeDelete 
              ? `Ledger records and linked fuel log purged${detailsText}` 
              : `Expense removed${detailsText}`,
            {
              description: recordsToPurge.entryId && cascadeDelete
                ? `Total of ${count} ledger records removed to prevent duplicate re-entry flags.`
                : "The individual record has been removed.",
              duration: 5000
            }
          );
      } catch (e) {
          console.error("[FuelManagement] Expense purge failure:", e);
          toast.error("Critical failure during ledger cleanup.");
      } finally {
          setIsSyncing(false);
          setDeleteConfirmationId(null);
      }
  };


  const handleSaveAdjustment = async (adj: MileageAdjustment) => {
      try {
          const savedAdj = await fuelService.saveMileageAdjustment(adj);
          setAdjustments(prev => [...prev, savedAdj]);
          toast.success("Adjustment added");
          setIsAdjustmentModalOpen(false);
      } catch (e) {
          console.error(e);
          toast.error("Failed to save adjustment");
      }
  };

  const handleDisputeUpdated = (updated: FuelDispute) => {
      setDisputes(prev => prev.map(d => d.id === updated.id ? updated : d));
  };

  const handleCreateAdjustmentFromDispute = () => {
      if (!selectedDispute) return;
      setAdjustmentDefaults({
          vehicleId: selectedDispute.vehicleId,
          date: new Date(selectedDispute.weekStart)
      });
      setIsResolutionModalOpen(false);
      setIsAdjustmentModalOpen(true);
  };

  // Helper Lookups
  const getVehicleName = useCallback((id?: string) => {
      if (!id) return '';
      const v = vehicles.find(v => v.id === id);
      return v ? `${v.licensePlate} (${v.model})` : 'Unknown Vehicle';
  }, [vehicles]);

  const getDriverName = useCallback((id?: string) => {
      if (!id) return '';
      // Step 9.2: Correct Driver Lookup Utility - Search by both id and driverId for legacy/mismatch compatibility
      const d = drivers.find(d => d.id === id || d.driverId === id);
      return d ? d.name : 'Unknown Driver';
  }, [drivers]);

  // Phase 7: Shared Anchor Logic
  const { validAnchorIds, getLinkedTransaction } = useFuelAnchors(logs, transactions);

  const isManualEntry = (entry: FuelEntry) => {
      if (validAnchorIds.has(entry.id)) return false;
      const tx = getLinkedTransaction(entry);
      const isManualType = entry.type === 'Manual_Entry' || entry.type === 'Fuel_Manual_Entry';
      const hasManualPortalType = entry.metadata?.portal_type === 'Manual_Entry' || tx?.metadata?.portal_type === 'Manual_Entry';
      const hasManualSource = entry.metadata?.source?.toLowerCase().includes('manual') || 
                             entry.metadata?.source?.toLowerCase().includes('fuel log') ||
                             tx?.metadata?.source?.toLowerCase().includes('manual') ||
                             tx?.metadata?.source?.toLowerCase().includes('fuel log');
      return isManualType || hasManualPortalType || hasManualSource;
  };

  // Phase 4: Decoupled Summary Stats (Step 4.2)
  const statsScopeLogs = logs.filter(log => {
    if (!logDateRange?.from && !logDateRange?.to) return true;
    
    let entryDate: Date;
    if (log.date.includes('-') && log.date.length === 10) {
        const [y, m, d] = log.date.split('-').map(Number);
        entryDate = new Date(y, m - 1, d);
    } else {
        entryDate = new Date(log.date);
    }
    entryDate.setHours(0, 0, 0, 0);

    if (logDateRange.from) {
        const fromDate = new Date(logDateRange.from);
        fromDate.setHours(0, 0, 0, 0);
        if (entryDate < fromDate) return false;
    }
    if (logDateRange.to) {
        const toDate = new Date(logDateRange.to);
        toDate.setHours(0, 0, 0, 0);
        if (entryDate > toDate) return false;
    }
    return true;
  });

  const totalSpend = statsScopeLogs.reduce((sum, log) => sum + log.amount, 0);

  const anchorTotalSpent = statsScopeLogs
    .filter(log => validAnchorIds.has(log.id))
    .reduce((sum, log) => sum + log.amount, 0);

  const pendingAuditSpend = statsScopeLogs
    .filter(log => isManualEntry(log))
    .reduce((sum, log) => sum + log.amount, 0);

  const handleFinalize = async (reports: WeeklyFuelReport[]) => {
      try {
          setIsRefreshing(true);
          
          // Phase 5: Connect to Settlement Engine
          let successCount = 0;
          for (const report of reports) {
              // Filter entries for this report period and vehicle
              const rStart = report.weekStart.split('T')[0];
              const rEnd = report.weekEnd.split('T')[0];
              const relevantEntries = logs.filter(entry => 
                  entry.vehicleId === report.vehicleId && 
                  entry.date >= rStart && 
                  entry.date <= rEnd &&
                  entry.reconciliationStatus === 'Pending' // Only process pending items
              );
              
              if (relevantEntries.length > 0) {
                  await settlementService.commitWeeklyStatement(report, relevantEntries);
                  successCount++;
              }
          }
          
          // Build frozen snapshots for the Finalized tab
          const snapshots = reports.map(report => {
            const vehicle = vehicles.find((v: any) => v.id === report.vehicleId);
            const driver = drivers.find((d: any) => d.id === report.driverId);
            const rStart = report.weekStart.split('T')[0];
            const rEnd = report.weekEnd.split('T')[0];
            const driverSpend = logs
              .filter((e: any) =>
                e.vehicleId === report.vehicleId &&
                e.date >= rStart && e.date <= rEnd &&
                (e.type === 'Reimbursement' || e.type === 'Manual_Entry' || e.type === 'Fuel_Manual_Entry')
              )
              .reduce((sum: number, e: any) => sum + e.amount, 0);
            return {
              ...report,
              status: 'Finalized',
              finalizedAt: new Date().toISOString(),
              finalizedByUser: 'admin',
              driverSpend,
              netPay: driverSpend - report.driverShare,
              vehiclePlate: vehicle?.licensePlate || 'Unknown',
              vehicleModel: vehicle?.model || '',
              driverName: driver?.name || 'Unknown',
            };
          });

          // Persist snapshots to server (non-blocking — settlement is already committed)
          try {
            await api.saveFinalizedReports(snapshots);
          } catch (snapErr: any) {
            console.error('[FinalizedReports] Snapshot save failed:', snapErr);
            toast.warning('Statements finalized but snapshot save failed — finalized tab may be incomplete.');
          }

          if (successCount > 0) {
              toast.success(`Successfully finalized ${successCount} statements and posted to ledger.`);
          } else {
              toast.info("No pending items found to finalize.");
          }

          await loadData(true); // Reload everything
      } catch (e: any) {
          console.error(e);
          toast.error(`Finalization failed: ${e.message}`);
      } finally {
          setIsRefreshing(false);
      }
  };

  // Determine Page Title and Description based on activeTab
  let pageTitle = "Fleet Integrity Management";
  let pageDescription = "Audit fleet integrity, reconcile fuel consumption, and manage gas cards.";

  if (activeTab === 'dashboard') {
      pageTitle = "Fleet Integrity Overview";
      pageDescription = "Track consumption, reconcile expenses, and manage gas cards.";
  } else if (activeTab === 'integrity-gap') {
      pageTitle = "Evidence Bridge Analytics";
      pageDescription = "Forensic analysis of spatial accuracy, cryptographic binding, and systemic drift.";
  } else if (activeTab === 'reconciliation') {
      pageTitle = "Consumption Reconciliation";
      pageDescription = "Compare actual gas card charges against estimated operating costs.";
  } else if (activeTab === 'reimbursements') {
      pageTitle = "Reimbursement Queue";
      pageDescription = "Review and approve driver reimbursement requests.";
  } else if (activeTab === 'cards') {
      pageTitle = "Card Inventory";
      pageDescription = "Manage gas cards and their assignments.";
  } else if (activeTab === 'logs') {
      pageTitle = "Transaction Logs";
      pageDescription = "History of all fuel purchases and manual entries.";
  } else if (activeTab === 'reports') {
      pageTitle = "Consumption Reports";
      pageDescription = "View and export detailed fuel consumption reports.";
  } else if (activeTab === 'configuration') {
      pageTitle = "Fleet Policy Configuration";
      pageDescription = "Manage company and driver expense splits for fuel.";
  } else if (activeTab === 'audit') {
      pageTitle = "Fleet Integrity Audit";
      pageDescription = "Audit fleet integrity using Stop-to-Stop odometer verification and behavioral anomaly detection.";
  }

  return (
    <FuelLayout 
        title={pageTitle}
        description={pageDescription}
        onAddTransaction={(activeTab === 'configuration' || activeTab === 'cards' || activeTab === 'reconciliation') ? undefined : () => {
            setEditingLog(null);
            setIsLogModalOpen(true);
        }}
    >
      {(activeTab !== 'configuration' && activeTab !== 'cards') && (
        <div className="flex justify-end items-center gap-3 mb-4">
            {isSyncing && (
                <div className="flex items-center gap-2 text-xs font-bold text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-100 animate-pulse">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    SYNCING CROSS-DOMAIN...
                </div>
            )}
            <Button 
                variant="outline" 
                size="sm" 
                onClick={() => loadData()} 
                disabled={isRefreshing}
                className="text-slate-600 border-slate-200"
            >
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Refreshing...' : 'Refresh Data'}
            </Button>
        </div>
      )}

      {activeTab === 'dashboard' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card>
                <CardContent className="p-6 flex items-center gap-4">
                    <div className="p-3 bg-blue-100 text-blue-600 rounded-full">
                        <Fuel className="h-6 w-6" />
                    </div>
                    <div>
                        <p className="text-sm text-slate-500 font-medium">Total Spend</p>
                        <h3 className="text-2xl font-bold text-slate-900">${totalSpend.toFixed(2)}</h3>
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="p-6 flex items-center gap-4">
                    <div className="p-3 bg-emerald-100 text-emerald-600 rounded-full">
                        <ShieldCheck className="h-6 w-6" />
                    </div>
                    <div>
                        <p className="text-sm text-slate-500 font-medium">Verified Anchors</p>
                        <h3 className="text-2xl font-bold text-slate-900">${anchorTotalSpent.toFixed(2)}</h3>
                    </div>
                </CardContent>
            </Card>
             <Card>
                <CardContent className="p-6 flex items-center gap-4">
                    <div className="p-3 bg-orange-100 text-orange-600 rounded-full">
                        <AlertTriangle className="h-6 w-6" />
                    </div>
                    <div>
                        <p className="text-sm text-slate-500 font-medium">Pending Audit</p>
                        <h3 className="text-2xl font-bold text-slate-900">${pendingAuditSpend.toFixed(2)}</h3>
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="p-6 flex items-center gap-4">
                    <div className="p-3 bg-indigo-100 text-indigo-600 rounded-full">
                        <CreditCard className="h-6 w-6" />
                    </div>
                    <div>
                        <p className="text-sm text-slate-500 font-medium">Active Cards</p>
                        <h3 className="text-2xl font-bold text-slate-900">{cards.filter(c => c.status === 'Active').length}</h3>
                    </div>
                </CardContent>
            </Card>
        </div>
      )}

      {activeTab === 'reimbursements' && (
          <FuelReimbursementTable 
              transactions={transactions}
              logs={logs}
              onApprove={handleApproveReimbursement}
              onReject={handleRejectReimbursement}
              onRequestSubmit={() => { setEditingExpense(null); setIsSubmitExpenseModalOpen(true); }}
              onEdit={handleEditExpense}
              onDelete={handleDeleteExpense}
              onViewDriverLedger={onViewDriverLedger}
              dateRange={reimbursementDateRange}
              onDateRangeChange={setReimbursementDateRange}
              isRefreshing={isRefreshing}
              onRefresh={() => loadData(true)}
          />
      )}

      {activeTab === 'audit' && (
          <FuelAuditDashboard />
      )}

      {activeTab === 'integrity-gap' && (
          <IntegrityGapDashboard />
      )}

      {activeTab === 'reconciliation' && (
        <Tabs defaultValue="auto-generated" className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
            <TabsList className="flex-wrap">
              <TabsTrigger value="auto-generated">
                <span className="hidden sm:inline">Standard Fleet Rule</span>
                <span className="sm:hidden">Fleet Rule</span>
              </TabsTrigger>
              <TabsTrigger value="finalized" className="gap-1.5">
                Finalized
                {finalizedCount > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1.5 text-xs">
                    {finalizedCount}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-2">
              <DatePickerWithRange date={reconciliationDateRange} setDate={setReconciliationDateRange} />
            </div>
          </div>

          <TabsContent value="auto-generated" className="space-y-4">
            <ReconciliationTable  
                vehicles={vehicles}
                trips={trips}
                fuelEntries={logs}
                adjustments={adjustments}
                disputes={disputes}
                dateRange={reconciliationDateRange}
                scenarios={scenarios}
                drivers={drivers}
                onFinalize={handleFinalize}
                onAddAdjustment={() => { setAdjustmentDefaults({}); setIsAdjustmentModalOpen(true); }}
                onResolveDispute={(dispute) => { setSelectedDispute(dispute); setIsResolutionModalOpen(true); }}
                onViewBuckets={(vehicle) => { setSelectedBucketVehicle(vehicle); setIsBucketSheetOpen(true); }}
            />
          </TabsContent>

          <TabsContent value="finalized">
            <FinalizedReportsTab />
          </TabsContent>
        </Tabs>
      )}

      {activeTab === 'cards' && (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <div className="space-y-1">
                </div>
                <Button onClick={() => { setEditingCard(null); setIsCardModalOpen(true); }}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Card
                </Button>
            </div>
            
            <FuelCardList 
                cards={cards}
                drivers={drivers}
                onEdit={(card) => { setEditingCard(card); setIsCardModalOpen(true); }}
                onDelete={handleDeleteCard}
                getVehicleName={getVehicleName}
                getDriverName={getDriverName}
            />
        </div>
      )}

      {activeTab === 'logs' && (
        <div className="space-y-4">
            <FuelLogTable 
                entries={logs}
                transactions={transactions}
                vehicles={vehicles}
                onEdit={(log) => { setEditingLog(log); setIsLogModalOpen(true); }}
                onDelete={handleDeleteLog}
                onVerifyLog={handleVerifyLog}
                getVehicleName={getVehicleName}
                getDriverName={getDriverName}
                dateRange={logDateRange}
                onDateRangeChange={setLogDateRange}
            />
        </div>
      )}



      {activeTab === 'reports' && (
          <ReportsPage entries={logs} vehicles={vehicles} drivers={drivers} isRefreshing={isRefreshing} />
      )}

      {activeTab === 'configuration' && (
          <FuelConfiguration />
      )}

      {/* Modals - Conditionally rendered to prevent mount-time effect cascades */}
      {isCardModalOpen && (
      <FuelCardModal 
            isOpen={isCardModalOpen}
            onClose={() => { setIsCardModalOpen(false); setEditingCard(null); }}
            onSave={handleSaveCard}
            initialData={editingCard}
            vehicles={vehicles}
            drivers={drivers}
      />
      )}

      {isLogModalOpen && (
      <FuelLogModal 
            isOpen={isLogModalOpen}
            onClose={() => { setIsLogModalOpen(false); setEditingLog(null); }}
            onSave={handleSaveLog}
            initialData={editingLog}
            vehicles={vehicles}
            drivers={drivers}
            cards={cards}
      />
      )}


      {isAdjustmentModalOpen && (
      <MileageAdjustmentModal 
            isOpen={isAdjustmentModalOpen}
            onClose={() => setIsAdjustmentModalOpen(false)}
            onSave={handleSaveAdjustment}
            vehicles={vehicles}
            initialVehicleId={adjustmentDefaults.vehicleId}
            initialDate={adjustmentDefaults.date}
      />
      )}

      {isResolutionModalOpen && (
      <DisputeResolutionModal 
            isOpen={isResolutionModalOpen}
            onClose={() => { setIsResolutionModalOpen(false); setSelectedDispute(null); }}
            dispute={selectedDispute}
            onSave={handleDisputeUpdated}
            onCreateAdjustment={handleCreateAdjustmentFromDispute}
      />
      )}

      {isSubmitExpenseModalOpen && (
      <SubmitExpenseModal 
            isOpen={isSubmitExpenseModalOpen}
            onClose={() => { setIsSubmitExpenseModalOpen(false); setEditingExpense(null); }}
            onSave={handleSaveExpense}
            drivers={drivers}
            vehicles={vehicles}
            initialData={editingExpense}
      />
      )}

      <AlertDialog open={!!deleteConfirmationId} onOpenChange={(open) => !open && setDeleteConfirmationId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Reimbursement Request?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>This action cannot be undone. This will permanently delete the expense record from the financial ledger.</p>
                
                {logs.some(l => l.transactionId === deleteConfirmationId) && (
                  <div className="flex items-start space-x-3 p-3 bg-amber-50 border border-amber-100 rounded-lg mt-2">
                    <Checkbox 
                      id="cascade-log" 
                      checked={cascadeDelete} 
                      onCheckedChange={(checked) => setCascadeDelete(!!checked)}
                      className="mt-1"
                    />
                    <div className="grid gap-1.5 leading-none">
                      <Label htmlFor="cascade-log" className="text-sm font-bold text-amber-900 cursor-pointer">
                        Delete linked fuel log entry as well
                      </Label>
                      <p className="text-xs text-amber-700">
                        If checked, the physical fuel consumption record used for mileage auditing will also be removed.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteExpense} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteLogConfirmationId} onOpenChange={(open) => !open && setDeleteLogConfirmationId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Fuel Log Entry?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>This will remove the fuel consumption record from the audit timeline. This may affect "Stop-to-Stop" calculations for this vehicle.</p>
                
                {logs.find(l => l.id === deleteLogConfirmationId)?.transactionId && (
                  <div className="flex items-start space-x-3 p-3 bg-amber-50 border border-amber-100 rounded-lg mt-2">
                    <Checkbox 
                      id="cascade-expense" 
                      checked={cascadeDelete} 
                      onCheckedChange={(checked) => setCascadeDelete(!!checked)}
                      className="mt-1"
                    />
                    <div className="grid gap-1.5 leading-none">
                      <Label htmlFor="cascade-expense" className="text-sm font-bold text-amber-900 cursor-pointer">
                        Void linked reimbursement request
                      </Label>
                      <p className="text-xs text-amber-700">
                        If checked, the pending payment request in the "Reimbursements" tab will also be deleted.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteLog} className="bg-red-600 hover:bg-red-700">
              Delete Entry
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Phase 3: Odometer Bucket Sheet */}
      <Sheet open={isBucketSheetOpen} onOpenChange={setIsBucketSheetOpen}>
        <SheetContent className="sm:max-w-[900px] overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-blue-600" />
              Stop-to-Stop Reconciliation
            </SheetTitle>
            <SheetDescription>
              Detailed odometer-anchored analysis for {selectedBucketVehicle?.licensePlate} ({selectedBucketVehicle?.model})
            </SheetDescription>
          </SheetHeader>
          
          {selectedBucketVehicle && (
            <BucketReconciliationView 
              vehicle={selectedBucketVehicle}
              fuelEntries={logs}
              trips={trips}
              transactions={transactions}
              adjustments={adjustments}
              dateRange={reconciliationDateRange}
              onClose={() => setIsBucketSheetOpen(false)}
              onRefresh={() => loadData(true)}
            />
          )}
        </SheetContent>
      </Sheet>

    </FuelLayout>
  );
}