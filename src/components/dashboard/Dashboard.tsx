import React, { useState, useMemo } from 'react';
import { Button } from "../ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { 
  Calendar,
  Download,
  Loader2,
  RefreshCw
} from "lucide-react";
import { startOfWeek } from "date-fns";
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
import { Trip, Notification, DriverMetrics, VehicleMetrics, OrganizationMetrics, TripAnalytics, DashboardMetrics, DashboardAlert, ImportBatch } from '../../types/data';
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
import { FileSpreadsheet, FileText, LayoutDashboard } from 'lucide-react';
import { toast } from "sonner@2.0.3";

export function Dashboard() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('overview');
  const [viewMode, setViewMode] = useState('operations'); // Phase 6.4
  
  // Phase 7: Check-In Review Logic
  const [reviewCheckInId, setReviewCheckInId] = useState<string | null>(null);
  const { reviewCheckIn } = useAdminCheckIn();

  // 1. React Query Hooks
  const { data: serverStats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => api.getDashboardStats(),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const { data: trips = [], isLoading: tripsLoading } = useQuery({
    queryKey: ['trips'],
    queryFn: () => api.getTrips(),
    staleTime: 1000 * 60 * 2, // 2 minutes
  });

  const { data: driverMetrics = [], isLoading: driversLoading } = useQuery({
    queryKey: ['driverMetrics'],
    queryFn: () => api.getDriverMetrics(),
    staleTime: 1000 * 60 * 5,
  });

  const { data: vehicleMetrics = [], isLoading: vehiclesLoading } = useQuery({
    queryKey: ['vehicleMetrics'],
    queryFn: () => api.getVehicleMetrics(),
    staleTime: 1000 * 60 * 5,
  });

  const { data: batches = [], isLoading: batchesLoading } = useQuery({
    queryKey: ['batches'],
    queryFn: () => api.getBatches(),
    staleTime: 1000 * 60 * 5,
  });

  const { data: apiNotifications = [], isLoading: notificationsLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.getNotifications(),
    staleTime: 1000 * 60 * 1,
  });

  const { data: rules = [] } = useQuery({
    queryKey: ['alertRules'],
    queryFn: () => api.getAlertRules(),
  });

  // Phase 7: Fetch Fuel & Check-In Data for Alerts
  const currentWeekStart = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString().split('T')[0], []);
  
  const { data: fuelEntries = [] } = useQuery({
    queryKey: ['fuelEntries'],
    queryFn: () => fuelService.getFuelEntries(),
    staleTime: 1000 * 60 * 5,
  });

  const { data: adjustments = [] } = useQuery({
    queryKey: ['adjustments'],
    queryFn: () => fuelService.getMileageAdjustments(),
    staleTime: 1000 * 60 * 5,
  });

  const { data: checkIns = [] } = useQuery({
    queryKey: ['checkIns', currentWeekStart],
    queryFn: () => api.getCheckIns(currentWeekStart),
    staleTime: 1000 * 60 * 5,
  });

  const loading = statsLoading || tripsLoading || driversLoading || vehiclesLoading || batchesLoading || notificationsLoading;

  // Phase 7: Review Modal Helpers
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

  // 2. Derived State (Memoized)
  const fleetMetrics = useMemo(() => {
    if (serverStats) {
      // Map server response to DashboardMetrics
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
       // Fallback to client-side engine
       return DashboardMetricsEngine.calculateMetrics(trips, driverMetrics);
    }
    return null;
  }, [serverStats, trips, driverMetrics, vehicleMetrics]);

  const { fleetAlerts, notifications } = useMemo(() => {
     // Generate Real-time Alerts (Phase 4 Engine)
     const realAlerts = AlertEngine.generateDashboardAlerts(
        driverMetrics, 
        vehicleMetrics, 
        trips,
        fuelEntries,
        adjustments,
        checkIns
     );
     
     // Merge AI Insights (Notifications) into Dashboard Alerts
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

     // Check Rules - DYNAMIC LOGIC
     const localAlerts = AlertEngine.checkRules(rules, driverMetrics, trips);
     
     // Convert localAlerts (Notification[]) to DashboardAlert[]
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

     // Update Fleet Alerts State (Dashboard Panel)
     const combinedAlerts = [...realAlerts, ...aiAlerts, ...ruleBasedAlerts].sort((a,b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
     );

     // Update Notifications State (Executive View)
     const allNotifications = trips.length > 0 
        ? [...localAlerts, ...apiNotifications].sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        : apiNotifications;
      
     return { fleetAlerts: combinedAlerts, notifications: allNotifications };

  }, [driverMetrics, vehicleMetrics, trips, apiNotifications, rules]);

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
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['trips'] });
    queryClient.invalidateQueries({ queryKey: ['driverMetrics'] });
    queryClient.invalidateQueries({ queryKey: ['vehicleMetrics'] });
    queryClient.invalidateQueries({ queryKey: ['batches'] });
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    toast.success("Refreshing dashboard data...");
  };

  const handleExport = (type: 'trips' | 'financials' | 'drivers') => {
    if (type === 'trips') {
      exportToCSV(trips, `trips_export_${new Date().toISOString().split('T')[0]}`);
    } else if (type === 'financials') {
      exportToCSV([], `financials_export`);
    } else if (type === 'drivers') {
      exportToCSV(driverMetrics, `driver_performance`);
    }
  };
  
  const handleNavigate = (page: string) => {
      console.log(`Navigate to ${page}`);
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
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">FLEET ANALYTICS DASHBOARD</h2>
          <p className="text-slate-500 dark:text-slate-400">
            Overview of your fleet's performance and financial health.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
           {/* Phase 6: Custom Views */}
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

           {/* Phase 5: Quick Actions */}
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
              <DropdownMenuItem>
                 Live Operations Report
              </DropdownMenuItem>
              <DropdownMenuItem>
                 Driver Performance Summary
              </DropdownMenuItem>
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
        
        {/* PHASE 2: New Three-Column Dashboard Layout */}
        <TabsContent value="overview" className="space-y-6">
           {fleetMetrics && (
               <div className="grid grid-cols-1 md:grid-cols-12 gap-6 h-[800px] md:h-[600px]">
                   {/* Left Column: Key Metrics (20%) */}
                   <div className="md:col-span-3 h-full overflow-y-auto pr-1">
                       <FleetMetricCards metrics={fleetMetrics} trips={trips} onNavigate={handleNavigate} />
                   </div>

                   {/* Middle Column: Map (50%) */}
                   <div className="md:col-span-6 h-full">
                       <FleetMap vehicleMetrics={vehicleMetrics} trips={trips} />
                   </div>

                   {/* Right Column: Alerts & Leaderboard (30%) */}
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

        {/* PHASE 7.1: Executive Dashboard View */}
        <TabsContent value="executive" className="space-y-6">
          <ExecutiveDashboard 
            trips={trips}
            driverMetrics={driverMetrics}
            vehicleMetrics={vehicleMetrics}
            organizationMetrics={[]}
            notifications={notifications}
            periodLabel="Today"
          />
        </TabsContent>

        {/* PHASE 7.3: Financial Dashboard View */}
        <TabsContent value="financials" className="space-y-6">
          <FinancialsView trips={trips} />
        </TabsContent>

        {/* PHASE 7.2: Driver Performance Dashboard View */}
        <TabsContent value="drivers" className="space-y-6">
          <DriverPerformanceView trips={trips} driverMetrics={driverMetrics} />
        </TabsContent>

        {/* PHASE 7.4: Vehicle Dashboard View */}
        <TabsContent value="vehicles" className="space-y-6">
          <VehiclePerformanceView trips={trips} vehicleMetrics={vehicleMetrics} />
        </TabsContent>

        {/* PHASE 8: Alerts & Configuration View */}
        <TabsContent value="alerts" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                 {/* Live Alerts Panel */}
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
                 {/* Rule Configuration */}
                 <div>
                    <AlertsConfigView />
                 </div>
            </div>
        </TabsContent>

        {/* PHASE 6: Predictive Analytics View */}
        <TabsContent value="analytics" className="space-y-6">
           <PredictiveAnalyticsPanel trips={trips} />
        </TabsContent>

        {/* PHASE 9.1: System Health View */}
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

      {/* Review Modal */}
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