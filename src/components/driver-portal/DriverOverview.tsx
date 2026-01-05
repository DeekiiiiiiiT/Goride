import React from 'react';
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { 
  DollarSign, 
  Star, 
  ShieldCheck,
  Fuel, 
  Ticket, 
  AlertTriangle,
  Loader2,
  Trophy,
  Target,
  CheckCircle2,
  Car,
  RefreshCw,
  Users,
  User,
  HelpCircle,
  ShieldAlert,
  PlusCircle,
  ChevronRight
} from "lucide-react";
import { 
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DrawerFooter,
  DrawerClose,
} from "../ui/drawer";
import { Trip, DriverMetric, TierConfig, DriverGoals } from '../../types/data';
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
  todayEarnings: {
    total: number;
    breakdown: {
      uber: number;
      indrive: number;
      goride: number;
    };
  };
  goals: DriverGoals | null;
  recentTrip: Trip | null;
  driverRecord: any;
  loading: boolean;
  unclaimedTripIds: string[];
  debugDrivers: any[];
  isFixing: string | null;
  onClaimId: (id: string) => void;
  onAction: (action: string) => void;
}

function GoalRow({ label, current, target }: { label: string; current: number; target: number }) {
  const progress = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  const isMet = target > 0 && current >= target;
  
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-end text-sm">
        <span className="font-medium text-slate-600 dark:text-slate-400">{label}</span>
        <div className="flex items-center gap-1.5">
          {isMet && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
          <span className={`font-bold ${isMet ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-slate-100'}`}>
             {TierCalculations.formatCurrency(current)}
          </span>
          <span className="text-xs text-slate-400 font-medium">
             / {TierCalculations.formatCurrency(target)}
          </span>
        </div>
      </div>
      
      <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div 
          className={`h-full rounded-full transition-all duration-1000 ease-out ${
            isMet 
              ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' 
              : 'bg-indigo-500'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

export function DriverOverview({
  tierState,
  metrics,
  todayEarnings,
  goals,
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
                     <div className="flex items-center justify-between">
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
                                         {tierState.current.name}
                                     </div>
                                     <span className="text-sm font-medium text-indigo-200/80 tracking-wide">
                                         {tierState.current.sharePercentage}% Profit Share
                                     </span>
                                 </div>
                             </div>
                         </div>

                         {/* Rating Display (Relocated) */}
                         <div className="flex flex-col items-end">
                            <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-full backdrop-blur-md border border-white/20 shadow-lg">
                                <span className="text-2xl font-bold text-white tracking-tight">
                                    {metrics?.ratingLast500 || '5.0'}
                                </span>
                                <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
                            </div>
                         </div>
                     </div>

                     {/* Progress Section */}
                     <div className="space-y-3 bg-white/5 rounded-2xl p-4 border border-white/10 backdrop-blur-sm">
                         <div className="flex justify-between items-end">
                             <div className="space-y-0.5">
                                 <span className="text-xs font-semibold text-indigo-200 uppercase tracking-wider">Next Milestone</span>
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
                                 <span className="text-xs text-indigo-200 block mb-0.5">Goal</span>
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

      {/* Quota Goals Section */}
      {goals && goals.weekly.target > 0 && (
          <Card className="border-indigo-100 bg-white dark:bg-slate-950 dark:border-slate-800 shadow-sm">
             <CardContent className="p-4 space-y-4">
                 <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                    <div className="p-1.5 bg-indigo-50 dark:bg-indigo-900/30 rounded-md">
                        <Target className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">Earning Goals</h3>
                 </div>
                 
                 <div className="grid gap-4">
                     <GoalRow label="Daily Goal" current={goals.daily.current} target={goals.daily.target} />
                     <GoalRow label="Weekly Goal" current={goals.weekly.current} target={goals.weekly.target} />
                     <GoalRow label="Monthly Goal" current={goals.monthly.current} target={goals.monthly.target} />
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

      {/* Today's Stats Breakdown */}
      <div className="grid grid-cols-3 gap-3">
        {/* GoRide */}
        <Card className="bg-indigo-50/50 border-indigo-100 dark:bg-indigo-900/10 dark:border-indigo-800">
           <CardContent className="p-3 py-4 flex flex-col items-center text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-900 dark:text-indigo-200 mb-1">GoRide</span>
              <span className="text-xl font-bold text-indigo-700 dark:text-indigo-300">
                  ${todayEarnings.breakdown.goride.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
           </CardContent>
        </Card>

        {/* Uber */}
        <Card>
           <CardContent className="p-3 py-4 flex flex-col items-center text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Uber</span>
              <span className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  ${todayEarnings.breakdown.uber.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
           </CardContent>
        </Card>

        {/* InDrive */}
        <Card>
           <CardContent className="p-3 py-4 flex flex-col items-center text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">InDrive</span>
              <span className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  ${todayEarnings.breakdown.indrive.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
           </CardContent>
        </Card>
      </div>






    </div>
  );
}