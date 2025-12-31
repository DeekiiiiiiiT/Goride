import React from 'react';
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
import { Trip, DriverMetric, TierConfig } from '../../types/data';
import { TierCalculations } from '../../utils/tierCalculations';
import { useAuth } from '../auth/AuthContext';

interface DriverOverviewProps {
  tierState: {
    current: TierConfig | null;
    next: TierConfig | null;
    progress: number;
    cumulativeEarnings: number;
  };
  metrics: DriverMetric | null;
  todayEarnings: number;
  recentTrip: Trip | null;
  driverRecord: any;
  loading: boolean;
  unclaimedTripIds: string[];
  debugDrivers: any[];
  isFixing: string | null;
  onClaimId: (id: string) => void;
  onAction: (action: string) => void;
}

export function DriverOverview({
  tierState,
  metrics,
  todayEarnings,
  recentTrip,
  driverRecord,
  loading,
  unclaimedTripIds,
  debugDrivers,
  isFixing,
  onClaimId,
  onAction
}: DriverOverviewProps) {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      {/* Phase 2: Driver Home Screen Header */}
      {tierState.current && (
         <Card className="border-0 shadow-xl overflow-hidden relative">
             {/* Background with Gradient and Pattern */}
             <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-[#1e1b4b] to-slate-900 z-0" />
             
             {/* Decorative Elements */}
             <div className="absolute top-0 right-0 p-4 opacity-5 z-0">
                 <Trophy className="h-40 w-40 -rotate-12 text-white" />
             </div>
             <div className="absolute top-1/2 right-1/4 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

             <CardContent className="p-6 relative z-10">
                 <div className="flex flex-col gap-6">
                     
                     {/* Header Section */}
                     <div className="flex items-center gap-5">
                         {/* Avatar / Profile Image */}
                         <div className="h-16 w-16 rounded-full border-2 border-indigo-400/30 overflow-hidden bg-slate-800 shadow-lg shrink-0 flex items-center justify-center">
                             <span className="text-2xl font-bold text-indigo-200">
                                 {driverRecord?.name?.charAt(0) || user?.email?.charAt(0)}
                             </span>
                         </div>
                         
                         <div className="space-y-1">
                             <h2 className="text-3xl font-bold text-white tracking-tight">
                                 Welcome, {driverRecord?.name?.split(' ')[0] || 'Driver'}
                             </h2>
                             <div className="flex items-center gap-3">
                                 {/* Tier Badge - High Fidelity */}
                                 <div className="px-3 py-1 rounded-full bg-gradient-to-r from-amber-300 to-amber-500 text-slate-900 text-xs font-bold shadow-lg shadow-amber-500/20 flex items-center gap-1.5">
                                     <Trophy className="h-3 w-3 fill-slate-900 stroke-none" />
                                     {tierState.current.name} Tier
                                 </div>
                                 <span className="text-sm font-medium text-indigo-200/80 tracking-wide">
                                     {tierState.current.sharePercentage}% Profit Share
                                 </span>
                             </div>
                         </div>
                     </div>

                     {/* Progress Section */}
                     <div className="space-y-3 bg-white/5 rounded-2xl p-4 border border-white/10 backdrop-blur-sm">
                         <div className="flex justify-between items-end">
                             <div className="space-y-0.5">
                                 <span className="text-xs font-semibold text-indigo-200 uppercase tracking-wider">Next Monthly Milestone</span>
                                 <div className="flex items-baseline gap-2">
                                    <span className="text-lg font-bold text-white">
                                        {tierState.next?.name || 'Max Level'} Status
                                    </span>
                                    <span className="text-sm text-white/90 font-bold font-mono">
                                        {tierState.progress.toFixed(0)}%
                                    </span>
                                 </div>
                             </div>
                             <div className="text-right">
                                 <span className="text-xs text-indigo-200 block mb-0.5">Monthly Goal</span>
                                 <span className="text-sm font-bold text-white font-mono">
                                    {tierState.next ? TierCalculations.formatCurrency(tierState.next.minEarnings) : 'Goal Reached'}
                                 </span>
                             </div>
                         </div>

                         {/* High Visibility Progress Bar */}
                         <div className="relative h-3 w-full bg-slate-800/80 rounded-full overflow-hidden shadow-inner border border-white/5">
                             <div 
                                className="absolute top-0 left-0 h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(99,102,241,0.5)]"
                                style={{ width: `${tierState.next ? tierState.progress : 100}%` }}
                             />
                         </div>

                         <div className="flex justify-between text-[10px] font-semibold text-slate-300 uppercase tracking-wide">
                             <span>Current: {TierCalculations.formatCurrency(tierState.current.minEarnings)}</span>
                             <span>Target: {tierState.next ? TierCalculations.formatCurrency(tierState.next.minEarnings) : 'Max'}</span>
                         </div>
                     </div>
                 </div>
             </CardContent>
         </Card>
      )}

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
                                             onClick={() => onClaimId(id)}
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
           onClick={() => onAction('Fuel Log')}
           className="flex flex-col items-center justify-center p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm active:scale-95 transition-transform"
         >
            <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center mb-2">
               <Fuel className="h-5 w-5 text-orange-600" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Log Fuel</span>
         </button>
         <button 
           onClick={() => onAction('Service Request')}
           className="flex flex-col items-center justify-center p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm active:scale-95 transition-transform"
         >
            <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center mb-2">
               <Wrench className="h-5 w-5 text-blue-600" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Service</span>
         </button>
         <button 
           onClick={() => onAction('Issue Report')}
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
         <Button size="sm" variant="outline" className="text-xs bg-white h-8" onClick={() => onAction('Service Request')}>View</Button>
      </div>
    </div>
  );
}