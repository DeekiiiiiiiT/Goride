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
  Loader2
} from "lucide-react";
import { Trip, FuelLog, ServiceRequest, DriverMetric } from '../../types/data';
import { toast } from 'sonner@2.0.3';
import { FuelLogForm } from './FuelLogForm';
import { ServiceRequestForm } from './ServiceRequestForm';
import { useAuth } from '../auth/AuthContext';
import { useCurrentDriver } from '../../hooks/useCurrentDriver';
import { projectId, publicAnonKey } from '../../utils/supabase/info';
import { api } from '../../services/api';

export function DriverDashboard() {
  const { user } = useAuth();
  const { driverRecord, loading: driverLoading } = useCurrentDriver();
  const [fuelFormOpen, setFuelFormOpen] = useState(false);
  const [serviceFormOpen, setServiceFormOpen] = useState(false);
  
  const [metrics, setMetrics] = useState<DriverMetric | null>(null);
  const [todayEarnings, setTodayEarnings] = useState(0);
  const [recentTrip, setRecentTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [debugDrivers, setDebugDrivers] = useState<any[]>([]);
  const [unclaimedTripIds, setUnclaimedTripIds] = useState<string[]>([]);
  const [isFixing, setIsFixing] = useState<string | null>(null);

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
            const todaySum = myTrips
                .filter(t => t.date.startsWith(today))
                .reduce((sum, t) => sum + (t.netPayout || t.amount || 0), 0);
            setTodayEarnings(todaySum);

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
    } else {
        toast.success(`${action} flow started`, {
            description: "This feature is coming soon."
        });
    }
  };

  const handleFuelSubmit = (data: Partial<FuelLog>) => {
      // In a real app, post to backend
      console.log("Saving Fuel Log:", data);
      toast.success("Fuel log saved successfully!", {
          description: `Logged ${data.liters}L at ${data.odometer}km.`
      });
  };

  const handleServiceSubmit = (data: Partial<ServiceRequest>) => {
      console.log("Submitting Service Request:", data);
      toast.success("Request submitted!", {
          description: "A fleet manager will review your request shortly."
      });
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
      {/* Sync Status Warning - Explains why screen might be blank */}
      {!metrics && !recentTrip && !loading && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                  <div>
                      <h4 className="font-semibold text-amber-900 text-sm">No Data Found</h4>
                      <p className="text-xs text-amber-700 mt-1">
                          We couldn't find any trips or metrics linked to <strong>{driverRecord?.driverName || driverRecord?.name || user?.email}</strong>.
                      </p>
                      <p className="text-xs text-amber-700 mt-2">
                          <strong>Troubleshooting:</strong><br/>
                          1. Ensure your name in the Admin Dashboard matches your profile name exactly.<br/>
                          2. Ask your fleet manager to check your Driver ID.<br/>
                          3. Current Resolved ID: <code className="bg-amber-100 px-1 rounded">{driverRecord?.id || 'N/A'}</code>
                      </p>

                      {/* Debug List */}
                      {debugDrivers.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-amber-200">
                             <p className="text-xs font-semibold text-amber-900 mb-1">System Debug - Available Drivers:</p>
                             <div className="max-h-40 overflow-y-auto bg-amber-100/50 p-2 rounded text-[10px] font-mono text-amber-900">
                                {debugDrivers.map(d => (
                                   <div key={d.id} className="mb-1 border-b border-amber-200/50 pb-1 last:border-0">
                                      <span className="font-bold">"{d.driverName || d.name}"</span> 
                                      <span className="opacity-75"> • ID: {d.id} • Legacy: {d.driverId}</span>
                                   </div>
                                ))}
                             </div>
                             <p className="text-[10px] text-amber-700 mt-1">
                                Comparing against profile name: <strong>"{user?.user_metadata?.name || user?.email}"</strong>
                             </p>
                          </div>
                      )}

                      {/* Unclaimed Trip IDs */}
                      {unclaimedTripIds.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-amber-200">
                             <p className="text-xs font-semibold text-amber-900 mb-1">Trip Data Found - Action Required:</p>
                             <div className="flex flex-wrap gap-2 items-center mt-1">
                                {unclaimedTripIds.slice(0, 20).map(id => (
                                   <div key={id} className="flex items-center gap-2 p-1 bg-white border border-amber-300 rounded shadow-sm">
                                       <span className="text-xs font-mono font-bold text-slate-700">
                                           {id.slice(0, 8)}...
                                       </span>
                                       {driverRecord && id !== driverRecord.driverId && (
                                           <Button 
                                             size="sm"
                                             variant="destructive"
                                             onClick={() => handleClaimId(id)}
                                             disabled={!!isFixing}
                                             className="h-6 text-[10px] px-2"
                                           >
                                             {isFixing === id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Link Identity"}
                                           </Button>
                                       )}
                                   </div>
                                ))}
                                {unclaimedTripIds.length > 20 && <span className="text-[10px] text-amber-700 self-center">...and {unclaimedTripIds.length - 20} more</span>}
                             </div>
                             <p className="text-[10px] text-amber-900 mt-2 font-medium">
                                Your account is currently pointing to an empty Legacy ID ({driverRecord?.driverId?.slice(0,8)}...).
                                <br/>
                                Click the red <span className="text-red-600 font-bold">"Link Identity"</span> button above to connect your account to the found data.
                             </p>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* Today's Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
             <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center mb-2">
                <DollarSign className="h-5 w-5 text-emerald-600" />
             </div>
             <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                ${todayEarnings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
             </span>
             <span className="text-xs text-slate-500">Earned Today</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
             <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center mb-2">
                <Clock className="h-5 w-5 text-blue-600" />
             </div>
             <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {metrics?.hoursOnline || 0}h
             </span>
             <span className="text-xs text-slate-500">Online Hours</span>
          </CardContent>
        </Card>
      </div>

      {/* Metrics Row */}
      <div className="flex items-center justify-between px-2 py-3 bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
         <div className="flex flex-col items-center flex-1 border-r border-slate-100 dark:border-slate-800">
            <span className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {metrics?.ratingLast500 || '5.0'}
            </span>
            <div className="flex items-center text-amber-400 text-xs">
               <Star className="h-3 w-3 fill-current" />
               <span className="ml-1 text-slate-500">Rating</span>
            </div>
         </div>
         <div className="flex flex-col items-center flex-1 border-r border-slate-100 dark:border-slate-800">
            <span className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {metrics ? (metrics.cancellationRate * 100).toFixed(0) : 0}%
            </span>
            <span className="text-xs text-slate-500">Cancel Rate</span>
         </div>
         <div className="flex flex-col items-center flex-1">
            <span className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {metrics ? (metrics.acceptanceRate * 100).toFixed(0) : 0}%
            </span>
            <span className="text-xs text-slate-500">Acceptance</span>
         </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-3">
         <button 
           onClick={() => handleAction('Fuel Log')}
           className="flex flex-col items-center justify-center p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm active:scale-95 transition-transform"
         >
            <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center mb-2">
               <Fuel className="h-5 w-5 text-orange-600" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Log Fuel</span>
         </button>
         <button 
           onClick={() => handleAction('Service Request')}
           className="flex flex-col items-center justify-center p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm active:scale-95 transition-transform"
         >
            <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center mb-2">
               <Wrench className="h-5 w-5 text-blue-600" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Service</span>
         </button>
         <button 
           onClick={() => handleAction('Issue Report')}
           className="flex flex-col items-center justify-center p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm active:scale-95 transition-transform"
         >
            <div className="h-10 w-10 rounded-full bg-rose-100 flex items-center justify-center mb-2">
               <AlertTriangle className="h-5 w-5 text-rose-600" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Report</span>
         </button>
      </div>

      {/* Recent Trip */}
      <div className="space-y-3">
        <h3 className="font-semibold text-slate-900 dark:text-slate-100">Last Trip</h3>
        {recentTrip ? (
            <Card>
            <CardContent className="p-4">
                <div className="flex justify-between items-start mb-4">
                    <Badge variant="secondary" className="bg-slate-100 text-slate-600">
                    {recentTrip.platform}
                    </Badge>
                    <span className="font-bold text-lg">${(recentTrip.netPayout || recentTrip.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="space-y-4 relative">
                    <div className="absolute left-[7px] top-2 bottom-6 w-0.5 bg-slate-200 dark:bg-slate-800 -z-10" />
                    
                    <div className="flex items-start gap-3">
                    <div className="h-4 w-4 rounded-full border-2 border-slate-300 bg-white mt-1 shrink-0" />
                    <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {recentTrip.pickupLocation}
                        </p>
                        <p className="text-xs text-slate-500">
                            {new Date(recentTrip.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </p>
                    </div>
                    </div>
                    <div className="flex items-start gap-3">
                    <div className="h-4 w-4 rounded-full border-2 border-indigo-600 bg-indigo-600 mt-1 shrink-0" />
                    <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {recentTrip.dropoffLocation}
                        </p>
                    </div>
                    </div>
                </div>
            </CardContent>
            </Card>
        ) : (
            <div className="text-center p-6 bg-slate-50 rounded-lg text-slate-500 text-sm">
                No trips recorded yet.
            </div>
        )}
      </div>

      {/* Action Banner */}
      <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-lg flex items-start gap-3">
         <ShieldCheck className="h-5 w-5 text-indigo-600 mt-0.5 shrink-0" />
         <div className="flex-1">
            <h4 className="font-semibold text-indigo-900 dark:text-indigo-100 text-sm">Vehicle Inspection Due</h4>
            <p className="text-xs text-indigo-700 dark:text-indigo-300 mt-1">Your annual vehicle inspection is due in 5 days.</p>
         </div>
         <Button size="sm" variant="outline" className="text-xs bg-white h-8" onClick={() => setServiceFormOpen(true)}>View</Button>
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
    </div>
  );
}
