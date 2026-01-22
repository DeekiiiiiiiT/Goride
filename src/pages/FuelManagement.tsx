import React, { useState, useEffect } from 'react';
import { FuelLayout } from '../components/fuel/FuelLayout';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Fuel, Plus, CreditCard, Banknote, Upload, RefreshCw, History, Loader2, Link2 } from 'lucide-react';
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
import { FuelIntegrityAuditTool } from '../components/fuel/FuelIntegrityAuditTool';
import { FuelCard, FuelEntry, MileageAdjustment, FuelDispute, FuelScenario } from '../types/fuel';
import { Vehicle } from '../types/vehicle';
import { Trip, FinancialTransaction } from '../types/data';
import { api } from '../services/api';
import { fuelService } from '../services/fuelService';
import { settlementService } from '../services/settlementService';
import { FuelDisputeService } from '../services/fuelDisputeService';
import { toast } from "sonner@2.0.3";
import { startOfWeek, endOfWeek } from "date-fns";
import { DateRange } from "react-day-picker";
import { Checkbox } from "../components/ui/checkbox";
import { Label } from "../components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";

export function FuelManagement({ defaultTab = 'dashboard', onViewDriverLedger, onTabChange }: { 
    defaultTab?: string, 
    onViewDriverLedger?: (driverId: string) => void,
    onTabChange?: (tab: string) => void
}) {
  const [activeTab, setActiveTab] = useState(defaultTab);

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  // Date Range State (Default: Current Week)
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
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

  // Effect to reload trips when Date Range changes
  useEffect(() => {
    const fetchTripsForRange = async () => {
        if (!dateRange?.from) return;
        try {
            // Using getTripsFiltered is more efficient and accurate for reconciliation than raw getTrips
            const response = await api.getTripsFiltered({
                startDate: dateRange.from.toISOString(),
                endDate: dateRange.to?.toISOString() || new Date().toISOString(),
                limit: 1500 // Cap at 1500 to prevent browser lag, but cover the week
            });
            setTrips(response.data || []);
        } catch (e) {
            console.error("Failed to fetch trips for range", e);
            // Don't toast error here to avoid spamming on mount if it fails silently
        }
    };
    fetchTripsForRange();
  }, [dateRange]);

  const loadData = async (silent = false) => {
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

          if (!silent) toast.success("Data refreshed");
      } catch (e) {
          console.error("Failed to load fuel management data", e);
          toast.error("Failed to load initial data");
      } finally {
          setIsRefreshing(false);
      }
  };

  useEffect(() => {
    loadData(true);
  }, []);

  // Card Handlers
  const handleSaveCard = async (card: FuelCard) => {
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
  };

  const handleDeleteCard = async (id: string) => {
      try {
          await fuelService.deleteFuelCard(id);
          setCards(prev => prev.filter(c => c.id !== id));
          toast.success("Fuel card deleted");
      } catch (e) {
          console.error(e);
          toast.error("Failed to delete fuel card");
      }
  };

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
              for (const log of savedLogs) {
                  await settlementService.processFuelSettlement(log, scenariosData);
              }
              
              setLogs(prev => [...savedLogs, ...prev]);
              toast.success(`Successfully recorded ${savedLogs.length} transactions and processed settlements`);
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
              await settlementService.processFuelSettlement(savedLog, scenariosData);

              if (editingLog) {
                  // Also update the associated transaction in the ledger if it exists (Phase 3: Sync)
                  if (savedLog.transactionId) {
                      try {
                          const existingTx = transactions.find(t => t.id === savedLog.transactionId);
                          if (existingTx) {
                              await api.saveTransaction({
                                  ...existingTx,
                                  amount: savedLog.amount,
                                  date: savedLog.date,
                                  description: `Fuel: ${savedLog.location || 'Unknown Station'} - ${savedLog.liters}L @ $${(savedLog.amount / (savedLog.liters || 1)).toFixed(3)}/L`,
                                  metadata: {
                                      ...existingTx.metadata,
                                      isEdited: true,
                                      lastEditedAt: new Date().toISOString(),
                                      editReason: entry.metadata?.editReason,
                                      syncSource: 'fuel_log'
                                  }
                              });
                          }
                      } catch (e) {
                          console.error("Failed to sync changes to associated financial transaction", e);
                      }
                  }
                  
                  setLogs(prev => prev.map(l => l.id === savedLog.id ? savedLog : l));
                  toast.success("Transaction updated & financial ledger synced");
              } else {
                  setLogs(prev => [savedLog, ...prev]);
                  toast.success("Transaction recorded & ledger credit posted");
              }
          }
          setIsLogModalOpen(false);
          setEditingLog(null);
          loadData(true); // Full reload to refresh ledger balances
      } catch (e) {
          console.error(e);
          toast.error("Failed to save transaction(s)");
      } finally {
          setIsSyncing(false);
      }
  };

  const handleDeleteLog = async (id: string) => {
      setDeleteLogConfirmationId(id);
      setCascadeDelete(true);
  };

  // Reimbursement Handlers
  const handleApproveReimbursement = async (id: string, notes?: string) => {
      try {
          const updated = await api.approveExpense(id, notes);
          setTransactions(prev => prev.map(t => t.id === id ? updated : t));
          
          // Phase 3: Automated Financial Settlement
          // If it was a fuel reimbursement, trigger the credit settlement
          if (updated.category === 'Fuel' || updated.category === 'Fuel Reimbursement') {
              const scenariosData = await fuelService.getFuelScenarios();
              await settlementService.processFuelSettlement(updated, scenariosData);
              toast.success("Reimbursement Approved & Ledger Credit Posted");
          } else {
              toast.success("Reimbursement Approved");
          }
      } catch (e) {
          console.error(e);
          toast.error("Failed to approve reimbursement");
      }
  };

  const handleRejectReimbursement = async (id: string, reason?: string) => {
      try {
          const updated = await api.rejectExpense(id, reason);
          setTransactions(prev => prev.map(t => t.id === id ? updated : t));
          toast.success("Reimbursement Rejected");
      } catch (e) {
          console.error(e);
          toast.error("Failed to reject reimbursement");
      }
  };

  const handleSaveExpense = async (transactionData: any) => {
      setIsSyncing(true);
      try {
          const savedTx = await api.saveTransaction(transactionData);
          
          // If admin saves as 'Approved' immediately, process settlement
          if (savedTx.status === 'Approved' && (savedTx.category === 'Fuel' || savedTx.category === 'Fuel Reimbursement')) {
              const scenariosData = await fuelService.getFuelScenarios();
              await settlementService.processFuelSettlement(savedTx, scenariosData);
          }

          if (editingExpense) {
              // Phase 4: Transaction-to-Log Edit Synchronization
              if (savedTx.category === 'Fuel' || savedTx.category === 'Fuel Reimbursement') {
                  const linkedLog = logs.find(l => l.transactionId === savedTx.id || l.id === savedTx.metadata?.sourceId);
                  if (linkedLog) {
                      try {
                          const updatedLog = {
                              ...linkedLog,
                              amount: Math.abs(savedTx.amount),
                              date: savedTx.date.includes('T') ? savedTx.date : `${savedTx.date}T${savedTx.time || '12:00:00'}`,
                              location: savedTx.merchant || linkedLog.location,
                              metadata: {
                                  ...linkedLog.metadata,
                                  isEdited: true,
                                  lastEditedAt: new Date().toISOString(),
                                  syncSource: 'financial_transaction'
                              }
                          };
                          
                          // Maintain mathematical integrity: recalculate price per liter based on new amount
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
              toast.success("Expense recorded and settled");
          }
          setEditingExpense(null);
          loadData(true);
      } catch (e) {
          console.error(e);
          toast.error("Failed to save expense");
      } finally {
          setIsSyncing(false);
      }
  };

  const handleEditExpense = (tx: FinancialTransaction) => {
      setEditingExpense(tx);
      setIsSubmitExpenseModalOpen(true);
  };

  const confirmDeleteLog = async () => {
      if (!deleteLogConfirmationId) return;
      try {
          const logToDelete = logs.find(l => l.id === deleteLogConfirmationId);
          const transactionId = logToDelete?.transactionId;

          // Sequential Cleanup (Phase 2, Step 3)
          await fuelService.deleteFuelEntry(deleteLogConfirmationId);
          
          if (cascadeDelete && transactionId) {
              await api.deleteTransaction(transactionId);
              setTransactions(prev => prev.filter(t => t.id !== transactionId));
          }

          setLogs(prev => prev.filter(l => l.id !== deleteLogConfirmationId));
          toast.success(transactionId && cascadeDelete ? "Log and linked reimbursement deleted" : "Log entry deleted");
      } catch (e) {
          console.error(e);
          toast.error("Failed to delete log entry");
      } finally {
          setDeleteLogConfirmationId(null);
      }
  };

  const handleDeleteExpense = (id: string) => {
      setDeleteConfirmationId(id);
      setCascadeDelete(true);
  };

  const confirmDeleteExpense = async () => {
      if (!deleteConfirmationId) return;
      try {
          // Find if there is a linked fuel log
          const logToCleanup = logs.find(l => l.transactionId === deleteConfirmationId);
          
          await api.deleteTransaction(deleteConfirmationId);
          
          if (cascadeDelete && logToCleanup) {
              await fuelService.deleteFuelEntry(logToCleanup.id);
              setLogs(prev => prev.filter(l => l.id !== logToCleanup.id));
          }

          setTransactions(prev => prev.filter(t => t.id !== deleteConfirmationId));
          toast.success(logToCleanup && cascadeDelete ? "Reimbursement and linked fuel log deleted" : "Expense deleted");
      } catch (e) {
          console.error(e);
          toast.error("Failed to delete expense");
      } finally {
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

  const handleSyncRecords = async (log: FuelEntry, tx: FinancialTransaction, source: 'log' | 'tx') => {
      setIsSyncing(true);
      try {
          if (source === 'log') {
              // Update TX to match Log
              await api.saveTransaction({
                  ...tx,
                  amount: -log.amount, // Transactions are negative for expenses
                  date: log.date.split('T')[0],
                  metadata: {
                      ...tx.metadata,
                      isEdited: true,
                      syncSource: 'maintenance_repair'
                  }
              });
              toast.success("Financial ledger updated to match fuel log");
          } else {
              // Update Log to match TX
              const updatedLog = {
                  ...log,
                  amount: Math.abs(tx.amount),
                  date: tx.date.includes('T') ? tx.date : `${tx.date}T${tx.time || '12:00:00'}`,
                  metadata: {
                      ...log.metadata,
                      isEdited: true,
                      syncSource: 'maintenance_repair'
                  }
              };
              
              if (updatedLog.liters > 0) {
                  updatedLog.pricePerLiter = Number((updatedLog.amount / updatedLog.liters).toFixed(3));
              }
              
              await fuelService.saveFuelEntry(updatedLog);
              toast.success("Fuel log updated to match financial ledger");
          }
          await loadData(true);
      } catch (e) {
          console.error(e);
          toast.error("Failed to synchronize records");
      } finally {
          setIsSyncing(false);
      }
  };

  const handleHealLogToTx = async (log: FuelEntry) => {
      setIsSyncing(true);
      try {
          // Create the missing transaction
          const txData = {
              date: log.date.split('T')[0],
              time: log.date.includes('T') ? log.date.split('T')[1]?.split('.')[0] : "12:00:00",
              amount: -log.amount,
              category: "Fuel Reimbursement",
              description: `Fuel at ${log.location || 'Unknown'} (Healed Record)`,
              driverId: log.driverId,
              vehicleId: log.vehicleId,
              status: "Approved",
              type: "Reimbursement",
              metadata: {
                  sourceId: log.id,
                  source: "Maintenance Repair",
                  automated: false
              }
          };
          
          const savedTx = await api.saveTransaction(txData);
          
          // Update the log with the new transactionId
          await fuelService.saveFuelEntry({
              ...log,
              transactionId: savedTx.id
          });

          toast.success("Missing financial record created and linked");
          await loadData(true);
      } catch (e) {
          console.error(e);
          toast.error("Failed to heal record");
      } finally {
          setIsSyncing(false);
      }
  };

  const handleHealTxToLog = async (tx: FinancialTransaction) => {
      setIsSyncing(true);
      try {
          // Create a fuel log based on the transaction
          const logData: any = {
              date: tx.date.includes('T') ? tx.date : `${tx.date}T${tx.time || '12:00:00'}`,
              amount: Math.abs(tx.amount),
              driverId: tx.driverId || drivers[0]?.id,
              vehicleId: tx.vehicleId || vehicles[0]?.id,
              location: tx.merchant || tx.description || "Unknown Station",
              type: "Reimbursement",
              liters: tx.quantity || 0,
              odometer: tx.odometer || 0,
              transactionId: tx.id,
              metadata: {
                  isEdited: true,
                  editReason: "Historical Repair",
                  syncSource: "maintenance_repair"
              }
          };

          if (logData.liters > 0) {
              logData.pricePerLiter = Number((logData.amount / logData.liters).toFixed(3));
          }

          await fuelService.saveFuelEntry(logData);
          toast.success("Missing fuel log entry created and linked");
          await loadData(true);
      } catch (e) {
          console.error(e);
          toast.error("Failed to repair fuel log");
      } finally {
          setIsSyncing(false);
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
  const getVehicleName = (id?: string) => {
      if (!id) return '';
      const v = vehicles.find(v => v.id === id);
      return v ? `${v.licensePlate} (${v.model})` : 'Unknown Vehicle';
  };

  const getDriverName = (id?: string) => {
      if (!id) return '';
      const d = drivers.find(d => d.id === id);
      return d ? d.name : 'Unknown Driver';
  };

  // Calculate Spend
  const weeklySpend = logs.reduce((sum, log) => sum + log.amount, 0);

  const handleFinalize = async (reports: WeeklyFuelReport[]) => {
      try {
          setIsRefreshing(true);
          await fuelService.finalizeReconciliation(reports);
          toast.success(`Successfully finalized ${reports.length} statements and posted to ledger.`);
          await loadData(true); // Reload everything
      } catch (e: any) {
          console.error(e);
          toast.error(`Finalization failed: ${e.message}`);
      } finally {
          setIsRefreshing(false);
      }
  };

  // Determine Page Title and Description based on activeTab
  let pageTitle = "Fuel Management";
  let pageDescription = "Track consumption, reconcile expenses, and manage gas cards.";

  if (activeTab === 'reconciliation') {
      pageTitle = "Fuel Reconciliation";
      pageDescription = "Compare actual gas card charges against estimated operating costs.";
  } else if (activeTab === 'reimbursements') {
      pageTitle = "Reimbursement Queue";
      pageDescription = "Review and approve driver reimbursement requests.";
  } else if (activeTab === 'cards') {
      pageTitle = "Fuel Card Inventory";
      pageDescription = "Manage gas cards and their assignments.";
  } else if (activeTab === 'logs') {
      pageTitle = "Transaction Logs";
      pageDescription = "History of all fuel purchases and manual entries.";
  } else if (activeTab === 'reports') {
      pageTitle = "Fuel Reports";
      pageDescription = "View and export detailed fuel consumption reports.";
  } else if (activeTab === 'maintenance') {
      pageTitle = "System Maintenance";
      pageDescription = "Repair historical data drift and orphaned records.";
  } else if (activeTab === 'configuration') {
      pageTitle = "Fuel Configuration";
      pageDescription = "Manage company and driver expense splits for fuel.";
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
                        <h3 className="text-2xl font-bold text-slate-900">${weeklySpend.toFixed(2)}</h3>
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
             <Card>
                <CardContent className="p-6 flex items-center gap-4">
                    <div className="p-3 bg-orange-100 text-orange-600 rounded-full">
                        <Banknote className="h-6 w-6" />
                    </div>
                    <div>
                        <p className="text-sm text-slate-500 font-medium">Pending Approvals</p>
                        <h3 className="text-2xl font-bold text-slate-900">{transactions.filter(t => t.status === 'Pending' && t.type === 'Reimbursement' && (t.category === 'Fuel' || t.category === 'Fuel Reimbursement')).length}</h3>
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
          />
      )}

      {activeTab === 'audit' && (
          <FuelAuditDashboard />
      )}

      {activeTab === 'reconciliation' && (
        <div className="space-y-4">
             <div className="flex justify-between items-start">
                 <div className="space-y-1">
                </div>
                <div className="flex items-center gap-2">
                    <DatePickerWithRange date={dateRange} setDate={setDateRange} />
                </div>
            </div>
            
            <ReconciliationTable  
                vehicles={vehicles}
                trips={trips}
                fuelEntries={logs}
                adjustments={adjustments}
                disputes={disputes}
                dateRange={dateRange}
                scenarios={scenarios}
                onFinalize={handleFinalize}
                onAddAdjustment={() => { setAdjustmentDefaults({}); setIsAdjustmentModalOpen(true); }}
                onResolveDispute={(dispute) => { setSelectedDispute(dispute); setIsResolutionModalOpen(true); }}
                onViewBuckets={(vehicle) => { setSelectedBucketVehicle(vehicle); setIsBucketSheetOpen(true); }}
            />
        </div>
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
                onEdit={(log) => { setEditingLog(log); setIsLogModalOpen(true); }}
                onDelete={handleDeleteLog}
                getVehicleName={getVehicleName}
                getDriverName={getDriverName}
            />
        </div>
      )}

      {activeTab === 'maintenance' && (
          <FuelIntegrityAuditTool 
              logs={logs}
              transactions={transactions}
              onHealLogToTx={handleHealLogToTx}
              onHealTxToLog={handleHealTxToLog}
              onSyncRecords={handleSyncRecords}
          />
      )}

      {activeTab === 'reports' && (
          <ReportsPage />
      )}

      {activeTab === 'configuration' && (
          <FuelConfiguration />
      )}

      {/* Modals */}
      <FuelCardModal 
            isOpen={isCardModalOpen}
            onClose={() => { setIsCardModalOpen(false); setEditingCard(null); }}
            onSave={handleSaveCard}
            initialData={editingCard}
            vehicles={vehicles}
            drivers={drivers}
      />

      <FuelLogModal 
            isOpen={isLogModalOpen}
            onClose={() => { setIsLogModalOpen(false); setEditingLog(null); }}
            onSave={handleSaveLog}
            initialData={editingLog}
            vehicles={vehicles}
            drivers={drivers}
            cards={cards}
      />


      <MileageAdjustmentModal 
            isOpen={isAdjustmentModalOpen}
            onClose={() => setIsAdjustmentModalOpen(false)}
            onSave={handleSaveAdjustment}
            vehicles={vehicles}
            initialVehicleId={adjustmentDefaults.vehicleId}
            initialDate={adjustmentDefaults.date}
      />

      <DisputeResolutionModal 
            isOpen={isResolutionModalOpen}
            onClose={() => { setIsResolutionModalOpen(false); setSelectedDispute(null); }}
            dispute={selectedDispute}
            onSave={handleDisputeUpdated}
            onCreateAdjustment={handleCreateAdjustmentFromDispute}
      />

      <SubmitExpenseModal 
            isOpen={isSubmitExpenseModalOpen}
            onClose={() => { setIsSubmitExpenseModalOpen(false); setEditingExpense(null); }}
            onSave={handleSaveExpense}
            drivers={drivers}
            vehicles={vehicles}
            initialData={editingExpense}
      />

      <AlertDialog open={!!deleteConfirmationId} onOpenChange={(open) => !open && setDeleteConfirmationId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Reimbursement Request?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
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
            <AlertDialogDescription className="space-y-3">
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
              onClose={() => setIsBucketSheetOpen(false)}
              onRefresh={() => loadData(true)}
            />
          )}
        </SheetContent>
      </Sheet>

    </FuelLayout>
  );
}
