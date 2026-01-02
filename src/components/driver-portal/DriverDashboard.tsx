import React, { useEffect, useState } from 'react';
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
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
import { Trip, FuelLog, ServiceRequest, DriverMetric, TierConfig, FinancialTransaction, QuotaConfig, DriverGoals } from '../../types/data';
import { toast } from 'sonner@2.0.3';
import { FuelLogForm } from './FuelLogForm';
import { ServiceRequestForm } from './ServiceRequestForm';
import { ManualTripForm } from '../trips/ManualTripForm';
import { createManualTrip, ManualTripInput } from '../../utils/tripFactory';
import { useAuth } from '../auth/AuthContext';
import { useCurrentDriver } from '../../hooks/useCurrentDriver';
import { projectId, publicAnonKey } from '../../utils/supabase/info';
import { api } from '../../services/api';
import { tierService } from '../../services/tierService';
import { TierCalculations } from '../../utils/tierCalculations';
import { generateMonthlyProjection } from '../tiers/quota-utils';
import { format, isSameWeek } from "date-fns";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";
import { DriverOverview } from './DriverOverview';
import { DriverHistory } from './DriverHistory';

export function DriverDashboard() {
  const { user } = useAuth();
  const { driverRecord, loading: driverLoading } = useCurrentDriver();
  const [fuelFormOpen, setFuelFormOpen] = useState(false);
  const [serviceFormOpen, setServiceFormOpen] = useState(false);
  const [manualTripFormOpen, setManualTripFormOpen] = useState(false);
  
  const [metrics, setMetrics] = useState<DriverMetric | null>(null);
  const [todayEarnings, setTodayEarnings] = useState(0);
  const [goals, setGoals] = useState<DriverGoals | null>(null);
  const [recentTrip, setRecentTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [debugDrivers, setDebugDrivers] = useState<any[]>([]);
  const [unclaimedTripIds, setUnclaimedTripIds] = useState<string[]>([]);
  const [isFixing, setIsFixing] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);

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
    if (!user || driverLoading) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        const headers = {
             'Content-Type': 'application/json',
             'Authorization': `Bearer ${publicAnonKey}`
        };

        // 1. Fetch Metrics
        const metricsRes = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-37f42386/driver-metrics`, { headers });
        if (metricsRes.ok) {
            const allMetrics: DriverMetric[] = await metricsRes.json();
            // Filter for current user or resolved driver (checking both ID and legacy driverId)
            const myMetrics = allMetrics.find(m => 
                m.driverId === user.id || 
                (driverRecord?.id && m.driverId === driverRecord.id) ||
                (driverRecord?.driverId && m.driverId === driverRecord.driverId)
            );
            if (myMetrics) setMetrics(myMetrics);
        }

        // 2. Fetch Trips for Earnings & Recent Activity
        const tripsRes = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-37f42386/trips`, { headers });
        if (tripsRes.ok) {
            const allTrips: Trip[] = await tripsRes.json();
            // Filter for current user or resolved driver
            const myTrips = allTrips.filter(t => 
                t.driverId === user.id || 
                (driverRecord?.id && t.driverId === driverRecord.id) ||
                (driverRecord?.driverId && t.driverId === driverRecord.driverId)
            );
            
            // Calculate Today's Earnings
            const today = new Date().toISOString().split('T')[0];
            const now = new Date();
            const todaySum = myTrips
                .filter(t => t.date.startsWith(today))
                .reduce((sum, t) => sum + (t.netPayout || t.amount || 0), 0);
            setTodayEarnings(todaySum);

            // Calculate Weekly Earnings
            const weeklySum = myTrips
                .filter(t => isSameWeek(new Date(t.date), now, { weekStartsOn: 1 }))
                .reduce((sum, t) => sum + (t.netPayout || t.amount || 0), 0);

            // Phase 2: Tier Calculation (Monthly Reset Logic)
            const monthlyEarnings = TierCalculations.calculateMonthlyEarnings(myTrips);
            const tiers = await tierService.getTiers();
            const currentTier = TierCalculations.getTierForEarnings(monthlyEarnings, tiers);
            const nextTier = TierCalculations.getNextTier(currentTier, tiers);
            const progress = TierCalculations.calculateProgress(monthlyEarnings, currentTier);
            
            // Calculate Quota Goals
            try {
                const quotaConfig = await tierService.getQuotaSettings();
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

            // Calculate History
            const historyData = TierCalculations.getMonthlyHistory(myTrips, tiers);
            setHistory(historyData);

            setTierState({
                current: currentTier,
                next: nextTier,
                progress: progress,
                cumulativeEarnings: monthlyEarnings
            });

            // Get Most Recent Trip
            if (myTrips.length > 0) {
                // Sort desc
                myTrips.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                setRecentTrip(myTrips[0]);
            }
        }

      } catch (error) {
        console.error("Error fetching driver data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user?.id, driverRecord?.id, driverRecord?.driverId, driverLoading]);

  const handleAction = (action: string) => {
    if (action === 'Fuel Log') {
        setFuelFormOpen(true);
    } else if (action === 'Service Request' || action === 'Issue Report') {
        setServiceFormOpen(true);
    } else if (action === 'Log Trip') {
        setManualTripFormOpen(true);
    } else {
        toast.success(`${action} flow started`, {
            description: "This feature is coming soon."
        });
    }
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
      // We can achieve this by triggering the useEffect dependency or manually recalling logic.
      // For simplicity, we'll reload the page or we could extract fetch logic.
      // Ideally, extract fetch logic, but for now let's just use window.location.reload() 
      // or duplicate the state update if simple.
      // Since Dashboard logic is complex, a reload is safest until refactor.
      setTimeout(() => window.location.reload(), 1000);
      
    } catch (e: any) {
      console.error("Failed to save manual trip", e);
      toast.error(e.message || "Failed to save trip");
    }
  };

  const handleFuelSubmit = async (data: Partial<FuelLog>) => {
      try {
          const newTx: Partial<FinancialTransaction> = {
            id: crypto.randomUUID(),
            driverId: user?.id,
            driverName: driverRecord?.name || user?.email,
            date: data.date || new Date().toISOString(),
            time: format(new Date(), 'HH:mm:ss'),
            type: 'Expense',
            category: 'Fuel',
            amount: -Math.abs(data.totalCost || 0),
            description: data.notes || `Fuel Refill: ${data.liters}L`,
            status: 'Pending',
            paymentMethod: 'Cash',
            quantity: data.liters,
            odometer: data.odometer,
            receiptUrl: data.receiptUrl
          };

          await api.saveTransaction(newTx);
          toast.success("Fuel log saved successfully!", {
              description: `Logged ${data.liters}L at ${data.odometer}km.`
          });
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
            time: format(new Date(), 'HH:mm:ss'),
            type: 'Expense',
            category: 'Maintenance',
            amount: 0, // Placeholder
            description: `${data.type}: ${data.description}`,
            status: 'Pending',
            paymentMethod: 'Cash',
            notes: `Priority: ${data.priority}`
          };

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
    <div className="space-y-6">
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview">
          <DriverOverview 
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
          />
        </TabsContent>
        
        <TabsContent value="history">
          <DriverHistory history={history} loading={loading} />
        </TabsContent>
      </Tabs>

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
        defaultVehicleId={driverRecord?.vehicle}
      />
    </div>
  );
}
