import React, { useEffect, useState, useMemo } from 'react';
import { Button } from "../ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { 
  Calendar,
  Download,
  Loader2,
} from "lucide-react";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "../ui/dropdown-menu";
import { api } from '../../services/api';
import { Trip, Notification, DriverMetrics, VehicleMetrics, OrganizationMetrics, TripAnalytics } from '../../types/data';
import { exportToCSV } from '../../utils/csvHelpers';
import { AlertEngine } from '../../utils/alertEngine'; // Phase 8 Logic
import { DriverPerformanceView } from './DriverPerformanceView';
import { FinancialsView } from './FinancialsView';
import { VehiclePerformanceView } from './VehiclePerformanceView'; // Phase 7.4 Component
import { ExecutiveDashboard } from './ExecutiveDashboard'; // Phase 7.1 Component
import { SystemHealthView } from './SystemHealthView'; // Phase 9.1 Component

export function Dashboard() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [driverMetrics, setDriverMetrics] = useState<DriverMetrics[]>([]);
  const [vehicleMetrics, setVehicleMetrics] = useState<VehicleMetrics[]>([]);
  const [orgMetrics, setOrgMetrics] = useState<OrganizationMetrics[]>([]);
  
  // Phase 4 Analytics State
  const [tripAnalytics, setTripAnalytics] = useState<TripAnalytics | undefined>(undefined);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // Fetch trips
        let fetchedTrips: Trip[] = [];
        try {
            fetchedTrips = await api.getTrips();
            setTrips(fetchedTrips);
        } catch (tripErr: any) {
            console.error("Failed to load trips", tripErr);
        }

        // Fetch Metrics & Rules (for Phase 8 Alerts)
        let rules = [];
        let fetchedDriverMetrics: DriverMetrics[] = [];
        
        try {
            rules = await api.getAlertRules();
            // In real app, metrics come from API. For now, if empty, we might skip alert generation or rely on trips
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
            // Mock driver metrics generation if API returns empty, just so alerts work for demo
            if (fetchedDriverMetrics.length === 0) {
                // ... (simplified aggregation for alert engine) ...
            }
            
            const localAlerts = AlertEngine.checkRules(rules, fetchedDriverMetrics, fetchedTrips);
            
            // Merge: Deduplicate by title+timestamp roughly or just append
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

  if (loading) {
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
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Dashboard</h2>
          <p className="text-slate-500 dark:text-slate-400">
            Overview of your fleet's performance and financial health.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline">
            <Calendar className="mr-2 h-4 w-4" />
            Last 7 Days
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                <Download className="mr-2 h-4 w-4" />
                Download Report
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExport('trips')}>
                Raw Trip Data (CSV)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('financials')}>
                Financial Summary (CSV)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('drivers')}>
                Driver Performance (CSV)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="financials">Financials</TabsTrigger>
          <TabsTrigger value="drivers">Drivers</TabsTrigger>
          <TabsTrigger value="vehicles">Vehicles</TabsTrigger>
          <TabsTrigger value="health">System Health</TabsTrigger>
        </TabsList>
        
        {/* PHASE 7.1: Executive Dashboard View */}
        <TabsContent value="overview" className="space-y-6">
           <ExecutiveDashboard 
              trips={trips}
              driverMetrics={driverMetrics}
              vehicleMetrics={vehicleMetrics}
              organizationMetrics={orgMetrics}
              tripAnalytics={tripAnalytics}
              notifications={notifications}
              periodLabel="Last 7 Days"
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

        {/* PHASE 9.1: System Health View */}
        <TabsContent value="health" className="space-y-6">
          <SystemHealthView 
             trips={trips}
             driverMetrics={driverMetrics}
             vehicleMetrics={vehicleMetrics}
             notifications={notifications}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}