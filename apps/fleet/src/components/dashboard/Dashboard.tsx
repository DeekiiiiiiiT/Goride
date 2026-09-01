import React, { useState, useMemo, useEffect } from 'react';
import { Button } from "../ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { 
  Download,
  Loader2,
  RefreshCw,
  LayoutDashboard,
  FileSpreadsheet,
  FileText
} from "lucide-react";
import { useVocab } from '../../utils/vocabulary';
import { useServiceLineScope } from '../../contexts/ServiceLineScopeContext';
import { filterTripsByServiceLineScope } from '../../utils/serviceLineTripFilter';
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
import { DashboardMetricsEngine } from '../../utils/dashboardMetricsEngine';
import { exportToCSV } from '../../utils/csvHelpers';
import { DriverPerformanceView } from './DriverPerformanceView';
import { FinancialsView } from './FinancialsView';
import { VehiclePerformanceView } from './VehiclePerformanceView';
import { ExecutiveDashboard } from './ExecutiveDashboard';
import { FleetMetricCards } from './FleetMetricCards';
import { FleetMap } from './FleetMap';
import { MeetingSchedulerModal } from './MeetingSchedulerModal';
import { DailyBriefingModal } from './DailyBriefingModal';
import { PredictiveAnalyticsPanel } from './PredictiveAnalyticsPanel';
import { toast } from "sonner";

export function Dashboard() {
  const queryClient = useQueryClient();
  const { v } = useVocab();
  const { scope } = useServiceLineScope();
  const [activeTab, setActiveTab] = useState('overview');
  const [viewMode, setViewMode] = useState('operations');

  const [wave, setWave] = useState(1);

  const { data: initBundle, isLoading: initLoading } = useQuery({
    queryKey: ['dashboard', 'init'],
    queryFn: () => api.getDashboardInit(),
    staleTime: 1000 * 60 * 2,
  });

  const serverStats = initBundle?.stats ?? undefined;
  const trips: any[] = initBundle?.trips ?? [];
  const scopedTrips = useMemo(
    () => filterTripsByServiceLineScope(trips, scope),
    [trips, scope],
  );
  const driverMetrics: any[] = initBundle?.driverMetrics ?? [];
  const vehicleMetrics: any[] = initBundle?.vehicleMetrics ?? [];

  useEffect(() => {
    if (!initLoading && wave === 1) {
      const t = setTimeout(() => setWave(2), 200);
      return () => clearTimeout(t);
    }
  }, [initLoading, wave]);

  const { data: fleetSummary = null } = useQuery({
    queryKey: ['ledger', 'fleet-summary'],
    queryFn: async () => {
      const result = await api.getLedgerFleetSummary({ days: 7 });
      if (result.success) return result.data;
      console.error('[Dashboard] Ledger fleet summary returned success=false');
      return null;
    },
    staleTime: 1000 * 60 * 5,
    enabled: wave >= 2,
  });

  const loading = initLoading;

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
    } else if (scopedTrips.length > 0) {
       return DashboardMetricsEngine.calculateMetrics(scopedTrips, driverMetrics);
    }
    return null;
  }, [serverStats, scopedTrips, driverMetrics, vehicleMetrics]);

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

  const handleRefresh = () => {
    queryClient.invalidateQueries();
    toast.success("Refreshing dashboard data...");
  };

  const handleExport = (type: 'trips' | 'financials' | 'drivers') => {
    if (type === 'trips') {
      exportToCSV(scopedTrips, `trips_export_${new Date().toISOString().split('T')[0]}`);
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
            </SelectContent>
           </Select>

           <div className="h-6 w-px bg-slate-200 mx-1 hidden md:block" />

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
          <TabsTrigger value="financials">Revenue</TabsTrigger>
          <TabsTrigger value="drivers">Drivers</TabsTrigger>
          <TabsTrigger value="vehicles">Vehicles</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-6">
           {fleetMetrics && (
               <div className="grid grid-cols-1 md:grid-cols-12 gap-6 h-[800px] md:h-[600px]">
                   <div className="md:col-span-3 h-full overflow-y-auto pr-1">
                       <FleetMetricCards metrics={fleetMetrics} trips={trips} onNavigate={handleNavigate} />
                   </div>
                   <div className="md:col-span-9 h-full">
                       <FleetMap vehicleMetrics={vehicleMetrics} trips={trips} />
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
            periodLabel="Today"
            fleetSummary={fleetSummary}
          />
        </TabsContent>

        <TabsContent value="financials" className="space-y-6">
          <FinancialsView trips={trips} fleetSummary={fleetSummary} onNavigate={handleNavigate} />
        </TabsContent>

        <TabsContent value="drivers" className="space-y-6">
          <DriverPerformanceView trips={trips} driverMetrics={driverMetrics} />
        </TabsContent>

        <TabsContent value="vehicles" className="space-y-6">
          <VehiclePerformanceView trips={trips} vehicleMetrics={vehicleMetrics} />
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
           <PredictiveAnalyticsPanel trips={trips} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
