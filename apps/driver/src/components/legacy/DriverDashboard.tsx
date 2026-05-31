// cache-bust: force recompile — 2026-02-10
import React, { useEffect, useRef, useState } from 'react';
import { 
  DollarSign, 
  Clock, 
  Star, 
  ShieldCheck,
  Fuel, 
  Wrench, 
  AlertTriangle,
  Loader2,
  Trophy
} from "lucide-react";
import { Trip, FuelLog, ServiceRequest, DriverMetrics, TierConfig, FinancialTransaction, QuotaConfig, DriverGoals } from '../../types/data';
import { RoutePoint, TripStop } from '../../types/tripSession';
import { toast } from 'sonner';
import { FuelLogForm } from './FuelLogForm';
import { ServiceRequestForm } from './ServiceRequestForm';
import { ManualTripForm } from '../trips/ManualTripForm';
import { TripFareDialog, type TripFareInitialData } from '../trips/TripFareDialog';
import { TripTimer } from '../trips/TripTimer';
import { DriverMintHome } from '../home/DriverMintHome';
import { useDriver } from '../../contexts/DriverContext';
import { createManualTrip, ManualTripInput } from '../../utils/tripFactory';
import { useAuth } from '../../contexts/AuthContext';
import { useCurrentDriver } from '../../hooks/useCurrentDriver';
import { projectId, publicAnonKey } from '../../utils/supabase/info';
import { API_ENDPOINTS } from '../../services/apiConfig';
import { api } from '../../services/api';
import { fuelService } from '../../services/fuelService';
import { settlementService } from '../../services/settlementService';
import { FuelEntry } from '../../types/fuel';
import { showCatalogGateToastIfApplicable } from '../../utils/catalogGateErrors';
import { PendingCatalogRequestsDrawer } from '../vehicles/PendingCatalogRequestsDrawer';
import { tierService } from '../../services/tierService';
import { TierCalculations } from '../../utils/tierCalculations';
import { generateMonthlyProjection } from '../tiers/quota-utils';
import { format, isSameWeek } from "date-fns";
import { DriverOverview } from './DriverOverview';
import { formatSafeDate, formatSafeTime } from '../../utils/timeUtils';
import { resolveMissingTripAddresses } from '../../utils/addressResolver';
import { getDriverPortalTripEarnings } from '../../utils/tripEarnings';
type DriverDashboardProps = {
  onNavigate?: (page: string) => void;
};

export function DriverDashboard({ onNavigate }: DriverDashboardProps = {}) {
  const { user } = useAuth();
  const { isIndependentDriver } = useDriver();
  const { driverRecord, loading: driverLoading } = useCurrentDriver();
  const [fuelFormOpen, setFuelFormOpen] = useState(false);
  const [serviceFormOpen, setServiceFormOpen] = useState(false);
  const [manualTripFormOpen, setManualTripFormOpen] = useState(false);
  const [fareDialogOpen, setFareDialogOpen] = useState(false);

  // Drawer used by the catalog-gate toast action so a driver can see exactly
  // which vehicle is parked and why. Read-only - drivers can't approve.
  const [pendingDrawerOpen, setPendingDrawerOpen] = useState(false);
  
  const [metrics, setMetrics] = useState<DriverMetrics | null>(null);
  const [todayEarnings, setTodayEarnings] = useState<{
    total: number;
    breakdown: {
      uber: number;
      indrive: number;
      roam: number;
    };
  }>({
    total: 0,
    breakdown: { uber: 0, indrive: 0, roam: 0 }
  });
  const [goals, setGoals] = useState<DriverGoals | null>(null);
  const [recentTrip, setRecentTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const hasLoadedDashboardRef = useRef(false);
  const [debugDrivers, setDebugDrivers] = useState<any[]>([]);
  const [unclaimedTripIds, setUnclaimedTripIds] = useState<string[]>([]);
  const [isFixing, setIsFixing] = useState<string | null>(null);
  const [flaggedCount, setFlaggedCount] = useState(0);

  // Trip Timer State
  const [tripInitialData, setTripInitialData] = useState<TripFareInitialData | undefined>(undefined);

  // Phase 2: Tier State
  const [tierState, setTierState] = useState<{
      current: TierConfig | null;
      next: TierConfig | null;
      progress: number;
      cumulativeEarnings: number;
  }>({
      current: null,
      next: null,
      progress: 0,
      cumulativeEarnings: 0
  });

  useEffect(() => {
    let mounted = true;
    if (!user || driverLoading) return;

    if (isIndependentDriver) {
      setLoading(false);
      hasLoadedDashboardRef.current = true;
      return;
    }

    const fetchData = async () => {
      // Safety timeout to prevent infinite loading
      const timeoutId = setTimeout(() => {
        if (mounted) setLoading(false);
      }, 5000);

      try {
        if (!hasLoadedDashboardRef.current) {
          setLoading(true);
        }
        
        // Helper to fetch trips specifically for this driver (User ID + Legacy ID)
        const fetchDriverTrips = async () => {
             const limit = 300;
             const p1 = api.getTripsFiltered({ driverId: user.id, limit }).then(r => r.data).catch(() => []);
             const promises = [p1];
             
             // If legacy ID exists and is different
             if (driverRecord?.driverId && driverRecord.driverId !== user.id) {
                 promises.push(api.getTripsFiltered({ driverId: driverRecord.driverId, limit }).then(r => r.data).catch(() => []));
             }
             
             const results = await Promise.all(promises);
             const combined = results.flat();
             // Dedup by ID
             return Array.from(new Map(combined.map(t => [t.id, t])).values());
        };

        // 1. Fetch EVERYTHING in parallel
        const [
            allMetrics, 
            drivers, 
            flaggedTx, 
            myTrips, 
            tiers, 
            quotaConfig
        ] = await Promise.all([
            api.getDriverMetrics().catch(() => []),
            api.getDrivers().catch(() => []),
            api.getFlaggedTransactions().catch(() => []),
            fetchDriverTrips(),
            tierService.getTiers().catch(() => []),
            tierService.getQuotaSettings().catch(() => null)
        ]);

        if (!mounted) return;

        const myMetrics = allMetrics.find(m => 
            m.driverId === user.id || 
            (driverRecord?.id && m.driverId === driverRecord.id) ||
            (driverRecord?.driverId && m.driverId === driverRecord.driverId)
        );
        if (myMetrics) setMetrics(myMetrics);
        setDebugDrivers(drivers);

        const myFlagged = flaggedTx.filter((tx: any) => 
            tx.driverId === user.id || 
            (driverRecord?.id && tx.driverId === driverRecord.id)
        );
        setFlaggedCount(myFlagged.length);

        clearTimeout(timeoutId);
        setLoading(false);
        hasLoadedDashboardRef.current = true;

        // Defer heavy trip math so login UI stays responsive (fleet drivers with large histories)
        const processTrips = () => {
            if (!mounted) return;

            const today = new Date().toISOString().split('T')[0];
            const now = new Date();

            const todayTrips = myTrips.filter(t => t.date.startsWith(today));
            const todaySum = todayTrips.reduce((sum, t) => sum + getDriverPortalTripEarnings(t), 0);

            const weeklyTrips = myTrips.filter(t => isSameWeek(new Date(t.date), now, { weekStartsOn: 1 }));
            const weeklyBreakdown = { uber: 0, indrive: 0, roam: 0 };
            const weeklySumForBreakdown = weeklyTrips.reduce((sum, t) => sum + getDriverPortalTripEarnings(t), 0);

            weeklyTrips.forEach(t => {
                const amount = getDriverPortalTripEarnings(t);
                const platform = (t.platform || '').toLowerCase();
                if (platform === 'uber') {
                    weeklyBreakdown.uber += amount;
                } else if (platform === 'indrive') {
                    weeklyBreakdown.indrive += amount;
                } else {
                    weeklyBreakdown.roam += amount;
                }
            });

            setTodayEarnings({ total: weeklySumForBreakdown, breakdown: weeklyBreakdown });

            const weeklySum = weeklySumForBreakdown;
            const monthlyEarnings = TierCalculations.calculateMonthlyEarnings(myTrips);
            const currentTier = TierCalculations.getTierForEarnings(monthlyEarnings, tiers);
            const nextTier = TierCalculations.getNextTier(currentTier, tiers);
            const progress = TierCalculations.calculateProgress(monthlyEarnings, currentTier);

            try {
                if (quotaConfig?.weekly?.enabled) {
                    const weeklyAmount = quotaConfig.weekly.amount || 0;
                    const workingDaysCount = quotaConfig.weekly.workingDays?.length || 5;
                    const dailyTarget = workingDaysCount > 0 ? weeklyAmount / workingDaysCount : 0;
                    const monthlyProjections = generateMonthlyProjection(weeklyAmount, workingDaysCount);
                    const currentMonthName = format(now, 'MMMM');
                    const monthlyTarget =
                        monthlyProjections.find(m => m.monthName === currentMonthName)?.target || 0;

                    setGoals({
                        daily: { current: todaySum, target: dailyTarget },
                        weekly: { current: weeklySum, target: weeklyAmount },
                        monthly: { current: monthlyEarnings, target: monthlyTarget },
                    });
                }
            } catch (e) {
                console.error('Failed to calculate quota goals', e);
            }

            setTierState({
                current: currentTier,
                next: nextTier,
                progress,
                cumulativeEarnings: monthlyEarnings,
            });

            if (myTrips.length > 0) {
                const sorted = [...myTrips].sort(
                    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
                );
                setRecentTrip(sorted[0]);

                resolveMissingTripAddresses(myTrips)
                    .then(resolved => {
                        if (resolved.length > 0) {
                            console.log(`[Dashboard] Resolved ${resolved.length} trip addresses in background.`);
                        }
                    })
                    .catch(err => console.error('Background address resolution failed:', err));
            }
        };

        if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(processTrips, { timeout: 2000 });
        } else {
            setTimeout(processTrips, 0);
        }

      } catch (error) {
        console.error("Error fetching driver data:", error);
      } finally {
        clearTimeout(timeoutId);
        if (mounted && !hasLoadedDashboardRef.current) {
          setLoading(false);
          hasLoadedDashboardRef.current = true;
        }
      }
    };

    fetchData();
    
    return () => { mounted = false; };
  }, [user?.id, driverRecord?.id, driverRecord?.driverId, driverLoading, isIndependentDriver]);

  const handleAction = (action: string) => {
    if (action === 'Fuel Log' || action === 'log_fuel') {
        setFuelFormOpen(true);
    } else if (action === 'Service Request' || action === 'Issue Report' || action === 'request_service') {
        setServiceFormOpen(true);
    } else if (action === 'Log Trip' || action === 'start_trip') {
        setTripInitialData(undefined); // Clear any previous timer data
        setManualTripFormOpen(true);
    } else {
        toast.success(`${action} flow started`, {
            description: "This feature is coming soon."
        });
    }
  };

  const handleTripComplete = (data: {
    startTime: string;
    endTime: string;
    duration: number;
    startDate: string;
    startLocation?: string;
    pickupCoords?: { lat: number; lon: number };
    endLocation?: string;
    dropoffCoords?: { lat: number; lon: number };
    route?: RoutePoint[];
    stops?: TripStop[];
    totalWaitTime?: number;
    distance?: number;
    isOffline?: boolean;
  }) => {
    setTripInitialData({
      date: data.startDate,
      time: data.startTime,
      endTime: data.endTime,
      duration: data.duration,
      pickupLocation: data.startLocation,
      endLocation: data.endLocation,
      pickupCoords: data.pickupCoords,
      dropoffCoords: data.dropoffCoords,
      route: data.route,
      stops: data.stops,
      totalWaitTime: data.totalWaitTime,
      distance: data.distance,
      isOffline: data.isOffline,
      resolutionMethod: (data as { resolutionMethod?: TripFareInitialData['resolutionMethod'] })
        .resolutionMethod,
      geocodeError: (data as { geocodeError?: string }).geocodeError,
    });
    setFareDialogOpen(true);
  };

  const handleManualTripSubmit = async (data: ManualTripInput) => {
    if (!user?.id) return;

    try {
      const trip = createManualTrip(data, user.id, driverRecord?.name || user.email);
      await api.saveTrips([trip]);

      toast.success("Trip Logged Successfully", {
        description: `$${data.amount} on ${data.date}`
      });
      
      // Force refresh data
      setTimeout(() => window.location.reload(), 1000);
      
    } catch (e: any) {
      console.error("Failed to save manual trip", e);
      const handled = showCatalogGateToastIfApplicable(e, {
        actionLabel: 'View pending requests',
        onAction: () => setPendingDrawerOpen(true),
      });
      if (!handled) toast.error(e.message || "Failed to save trip");
    }
  };

  const handleFuelSubmit = async (data: Partial<FuelLog>) => {
      try {
          // @ts-ignore - receiving custom field from form
          const method = data.paymentMethod || 'reimbursement';
          
          let entryMode: 'Anchor' | 'Floating' = data.odometer ? 'Anchor' : 'Floating';
          let paymentSource: any = 'Personal';

          if (method === 'reimbursement') {
              paymentSource = 'RideShare_Cash';
          } else if (method === 'card') {
              paymentSource = 'Gas_Card';
          } else if (method === 'personal') {
              paymentSource = 'Personal';
          }

          // 1. Save Fuel Entry (Core Record)
          const fuelEntry: Partial<FuelEntry> = {
              id: crypto.randomUUID(),
              date: data.date || new Date().toISOString(),
              driverId: user?.id,
              vehicleId: driverRecord?.assignedVehicleId || driverRecord?.vehicleId || data.vehicleId,
              amount: data.totalCost || 0,
              liters: data.liters || 0,
              pricePerLiter: (data.totalCost && data.liters) ? (data.totalCost / data.liters) : 0,
              odometer: data.odometer || null,
              location: data.notes || 'Fuel Refill',
              type: method === 'card' ? 'Card_Transaction' : 'Manual_Entry',
              entryMode: entryMode,
              paymentSource: paymentSource,
              source: 'Driver Portal',
              geofenceMetadata: (data as any).geofenceMetadata,
              deviationReason: (data as any).deviationReason
          } as any;

          const savedEntry = await fuelService.saveFuelEntry(fuelEntry as FuelEntry);

          // 2. Process Settlement (Financial Ledger)
          const scenarios = await fuelService.getFuelScenarios();
          await settlementService.processFuelSettlement(savedEntry, scenarios);
          
          const successMsg = paymentSource === 'RideShare_Cash' 
                ? "Fuel logged and cash liability reduced!" 
                : "Fuel log saved successfully!";

          toast.success(successMsg, {
              description: `Logged ${data.liters}L at ${data.odometer || 'Legacy'}km.`
          });

          // Refresh dashboard to show new balance
          setTimeout(() => window.location.reload(), 1500);
      } catch (e) {
          console.error("Failed to save fuel log", e);
          // If the server rejected because the assigned vehicle is parked,
          // surface a clear toast with a deep-link to the pending requests
          // drawer so the driver can see exactly which vehicle is blocked.
          showCatalogGateToastIfApplicable(e, {
            actionLabel: 'View pending requests',
            onAction: () => setPendingDrawerOpen(true),
          });
          // Re-throw so FuelLogForm keeps the dialog open with driver's data intact
          throw e;
      }
  };

  const handleServiceSubmit = async (data: Partial<ServiceRequest>) => {
      // Create a pending transaction for Service/Maintenance request
      try {
          const newTx: Partial<FinancialTransaction> = {
            id: crypto.randomUUID(),
            driverId: user?.id,
            driverName: driverRecord?.name || user?.email,
            date: data.date || new Date().toISOString(),
            time: undefined,
            type: 'Expense',
            category: 'Maintenance',
            amount: 0, // Placeholder
            description: `${data.type}: ${data.description}`,
            status: 'Pending',
            paymentMethod: 'Cash',
            notes: `Priority: ${data.priority}`,
            odometer: data.odometer,
            // Unified Timeline Metadata
            source: 'Service Request',
            isVerified: true
          } as any;

          await api.saveTransaction(newTx);
          toast.success("Service request submitted!", {
              description: "A fleet manager will review your request shortly."
          });
      } catch (e) {
          console.error(e);
          toast.error("Failed to submit request");
      }
  };

  const handleClaimId = async (id: string) => {
      if (!driverRecord) return;
      
      const confirm = window.confirm(`Confirm Link: This will connect your account to Legacy ID: ${id}`);
      if (!confirm) return;

      setIsFixing(id);
      try {
          const updatedDriver = { ...driverRecord, driverId: id };
          await api.saveDriver(updatedDriver);
          toast.success("Identity Linked Successfully", {
              description: "Refreshing dashboard..."
          });
          // Force reload to pick up changes
          setTimeout(() => window.location.reload(), 1500);
      } catch (err) {
          console.error("Failed to link identity", err);
          setIsFixing(null);
          toast.error("Failed to Link Identity", {
              description: "Please ask your admin to manually set your Legacy ID to " + id
          });
      }
  };

  if (isIndependentDriver) {
    return <DriverMintHome />;
  }

  return (
    <div className="relative flex min-h-0 flex-col gap-6 pb-2">
      {loading && !hasLoadedDashboardRef.current && (
        <div className="flex justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      )}

      <div
        className={
          loading && !hasLoadedDashboardRef.current
            ? 'hidden'
            : 'flex min-h-[calc(100dvh-10.5rem-env(safe-area-inset-bottom,0px))] flex-col gap-6'
        }
      >
            <DriverOverview
                className="shrink-0"
                tierState={tierState}
                metrics={metrics}
                todayEarnings={todayEarnings}
                goals={goals}
                recentTrip={recentTrip}
                driverRecord={driverRecord}
                loading={loading}
                unclaimedTripIds={unclaimedTripIds}
                debugDrivers={debugDrivers}
                isFixing={isFixing}
                onClaimId={handleClaimId}
                onAction={handleAction}
                flaggedCount={flaggedCount}
              />

            <TripTimer onComplete={handleTripComplete} />
      </div>

      <FuelLogForm 
        open={fuelFormOpen} 
        onOpenChange={setFuelFormOpen} 
        onSubmit={handleFuelSubmit} 
      />

      <ServiceRequestForm 
        open={serviceFormOpen} 
        onOpenChange={setServiceFormOpen} 
        onSubmit={handleServiceSubmit} 
      />

      <TripFareDialog
        open={fareDialogOpen}
        onClose={() => setFareDialogOpen(false)}
        initialData={tripInitialData}
        defaultVehicleId={driverRecord?.assignedVehicleId || driverRecord?.vehicleId || driverRecord?.vehicle}
        onSubmit={handleManualTripSubmit}
      />

      <ManualTripForm
        open={manualTripFormOpen}
        onOpenChange={setManualTripFormOpen}
        onSubmit={handleManualTripSubmit}
        isAdmin={false}
        defaultVehicleId={driverRecord?.assignedVehicleId || driverRecord?.vehicleId || driverRecord?.vehicle}
        initialData={
          tripInitialData
            ? {
                date: tripInitialData.date,
                time: tripInitialData.time,
                endTime: tripInitialData.endTime,
                duration: tripInitialData.duration,
                pickupLocation: tripInitialData.pickupLocation,
                endLocation: tripInitialData.endLocation,
                pickupCoords: tripInitialData.pickupCoords,
                dropoffCoords: tripInitialData.dropoffCoords,
                route: tripInitialData.route,
                stops: tripInitialData.stops,
                totalWaitTime: tripInitialData.totalWaitTime,
                distance: tripInitialData.distance,
              }
            : undefined
        }
      />

      <PendingCatalogRequestsDrawer
        open={pendingDrawerOpen}
        onOpenChange={setPendingDrawerOpen}
        // Drivers can't navigate into VehicleDetail; the drawer stays purely
        // informational so they can read the admin message and the linked plate.
        onOpenVehicle={undefined}
      />
    </div>
  );
}