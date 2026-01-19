import React, { useState, useEffect } from 'react';
import { FuelLayout } from '../components/fuel/FuelLayout';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Fuel, Plus, CreditCard, Banknote, Upload, RefreshCw } from 'lucide-react';
import { FuelCardList } from '../components/fuel/FuelCardList';
import { FuelCardModal } from '../components/fuel/FuelCardModal';
import { FuelLogModal } from '../components/fuel/FuelLogModal';
import { FuelLogTable } from '../components/fuel/FuelLogTable';
import { ReportsPage } from '../components/fuel/ReportsPage';
import { FuelConfiguration } from '../components/fuel/FuelConfiguration';
import { ReconciliationTable } from '../components/fuel/ReconciliationTable';
import { DatePickerWithRange } from '../components/ui/date-range-picker';
import { MileageAdjustmentModal } from '../components/fuel/MileageAdjustmentModal';
import { DisputeResolutionModal } from '../components/fuel/DisputeResolutionModal';
import { FuelReimbursementTable } from '../components/fuel/FuelReimbursementTable';
import { SubmitExpenseModal } from '../components/fuel/SubmitExpenseModal';
import { FuelCard, FuelEntry, MileageAdjustment, FuelDispute, FuelScenario } from '../types/fuel';
import { Trip, FinancialTransaction } from '../types/data';
import { api } from '../services/api';
import { fuelService } from '../services/fuelService';
import { FuelDisputeService } from '../services/fuelDisputeService';
import { toast } from "sonner@2.0.3";
import { startOfWeek, endOfWeek } from "date-fns";
import { DateRange } from "react-day-picker";
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

export function FuelManagement({ defaultTab = 'dashboard' }: { defaultTab?: string }) {
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

  // Adjustment State
  const [adjustments, setAdjustments] = useState<MileageAdjustment[]>([]);
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
  const [adjustmentDefaults, setAdjustmentDefaults] = useState<{ vehicleId?: string, date?: Date }>({});

  // Dispute State
  const [disputes, setDisputes] = useState<FuelDispute[]>([]);
  const [selectedDispute, setSelectedDispute] = useState<FuelDispute | null>(null);
  const [isResolutionModalOpen, setIsResolutionModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Assignment Data
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [scenarios, setScenarios] = useState<FuelScenario[]>([]);

  const loadData = async (silent = false) => {
      if (!silent) setIsRefreshing(true);
      try {
          const [vData, dData, tData, cardsData, logsData, adjsData, disputesData, txData, scenariosData] = await Promise.all([
              api.getVehicles().catch(() => []), 
              api.getDrivers().catch(() => []),
              api.getTrips({ limit: 500 }).catch(() => []),
              fuelService.getFuelCards().catch(() => []),
              fuelService.getFuelEntries().catch(() => []),
              fuelService.getMileageAdjustments().catch(() => []),
              FuelDisputeService.getAllDisputes().catch(() => []),
              api.getTransactions().catch(() => []),
              fuelService.getFuelScenarios().catch(() => [])
          ]);
          
          setVehicles(vData);
          setDrivers(dData);
          setTrips(tData);
          setCards(cardsData);
          setLogs(logsData);
          setAdjustments(adjsData);
          setDisputes(disputesData);
          setTransactions(txData);
          setScenarios(scenariosData);

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
      try {
          if (Array.isArray(entryOrEntries)) {
              // Bulk Mode
              const promises = entryOrEntries.map(entry => fuelService.saveFuelEntry(entry));
              const savedLogs = await Promise.all(promises);
              setLogs(prev => [...savedLogs, ...prev]);
              toast.success(`Successfully recorded ${savedLogs.length} transactions`);
          } else {
              // Single Mode
              const entry = entryOrEntries;
              const savedLog = await fuelService.saveFuelEntry(entry);
              if (editingLog) {
                  setLogs(prev => prev.map(l => l.id === savedLog.id ? savedLog : l));
                  toast.success("Transaction updated");
              } else {
                  setLogs(prev => [savedLog, ...prev]);
                  toast.success("Transaction recorded");
              }
          }
          setIsLogModalOpen(false);
          setEditingLog(null);
      } catch (e) {
          console.error(e);
          toast.error("Failed to save transaction(s)");
      }
  };

  const handleDeleteLog = async (id: string) => {
      try {
          await fuelService.deleteFuelEntry(id);
          setLogs(prev => prev.filter(l => l.id !== id));
          toast.success("Transaction deleted");
      } catch (e) {
          console.error(e);
          toast.error("Failed to delete transaction");
      }
  };

  // Reimbursement Handlers
  const handleApproveReimbursement = async (id: string, notes?: string) => {
      try {
          const updated = await api.approveExpense(id, notes);
          setTransactions(prev => prev.map(t => t.id === id ? updated : t));
          toast.success("Reimbursement Approved");
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
      try {
          const savedTx = await api.saveTransaction(transactionData);
          if (editingExpense) {
              setTransactions(prev => prev.map(t => t.id === savedTx.id ? savedTx : t));
              toast.success("Expense updated");
          } else {
              setTransactions(prev => [savedTx, ...prev]);
              toast.success("Expense request submitted");
          }
          setEditingExpense(null);
      } catch (e) {
          console.error(e);
          toast.error("Failed to save expense");
      }
  };

  const handleEditExpense = (tx: FinancialTransaction) => {
      setEditingExpense(tx);
      setIsSubmitExpenseModalOpen(true);
  };

  const handleDeleteExpense = (id: string) => {
      setDeleteConfirmationId(id);
  };

  const confirmDeleteExpense = async () => {
      if (!deleteConfirmationId) return;
      try {
          await api.deleteTransaction(deleteConfirmationId);
          setTransactions(prev => prev.filter(t => t.id !== deleteConfirmationId));
          toast.success("Expense deleted");
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
        <div className="flex justify-end mb-4">
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
              onApprove={handleApproveReimbursement}
              onReject={handleRejectReimbursement}
              onRequestSubmit={() => { setEditingExpense(null); setIsSubmitExpenseModalOpen(true); }}
              onEdit={handleEditExpense}
              onDelete={handleDeleteExpense}
          />
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
                onFinalize={(reports) => toast.success(`Finalized ${reports.length} reports`)}
                onAddAdjustment={() => { setAdjustmentDefaults({}); setIsAdjustmentModalOpen(true); }}
                onResolveDispute={(dispute) => { setSelectedDispute(dispute); setIsResolutionModalOpen(true); }}
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
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the expense request.
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

    </FuelLayout>
  );
}
