// cache-bust: force recompile — 2026-02-10
import React, { useEffect, useState } from 'react';
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
import { toast } from 'sonner@2.0.3';
import { FuelLogForm } from './FuelLogForm';
import { ServiceRequestForm } from './ServiceRequestForm';
import { ManualTripForm } from '../trips/ManualTripForm';
import { TripTimer } from '../trips/TripTimer';
import { createManualTrip, ManualTripInput } from '../../utils/tripFactory';
import { useAuth } from '../auth/AuthContext';
import { useCurrentDriver } from '../../hooks/useCurrentDriver';
import { projectId, publicAnonKey } from '../../utils/supabase/info';
import { API_ENDPOINTS } from '../../services/apiConfig';
import { api } from '../../services/api';
import { fuelService } from '../../services/fuelService';
import { settlementService } from '../../services/settlementService';
import { FuelEntry } from '../../types/fuel';
import { tierService } from '../../services/tierService';
import { TierCalculations } from '../../utils/tierCalculations';
import { generateMonthlyProjection } from '../tiers/quota-utils';
import { format, isSameWeek } from "date-fns";
import { DriverOverview } from './DriverOverview';
import { formatSafeDate, formatSafeTime } from '../../utils/timeUtils';
import { resolveMissingTripAddresses } from '../../utils/addressResolver';

export function DriverDashboard() {
  const { user } = useAuth();
  const { driverRecord, loading: driverLoading } = useCurrentDriver();
  const [fuelFormOpen, setFuelFormOpen] = useState(false);
  const [serviceFormOpen, setServiceFormOpen] = useState(false);
  const [manualTripFormOpen, setManualTripFormOpen] = useState(false);
  
  const [metrics, setMetrics] = useState<DriverMetrics | null>(null);
  const [todayEarnings, setTodayEarnings] = useState<{
    total: number;
    breakdown: {
      uber: number;
      indrive: number;
      goride: number;
    };
  }>({
    total: 0,
    breakdown: { uber: 0, indrive: 0, goride: 0 }
  });
  const [goals, setGoals] = useState<DriverGoals | null>(null);
  const [recentTrip, setRecentTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [debugDrivers, setDebugDrivers] = useState<any[]>([]);
  const [unclaimedTripIds, setUnclaimedTripIds] = useState<string[]>([]);
  const [isFixing, setIsFixing] = useState<string | null>(null);
  const [flaggedCount, setFlaggedCount] = useState(0);

  // Trip Timer State
  const [tripInitialData, setTripInitialData] = useState<{
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
    isLiveRecorded?: boolean;
  } | undefined>(undefined);

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
    // Debug fetch if no data found
    if (!loading && !metrics && !recentTrip) {
        // Fetch drivers
        api.getDrivers().then(drivers => {
            setDebugDrivers(drivers);
        }).catch(e => console.error("Debug fetch failed", e));

        // Scan for existing trip IDs to help user find their legacy ID
        api.getTrips().then(trips => {
            const ids = Array.from(new Set(trips.map(t => t.driverId).filter(Boolean)));
            setUnclaimedTripIds(ids);
        }).catch(console.error);
    }
  }, [loading, metrics, recentTrip]);

  useEffect(() => {
    let mounted = true;
    if (!user || driverLoading) return;

    const fetchData = async () => {
      // Safety timeout to prevent infinite loading
      const timeoutId = setTimeout(() => {
        if (mounted) setLoading(false);
      }, 5000);

      try {
        setLoading(true);
        
        // Helper to fetch trips specifically for this driver (User ID + Legacy ID)
        const fetchDriverTrips = async () => {
             const limit = 1000; // Increase limit to ensure full month coverage for Tier Calculation
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

        const myMetrics = allMetrics.find(m => 
            m.driverId === user.id || 
            (driverRecord?.id && m.driverId === driverRecord.id) ||
            (driverRecord?.driverId && m.driverId === driverRecord.driverId)
        );
        if (myMetrics) setMetrics(myMetrics);
        setDebugDrivers(drivers);

        // Calculate Flagged Count for this driver
        const myFlagged = flaggedTx.filter((tx: any) => 
            tx.driverId === user.id || 
            (driverRecord?.id && tx.driverId === driverRecord.id)
        );
        setFlaggedCount(myFlagged.length);

        // 2. Process Trips for Earnings
        // myTrips is already filtered and fetched for this driver
            
            // Calculate Today's Earnings (for Goals)
            const today = new Date().toISOString().split('T')[0];
            const now = new Date();
            
            const todayTrips = myTrips.filter(t => t.date.startsWith(today));
            const todaySum = todayTrips.reduce((sum, t) => sum + (t.netPayout || t.amount || 0), 0);

            // Calculate Weekly Earnings Breakdown (for Display Cards)
            const weeklyTrips = myTrips.filter(t => isSameWeek(new Date(t.date), now, { weekStartsOn: 1 }));
            const weeklyBreakdown = { uber: 0, indrive: 0, goride: 0 };
            const weeklySumForBreakdown = weeklyTrips.reduce((sum, t) => sum + (t.netPayout || t.amount || 0), 0);

            weeklyTrips.forEach(t => {
                const amount = t.netPayout || t.amount || 0;
                
                const platform = (t.platform || '').toLowerCase();
                if (platform === 'uber') {
                    weeklyBreakdown.uber += amount;
                } else if (platform === 'indrive') {
                    weeklyBreakdown.indrive += amount;
                } else {
                    // GoRide includes Private, Cash, Other, and implicit app trips
                    weeklyBreakdown.goride += amount;
                }
            });

            setTodayEarnings({ total: weeklySumForBreakdown, breakdown: weeklyBreakdown });

            // Calculate Weekly Earnings (for Goals)
            const weeklySum = weeklySumForBreakdown;

            // Phase 2: Tier Calculation (Monthly Reset Logic)
            const monthlyEarnings = TierCalculations.calculateMonthlyEarnings(myTrips);
            // tiers already fetched
            const currentTier = TierCalculations.getTierForEarnings(monthlyEarnings, tiers);
            const nextTier = TierCalculations.getNextTier(currentTier, tiers);
            const progress = TierCalculations.calculateProgress(monthlyEarnings, currentTier);
            
            // Calculate Quota Goals
            try {
                // quotaConfig already fetched
                if (quotaConfig && quotaConfig.weekly && quotaConfig.weekly.enabled) {
                    const weeklyAmount = quotaConfig.weekly.amount || 0;
                    const workingDaysCount = quotaConfig.weekly.workingDays?.length || 5;
                    
                    const dailyTarget = workingDaysCount > 0 ? weeklyAmount / workingDaysCount : 0;
                    
                    // Monthly Target (Specific to current month)
                    const monthlyProjections = generateMonthlyProjection(weeklyAmount, workingDaysCount);
                    const currentMonthName = format(now, 'MMMM');
                    const monthlyTarget = monthlyProjections.find(m => m.monthName === currentMonthName)?.target || 0;

                    setGoals({
                        daily: { current: todaySum, target: dailyTarget },
                        weekly: { current: weeklySum, target: weeklyAmount },
                        monthly: { current: monthlyEarnings, target: monthlyTarget }
                    });
                }
            } catch (e) {
                console.error("Failed to calculate quota goals", e);
            }

            setTierState({
                current: currentTier,
                next: nextTier,
                progress: progress,
                cumulativeEarnings: monthlyEarnings
            });

            if (myTrips.length > 0) {
                // Sort desc
                myTrips.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                setRecentTrip(myTrips[0]);

                // Phase 1 Fix: Background Address Resolution
                // If we found trips for this driver, check if any need address resolution
                resolveMissingTripAddresses(myTrips).then(resolved => {
                    if (resolved.length > 0) {
                        console.log(`[Dashboard] Resolved ${resolved.length} trip addresses in background.`);
                        // Optionally refresh specific local state if needed, 
                        // but since it's background and saved to API, 
                        // next refresh or specific UI updates will pick it up.
                    }
                }).catch(err => console.error("Background address resolution failed:", err));
            }

      } catch (error) {
        console.error("Error fetching driver data:", error);
      } finally {
        clearTimeout(timeoutId);
        if (mounted) setLoading(false);
      }
    };

    fetchData();
    
    return () => { mounted = false; };
  }, [user?.id, driverRecord?.id, driverRecord?.driverId, driverLoading]);

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
      startTime: data.startTime,
      endTime: data.endTime,
      duration: data.duration,
      startDate: data.startDate, // Rename for form mapping
      date: data.startDate, // Add date field for ManualTripForm mapping
      time: data.startTime, // Add time field for ManualTripForm mapping
      pickupLocation: data.startLocation,
      pickupCoords: data.pickupCoords,
      endLocation: data.endLocation, // Pass through
      dropoffCoords: data.dropoffCoords, // Pass through
      route: data.route,
      stops: data.stops,
      totalWaitTime: data.totalWaitTime,
      distance: data.distance,
      isOffline: data.isOffline,
      isLiveRecorded: true
    } as any);
    setManualTripFormOpen(true);
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
      toast.error(e.message || "Failed to save trip");
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
          toast.error("Failed to save fuel log");
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

  if (loading) {
      return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>;
  }

  return (
    <div className="flex flex-col min-h-[75vh] gap-6 pb-6">
            <DriverOverview 
              className="flex-1"
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

      <ManualTripForm
        open={manualTripFormOpen}
        onOpenChange={setManualTripFormOpen}
        onSubmit={handleManualTripSubmit}
        isAdmin={false}
        defaultVehicleId={driverRecord?.assignedVehicleId || driverRecord?.vehicleId || driverRecord?.vehicle}
        initialData={tripInitialData}
      />
    </div>
  );
}