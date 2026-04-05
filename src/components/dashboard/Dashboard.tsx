import React, { useState, useMemo, useEffect } from 'react';
import { Button } from "../ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { 
  Calendar,
  Download,
  Loader2,
  RefreshCw,
  LayoutDashboard,
  FileSpreadsheet,
  FileText
} from "lucide-react";
import { startOfWeek } from "date-fns";
import { useVocab } from '../../utils/vocabulary';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator
} from "../ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { fuelService } from '../../services/fuelService';
import { DashboardMetricsEngine } from '../../utils/dashboardMetricsEngine';
import { Trip, Notification, DriverMetrics, VehicleMetrics, DashboardAlert } from '../../types/data';
import { exportToCSV } from '../../utils/csvHelpers';
import { AlertEngine } from '../../utils/alertEngine'; // Phase 8 Logic
import { DriverPerformanceView } from './DriverPerformanceView';
import { FinancialsView } from './FinancialsView';
import { VehiclePerformanceView } from './VehiclePerformanceView'; // Phase 7.4 Component
import { ExecutiveDashboard } from './ExecutiveDashboard'; // Phase 7.1 Component
import { SystemHealthView } from './SystemHealthView'; // Phase 9.1 Component
import { FleetMetricCards } from './FleetMetricCards';
import { FleetMap } from './FleetMap';
import { FleetAlertsPanel } from './FleetAlertsPanel';
import { BroadcastMessageModal } from './BroadcastMessageModal';
import { MeetingSchedulerModal } from './MeetingSchedulerModal';
import { DailyBriefingModal } from './DailyBriefingModal';
import { PredictiveAnalyticsPanel } from './PredictiveAnalyticsPanel';
import { AlertsConfigView } from './AlertsConfigView';
import { CheckInReviewModal } from './CheckInReviewModal';
import { useAdminCheckIn } from '../../hooks/useAdminCheckIn';
import { toast } from "sonner@2.0.3";
export function Dashboard() {
  const queryClient = useQueryClient();
  const { v } = useVocab();
  const [activeTab, setActiveTab] = useState('overview');
  const [viewMode, setViewMode] = useState('operations'); // Phase 6.4
  
  // Phase 7: Check-In Review Logic
  const [reviewCheckInId, setReviewCheckInId] = useState<string | null>(null);
  const { reviewCheckIn } = useAdminCheckIn();

  // ── Fix 1 + Fix 2: Staggered waves with aggregated init ──────────────
  // Wave 1 is a SINGLE /dashboard/init call that returns stats + trips +
  // driverMetrics + vehicleMetrics in one response (Fix 2).  Waves 2 & 3
  // fire sequentially after it settles (Fix 1 stagger).
  const [wave, setWave] = useState(1);

  // ── Wave 1 (single aggregated call — fires immediately) ─────────────
  const { data: initBundle, isLoading: initLoading } = useQuery({
    queryKey: ['dashboard', 'init'],
    queryFn: () => api.getDashboardInit(),
    staleTime: 1000 * 60 * 2, // 2 minutes
  });

  // Destructure the bundle (safe defaults when still loading)
  const serverStats = initBundle?.stats ?? undefined;
  const trips: any[] = initBundle?.trips ?? [];
  const driverMetrics: any[] = initBundle?.driverMetrics ?? [];
  const vehicleMetrics: any[] = initBundle?.vehicleMetrics ?? [];

  // Advance to Wave 2 once Wave 1 settles
  useEffect(() => {
    if (!initLoading && wave === 1) {
      const t = setTimeout(() => setWave(2), 200);
      return () => clearTimeout(t);
    }
  }, [initLoading, wave]);

  // ── Wave 2 (secondary — fires after Wave 1) ────────────────────────
  const { data: batches = [], isLoading: batchesLoading, isFetched: batchesFetched } = useQuery({
    queryKey: ['batches'],
    queryFn: () => api.getBatches(),
    staleTime: 1000 * 60 * 5,
    enabled: wave >= 2,
  });

  const { data: apiNotifications = [], isLoading: notificationsLoading, isFetched: notificationsFetched } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.getNotifications(),
    staleTime: 1000 * 60 * 1,
    enabled: wave >= 2,
  });

  const { data: persistentAlerts = [], isFetched: alertsFetched } = useQuery({
    queryKey: ['persistent-alerts'],
    queryFn: () => api.getPersistentAlerts(),
    staleTime: 1000 * 60 * 1,
    enabled: wave >= 2,
  });

  const { data: rules = [], isFetched: rulesFetched } = useQuery({
    queryKey: ['alertRules'],
    queryFn: () => api.getAlertRules(),
    enabled: wave >= 2,
  });

  // Advance to Wave 3 once Wave 2 settles
  const wave2Done = batchesFetched && notificationsFetched && alertsFetched && rulesFetched;
  useEffect(() => {
    if (wave2Done && wave === 2) {
      const t = setTimeout(() => setWave(3), 200);
      return () => clearTimeout(t);
    }
  }, [wave2Done, wave]);

  // ── Wave 3 (deferred — fires after Wave 2) ─────────────────────────
  // Phase 7: Fetch Fuel & Check-In Data for Alerts
  const currentWeekStart = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString().split('T')[0], []);
  
  const { data: fuelEntries = [] } = useQuery({
    queryKey: ['fuelEntries'],
    queryFn: () => fuelService.getFuelEntries(),
    staleTime: 1000 * 60 * 5,
    enabled: wave >= 3,
  });

  const { data: adjustments = [] } = useQuery({
    queryKey: ['adjustments'],
    queryFn: () => fuelService.getMileageAdjustments(),
    staleTime: 1000 * 60 * 5,
    enabled: wave >= 3,
  });

  const { data: checkIns = [] } = useQuery({
    queryKey: ['checkIns', currentWeekStart],
    queryFn: () => api.getCheckIns(currentWeekStart),
    staleTime: 1000 * 60 * 5,
    enabled: wave >= 3,
  });

  const { data: maintenanceLogs = [] } = useQuery({
    queryKey: ['maintenanceLogs'],
    queryFn: () => api.getAllMaintenanceLogs(),
    staleTime: 1000 * 60 * 5,
    enabled: wave >= 3,
  });

  // Phase 4: Fetch ledger-sourced fleet summary (runs in Wave 3, non-blocking)
  const { data: fleetSummary = null } = useQuery({
    queryKey: ['ledger', 'fleet-summary'],
    queryFn: async () => {
      const result = await api.getLedgerFleetSummary({ days: 7 });
      if (result.success) {
        console.log(`[Dashboard] Ledger fleet summary loaded: ${result.meta.totalEntriesProcessed} entries in ${result.meta.durationMs}ms`);
        return result.data;
      }
      console.error('[Dashboard] Ledger fleet summary returned success=false');
      return null;
    },
    staleTime: 1000 * 60 * 5,
    enabled: wave >= 3,
  });

  const loading = initLoading;

  // 2. Derived State (Memoized)
  const fleetMetrics = useMemo(() => {
    if (serverStats) {
      return {
        timestamp: new Date().toISOString(),
        date: serverStats.date,
        hour: new Date().getHours(),
        activeDrivers: serverStats.activeDrivers || 0,
        vehiclesOnline: vehicleMetrics.length, 
        tripsInProgress: 0,
        tripsCompletedToday: serverStats.trips || 0,
        earningsToday: serverStats.revenue || 0,
        avgAcceptanceRate: 0,
        avgCancellationRate: 0,
        fleetUtilization: serverStats.efficiency || 0,
        topDriverName: '-',
        topDriverEarnings: 0,
        bottomDriverName: '-',
        criticalAlertsCount: 0,
        alertDetails: '',
        lastUpdateTime: new Date().toISOString()
      };
    } else if (trips.length > 0) {
       return DashboardMetricsEngine.calculateMetrics(trips, driverMetrics);
    }
    return null;
  }, [serverStats, trips, driverMetrics, vehicleMetrics]);

  const { fleetAlerts, notifications } = useMemo(() => {
     const realAlerts = AlertEngine.generateDashboardAlerts(
        driverMetrics, 
        vehicleMetrics, 
        trips,
        fuelEntries,
        adjustments,
        checkIns,
        maintenanceLogs
     );
     
     const aiAlerts: DashboardAlert[] = apiNotifications.map(n => ({
        id: n.id,
        definitionId: 'ai_insight',
        timestamp: n.timestamp,
        severity: n.severity === 'critical' ? 'critical' : n.severity === 'warning' ? 'high' : 'low',
        title: n.title,
        description: n.message,
        status: 'new',
        active: true
     }));

     const localAlerts = AlertEngine.checkRules(rules, driverMetrics, trips);
     const ruleBasedAlerts: DashboardAlert[] = localAlerts.map(n => ({
        id: n.id,
        definitionId: 'custom_rule',
        timestamp: n.timestamp,
        severity: n.severity as 'low' | 'medium' | 'high' | 'critical',
        title: n.title,
        description: n.message,
        status: 'new',
        active: true
     }));

     const combinedAlerts = [...realAlerts, ...aiAlerts, ...ruleBasedAlerts].sort((a,b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
     );

     const allNotifications = trips.length > 0 
        ? [...localAlerts, ...apiNotifications].sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        : apiNotifications;
      
     return { fleetAlerts: combinedAlerts, notifications: allNotifications };
  }, [driverMetrics, vehicleMetrics, trips, apiNotifications, rules, fuelEntries, adjustments, checkIns, maintenanceLogs]);

  // Phase 1 Backbone: Sync critical alerts to server persistent store (Side-effect)
  // DISABLED: This was causing an infinite feedback loop with useAlertPusher.
  // The effect pushes critical alerts → server stores them → useAlertPusher polls and shows toasts
  // → React Query refetches persistentAlerts → this effect re-runs → pushes again → loop
  /*
  useEffect(() => {
    const criticalToSync = fleetAlerts.filter(a => a.severity === 'critical');
    if (criticalToSync.length > 0) {
        criticalToSync.forEach(async (alert) => {
            const alreadyInPersistent = apiNotifications.some(n => n.id === alert.id) || 
                                       persistentAlerts.some((pa: any) => pa.id === alert.id);
            if (!alreadyInPersistent) {
                try {
                    await api.pushAlert({
                        id: alert.id,
                        type: 'alert',
                        severity: 'critical',
                        title: alert.title,
                        message: alert.description,
                        timestamp: alert.timestamp,
                        metadata: alert.metadata
                    });
                } catch (e) {
                    console.error("Failed to sync critical alert", e);
                }
            }
        });
    }
  }, [fleetAlerts, apiNotifications, persistentAlerts]);
  */

  const selectedCheckIn = useMemo(() => {
      return checkIns.find((c: any) => c.id === reviewCheckInId);
  }, [checkIns, reviewCheckInId]);
  
  const selectedDriverName = useMemo(() => {
      if (!selectedCheckIn) return '';
      return driverMetrics.find((d: any) => d.driverId === selectedCheckIn.driverId)?.driverName || 'Unknown Driver';
  }, [selectedCheckIn, driverMetrics]);

  const handleReviewSubmit = async (id: string, status: 'approved' | 'rejected', notes?: string) => {
      await reviewCheckIn(id, status, notes);
      queryClient.invalidateQueries({ queryKey: ['checkIns'] });
      setReviewCheckInId(null);
      toast.success(`Check-In ${status === 'approved' ? 'Approved' : 'Rejected'}`);
  };

  const handleViewChange = (val: string) => {
      setViewMode(val);
      if (val === 'financial') setActiveTab('financials');
      else if (val === 'maintenance') setActiveTab('vehicles');
      else if (val === 'driver') setActiveTab('drivers');
      else if (val === 'analytics') setActiveTab('analytics');
      else if (val === 'executive') setActiveTab('executive');
      else if (val === 'health') setActiveTab('health');
      else setActiveTab('overview');
      toast.info(`Switched to ${val.charAt(0).toUpperCase() + val.slice(1)} View`);
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries();
    toast.success("Refreshing dashboard data...");
  };

  const handleExport = (type: 'trips' | 'financials' | 'drivers') => {
    if (type === 'trips') {
      exportToCSV(trips, `trips_export_${new Date().toISOString().split('T')[0]}`);
    } else if (type === 'drivers') {
      exportToCSV(driverMetrics, `driver_performance`);
    }
  };
  
  const handleNavigate = (page: string) => {
      if (page === 'drivers') setActiveTab('drivers');
      if (page === 'vehicles') setActiveTab('vehicles');
      if (page === 'transactions') setActiveTab('financials');
  };

  if (loading && !fleetMetrics) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{v('dashboardTitle').toUpperCase()}</h2>
          <p className="text-slate-500 dark:text-slate-400">
            {v('dashboardSubtitle')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
           <Select value={viewMode} onValueChange={handleViewChange}>
            <SelectTrigger className="w-[160px] h-9">
              <LayoutDashboard className="w-4 h-4 mr-2 text-slate-500"/>
              <SelectValue placeholder="Select View" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="operations">Operations View</SelectItem>
              <SelectItem value="executive">Executive View</SelectItem>
              <SelectItem value="financial">Financial View</SelectItem>
              <SelectItem value="maintenance">Maintenance View</SelectItem>
              <SelectItem value="driver">Driver View</SelectItem>
              <SelectItem value="analytics">Analytics View</SelectItem>
              <SelectItem value="health">System Health & Monitoring</SelectItem>
            </SelectContent>
           </Select>

           <div className="h-6 w-px bg-slate-200 mx-1 hidden md:block" />

           <BroadcastMessageModal />
           <MeetingSchedulerModal />
           <DailyBriefingModal />
           
           <div className="h-6 w-px bg-slate-200 mx-1 hidden md:block" />

           <Button variant="outline" size="icon" onClick={handleRefresh} title="Refresh Data">
            <RefreshCw className="h-4 w-4" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Download className="mr-2 h-4 w-4" />
                Reports & Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Export Today's Data</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => handleExport('trips')}>
                <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-600" /> Excel (Full Data)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('financials')}>
                <FileText className="mr-2 h-4 w-4 text-slate-600" /> PDF Summary
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>View Detailed Reports</DropdownMenuLabel>
              <DropdownMenuItem>Live Operations Report</DropdownMenuItem>
              <DropdownMenuItem>Driver Performance Summary</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="executive">Executive</TabsTrigger>
          <TabsTrigger value="financials">Financials</TabsTrigger>
          <TabsTrigger value="drivers">Drivers</TabsTrigger>
          <TabsTrigger value="vehicles">Vehicles</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="health">System Health</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-6">
           {fleetMetrics && (
               <div className="grid grid-cols-1 md:grid-cols-12 gap-6 h-[800px] md:h-[600px]">
                   <div className="md:col-span-3 h-full overflow-y-auto pr-1">
                       <FleetMetricCards metrics={fleetMetrics} trips={trips} onNavigate={handleNavigate} />
                   </div>
                   <div className="md:col-span-6 h-full">
                       <FleetMap vehicleMetrics={vehicleMetrics} trips={trips} />
                   </div>
                   <div className="md:col-span-3 h-full overflow-y-auto pl-1">
                       <FleetAlertsPanel 
                           alerts={fleetAlerts} 
                           metrics={fleetMetrics} 
                           driverMetrics={driverMetrics} 
                           onNavigate={handleNavigate}
                           onReview={setReviewCheckInId} 
                       />
                   </div>
               </div>
           )}
        </TabsContent>

        <TabsContent value="executive" className="space-y-6">
          <ExecutiveDashboard 
            trips={trips}
            driverMetrics={driverMetrics}
            vehicleMetrics={vehicleMetrics}
            organizationMetrics={[]}
            notifications={notifications}
            periodLabel="Today"
            fleetSummary={fleetSummary}
          />
        </TabsContent>

        <TabsContent value="financials" className="space-y-6">
          <FinancialsView trips={trips} fleetSummary={fleetSummary} />
        </TabsContent>

        <TabsContent value="drivers" className="space-y-6">
          <DriverPerformanceView trips={trips} driverMetrics={driverMetrics} />
        </TabsContent>

        <TabsContent value="vehicles" className="space-y-6">
          <VehiclePerformanceView trips={trips} vehicleMetrics={vehicleMetrics} />
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                 <div className="h-[600px] overflow-hidden rounded-lg border bg-white shadow-sm">
                     {fleetMetrics && (
                        <FleetAlertsPanel 
                            alerts={fleetAlerts} 
                            metrics={fleetMetrics} 
                            driverMetrics={driverMetrics} 
                            onNavigate={handleNavigate}
                            onReview={setReviewCheckInId}
                        />
                     )}
                 </div>
                 <div>
                    <AlertsConfigView />
                 </div>
            </div>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
           <PredictiveAnalyticsPanel trips={trips} />
        </TabsContent>

        <TabsContent value="health" className="space-y-6">
          <SystemHealthView 
             trips={trips}
             driverMetrics={driverMetrics}
             vehicleMetrics={vehicleMetrics}
             notifications={notifications}
             batches={batches}
          />
        </TabsContent>
      </Tabs>

      {selectedCheckIn && (
          <CheckInReviewModal 
              isOpen={!!selectedCheckIn}
              onClose={() => setReviewCheckInId(null)}
              checkIn={selectedCheckIn}
              driverName={selectedDriverName}
              onReview={handleReviewSubmit}
          />
      )}
    </div>
  );
}