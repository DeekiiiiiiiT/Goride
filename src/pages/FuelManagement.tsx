import React, { useState, useEffect } from 'react';
import { FuelLayout } from '../components/fuel/FuelLayout';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Fuel, Plus, CreditCard, Banknote, Upload } from 'lucide-react';
import { FuelCardList } from '../components/fuel/FuelCardList';
import { FuelCardModal } from '../components/fuel/FuelCardModal';
import { FuelLogModal } from '../components/fuel/FuelLogModal';
import { FuelLogTable } from '../components/fuel/FuelLogTable';
import { FuelImportModal } from '../components/fuel/FuelImportModal';
import { ReconciliationTable } from '../components/fuel/ReconciliationTable';
import { DatePickerWithRange } from '../components/ui/date-range-picker';
import { MileageAdjustmentModal } from '../components/fuel/MileageAdjustmentModal';
import { DisputeResolutionModal } from '../components/fuel/DisputeResolutionModal';
import { FuelCard, FuelEntry, MileageAdjustment, FuelDispute } from '../types/fuel';
import { Trip } from '../types/data';
import { api } from '../services/api';
import { fuelService } from '../services/fuelService';
import { FuelDisputeService } from '../services/fuelDisputeService';
import { toast } from "sonner@2.0.3";
import { startOfWeek, endOfWeek } from "date-fns";
import { DateRange } from "react-day-picker";

export function FuelManagement() {
  const [activeTab, setActiveTab] = useState('dashboard');
  
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
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<FuelEntry | null>(null);

  // Adjustment State
  const [adjustments, setAdjustments] = useState<MileageAdjustment[]>([]);
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
  const [adjustmentDefaults, setAdjustmentDefaults] = useState<{ vehicleId?: string, date?: Date }>({});

  // Dispute State
  const [disputes, setDisputes] = useState<FuelDispute[]>([]);
  const [selectedDispute, setSelectedDispute] = useState<FuelDispute | null>(null);
  const [isResolutionModalOpen, setIsResolutionModalOpen] = useState(false);

  // Assignment Data
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);

  useEffect(() => {
    // Load helper data
    const loadData = async () => {
        try {
            const [vData, dData, tData, cardsData, logsData, adjsData, disputesData] = await Promise.all([
                api.getVehicles().catch(() => []), 
                api.getDrivers().catch(() => []),
                api.getTrips({ limit: 500 }).catch(() => []),
                fuelService.getFuelCards().catch(() => []),
                fuelService.getFuelEntries().catch(() => []),
                fuelService.getMileageAdjustments().catch(() => []),
                FuelDisputeService.getAllDisputes().catch(() => [])
            ]);
            
            setVehicles(vData);
            setDrivers(dData);
            setTrips(tData);
            setCards(cardsData);
            setLogs(logsData);
            setAdjustments(adjsData);
            setDisputes(disputesData);

        } catch (e) {
            console.error("Failed to load fuel management data", e);
            toast.error("Failed to load initial data");
        }
    };
    loadData();
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
  const handleSaveLog = async (entry: FuelEntry) => {
      try {
          const savedLog = await fuelService.saveFuelEntry(entry);
          if (editingLog) {
              setLogs(prev => prev.map(l => l.id === savedLog.id ? savedLog : l));
              toast.success("Transaction updated");
          } else {
              setLogs(prev => [savedLog, ...prev]);
              toast.success("Transaction recorded");
          }
          setIsLogModalOpen(false);
          setEditingLog(null);
      } catch (e) {
          console.error(e);
          toast.error("Failed to save transaction");
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

  const handleImportLogs = async (newEntries: FuelEntry[]) => {
      try {
          // Save all imported entries
          // Ideally backend would support bulk insert, but loop is fine for MVP
          const savedEntries = await Promise.all(newEntries.map(entry => fuelService.saveFuelEntry(entry)));
          
          setLogs(prev => [...savedEntries, ...prev]);
          toast.success(`Imported ${savedEntries.length} transactions`);
          setIsImportModalOpen(false);
      } catch (e) {
          console.error(e);
          toast.error("Failed to save imported transactions");
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

  return (
    <FuelLayout 
        activeTab={activeTab} 
        onTabChange={setActiveTab}
        onAddTransaction={() => {
            setEditingLog(null);
            setIsLogModalOpen(true);
        }}
    >
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
        </div>
      )}

      {activeTab === 'reconciliation' && (
        <div className="space-y-4">
             <div className="flex justify-between items-start">
                 <div className="space-y-1">
                    <h2 className="text-lg font-semibold text-slate-900">Fuel Reconciliation</h2>
                    <p className="text-sm text-slate-500">Compare actual gas card charges against estimated operating costs.</p>
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
                    <h2 className="text-lg font-semibold text-slate-900">Fuel Card Inventory</h2>
                    <p className="text-sm text-slate-500">Manage gas cards and their assignments.</p>
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
             <div className="flex justify-between items-center">
                <div className="space-y-1">
                    <h2 className="text-lg font-semibold text-slate-900">Transaction Logs</h2>
                    <p className="text-sm text-slate-500">History of all fuel purchases and manual entries.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setIsImportModalOpen(true)}>
                        <Upload className="h-4 w-4 mr-2" />
                        Import Statement
                    </Button>
                    <Button onClick={() => { setEditingLog(null); setIsLogModalOpen(true); }}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Entry
                    </Button>
                </div>
            </div>

            <FuelLogTable 
                entries={logs}
                onEdit={(log) => { setEditingLog(log); setIsLogModalOpen(true); }}
                onDelete={handleDeleteLog}
                getVehicleName={getVehicleName}
                getDriverName={getDriverName}
            />
        </div>
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

      <FuelImportModal 
            isOpen={isImportModalOpen}
            onClose={() => setIsImportModalOpen(false)}
            onSave={handleImportLogs}
            cards={cards}
            vehicles={vehicles}
            drivers={drivers}
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

    </FuelLayout>
  );
}
