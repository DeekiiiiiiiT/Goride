import React, { useEffect, useState, useMemo } from 'react';
import { Button } from "../ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { 
  Calendar,
  Download,
  Loader2,
  RefreshCw
} from "lucide-react";
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
import { api } from '../../services/api';
import { dashboardService } from '../../services/dashboardService';
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
import { FileSpreadsheet, FileText, LayoutDashboard } from 'lucide-react';
import { toast } from "sonner@2.0.3";

export function Dashboard() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [driverMetrics, setDriverMetrics] = useState<DriverMetrics[]>([]);
  const [vehicleMetrics, setVehicleMetrics] = useState<VehicleMetrics[]>([]);
  const [orgMetrics, setOrgMetrics] = useState<OrganizationMetrics[]>([]);
  
  // Phase 1 Fleet Dashboard State
  const [fleetMetrics, setFleetMetrics] = useState<DashboardMetrics | null>(null);
  const [fleetAlerts, setFleetAlerts] = useState<DashboardAlert[]>([]);
  
  // Phase 4 Analytics State
  const [tripAnalytics, setTripAnalytics] = useState<TripAnalytics | undefined>(undefined);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [viewMode, setViewMode] = useState('operations'); // Phase 6.4

  const handleViewChange = (val: string) => {
      setViewMode(val);
      if (val === 'financial') setActiveTab('financials');
      else if (val === 'maintenance') setActiveTab('vehicles');
      else if (val === 'driver') setActiveTab('drivers');
      else if (val === 'analytics') setActiveTab('analytics');
      else if (val === 'executive') setActiveTab('executive');
      else setActiveTab('overview');
      toast.info(`Switched to ${val.charAt(0).toUpperCase() + val.slice(1)} View`);
  };

  const fetchData = async () => {
    try {
      setLoading(true);

      // 1. Fetch Raw Data first (Trips & Driver Metrics)
      let fetchedTrips: Trip[] = [];
      try {
          fetchedTrips = await api.getTrips();
          setTrips(fetchedTrips);
      } catch (tripErr: any) {
          console.error("Failed to load trips", tripErr);
      }

      let fetchedDriverMetrics: DriverMetrics[] = [];
      try {
          fetchedDriverMetrics = await api.getDriverMetrics();
          setDriverMetrics(fetchedDriverMetrics);
      } catch (err: any) { console.error("Failed to load driver metrics"); }

      let fetchedVehicleMetrics: VehicleMetrics[] = [];
      try {
          fetchedVehicleMetrics = await api.getVehicleMetrics();
          setVehicleMetrics(fetchedVehicleMetrics);
      } catch (err: any) { console.error("Failed to load vehicle metrics"); }

      // Fetch Batches for System Health
      try {
          const fetchedBatches = await api.getBatches();
          setBatches(fetchedBatches);
      } catch (err) { console.error("Failed to load batches"); }

      // 2. Generate Real-time Fleet Dashboard Metrics (Phase 3 Engine)
      // Use the engine to calculate metrics from actual data
      const dMetrics = DashboardMetricsEngine.calculateMetrics(fetchedTrips, fetchedDriverMetrics);
      setFleetMetrics(dMetrics);

      // 3. Generate Real-time Alerts (Phase 4 Engine)
      const realAlerts = AlertEngine.generateDashboardAlerts(fetchedDriverMetrics, fetchedVehicleMetrics, fetchedTrips);
      setFleetAlerts(realAlerts);

      // Fetch Metrics & Rules (for Phase 8 Alerts)
      let rules = [];
      
      try {
          rules = await api.getAlertRules();
      } catch (e) { console.error("Failed to load rules"); }

      // Fetch Notifications (API)
      let apiNotifications: Notification[] = [];
      try {
          apiNotifications = await api.getNotifications();
      } catch (notifErr: any) {
           console.error("Failed to load notifications", notifErr);
      }
      
      // --- PHASE 8.2: GENERATE REAL-TIME ALERTS ---
      // Run local engine to supplement API notifications
      if (fetchedTrips.length > 0) {
          const localAlerts = AlertEngine.checkRules(rules, fetchedDriverMetrics, fetchedTrips);
          const allNotifications = [...localAlerts, ...apiNotifications].sort((a,b) => 
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
          setNotifications(allNotifications);
      } else {
          setNotifications(apiNotifications);
      }
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

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
      // In a real app with routing, this would use router.push
      // For now we just log it or maybe change the tab if applicable
      console.log(`Navigate to ${page}`);
      // Simple internal tab navigation mapping if useful
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
            </SelectContent>
           </Select>

           <div className="h-6 w-px bg-slate-200 mx-1 hidden md:block" />

           {/* Phase 5: Quick Actions */}
           <BroadcastMessageModal />
           <MeetingSchedulerModal />
           <DailyBriefingModal />
           
           <div className="h-6 w-px bg-slate-200 mx-1 hidden md:block" />

           <Button variant="outline" size="icon" onClick={fetchData} title="Refresh Data">
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
                       <FleetAlertsPanel alerts={fleetAlerts} metrics={fleetMetrics} driverMetrics={driverMetrics} onNavigate={handleNavigate} />
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
                        <FleetAlertsPanel alerts={fleetAlerts} metrics={fleetMetrics} driverMetrics={driverMetrics} onNavigate={handleNavigate} />
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
    </div>
  );
}