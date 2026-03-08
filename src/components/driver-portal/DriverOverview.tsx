// cache-bust: force recompile — 2026-02-10
import React from 'react';
import { useAuth } from '../auth/AuthContext';
import { 
  Trophy, 
  Star, 
  ChevronRight, 
  ShieldAlert
} from 'lucide-react';
import { Card, CardContent } from "../ui/card";
import { Drawer, DrawerTrigger, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerClose } from "../ui/drawer";
import { cn } from "../ui/utils";
import { DriverMetrics, TierConfig, DriverGoals, Trip } from '../../types/data';

export interface DriverOverviewProps {
  tierState: {
      current: TierConfig | null;
      next: TierConfig | null;
      progress: number;
      cumulativeEarnings: number;
  };
  metrics: DriverMetrics | null;
  todayEarnings: {
    total: number;
    breakdown: {
      uber: number;
      indrive: number;
      goride: number;
      roam: number;
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
  onAction: (action: 'log_fuel' | 'request_service' | 'start_trip') => void;
  flaggedCount: number;
  className?: string;
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
  onAction,
  flaggedCount = 0,
  className
}: DriverOverviewProps) {
  const { user } = useAuth();

  // Default fallback tier if data is missing/loading
  const displayTier = tierState.current || {
      name: 'Driver',
      threshold: 0,
      benefits: []
  };

  return (
    <div className={cn("space-y-6 flex flex-col", className)}>
      {/* Fuel Integrity Alert - REMOVED as per request */}
      
      {/* Main Welcome Card */}
      <Card className="border-0 shadow-xl overflow-hidden relative bg-slate-900 text-white shrink-0">
          {/* Background Effects */}
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-[#1e1b4b] to-slate-900 z-0" />
          <div className="absolute top-0 right-0 p-4 opacity-5 z-0">
              <Trophy className="h-40 w-40 -rotate-12 text-white" />
          </div>
          <div className="absolute top-1/2 right-1/4 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          
          <CardContent className="p-6 relative z-10 space-y-6">
              {/* Header: Avatar, Name, Tier, Rating */}
              <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                      <div className="h-16 w-16 rounded-full bg-slate-800 border-2 border-indigo-400/30 flex items-center justify-center overflow-hidden">
                          <span className="text-2xl font-bold text-indigo-200">
                              {driverRecord?.name?.charAt(0) || user?.email?.charAt(0) || 'D'}
                          </span>
                      </div>
                      <div className="space-y-1">
                          <h2 className="text-2xl font-bold tracking-tight">
                              Welcome, <br/>
                              <span className="text-white">{driverRecord?.name?.split(' ')[0] || user?.user_metadata?.name?.split(' ')[0] || 'Driver'}</span>
                          </h2>
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-amber-300 to-amber-500 text-slate-900 text-xs font-bold shadow-lg shadow-amber-500/20">
                              <Trophy className="h-3 w-3 fill-slate-900 stroke-none" />
                              {displayTier.name}
                          </div>
                      </div>
                  </div>
                  
                  <div className="flex flex-col items-end">
                      <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-full backdrop-blur-md border border-white/20 shadow-lg">
                          <span className="text-2xl font-bold text-white tracking-tight">
                              {metrics?.ratingLast500 || '5.0'}
                          </span>
                          <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
                      </div>
                  </div>
              </div>

              {/* Next Milestone Section */}
              {loading && !tierState.current ? (
                  <div className="bg-slate-800/50 rounded-xl p-4 border border-white/10 backdrop-blur-sm animate-pulse">
                      <div className="h-3 w-24 bg-slate-700 rounded mb-3" />
                      <div className="h-6 w-32 bg-slate-700 rounded mb-4" />
                      <div className="h-3 w-full bg-slate-700 rounded-full" />
                  </div>
              ) : tierState.next ? (
                  <div className="bg-slate-800/50 rounded-xl p-4 border border-white/10 backdrop-blur-sm">
                      <p className="text-xs text-indigo-200 font-bold uppercase tracking-wider mb-2">Next Milestone</p>
                      <h3 className="text-xl font-bold text-white mb-4">{tierState.next.name}</h3>
                      
                      <div className="space-y-2">
                          <div className="h-3 w-full bg-slate-700/50 rounded-full overflow-hidden backdrop-blur-sm border border-white/5">
                              <div 
                                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]" 
                                  style={{ width: `${Math.min(100, Math.max(0, tierState.progress || 0))}%` }}
                              />
                          </div>
                          <div className="flex justify-between text-[10px] text-slate-400 font-mono font-medium">
                              <span>CURRENT: ${(tierState.cumulativeEarnings || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                              <span>TARGET: ${(tierState.next.minEarnings || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                          </div>
                      </div>
                  </div>
              ) : (
                  <div className="bg-gradient-to-br from-amber-500/20 to-purple-500/20 rounded-xl p-4 border border-amber-500/30 backdrop-blur-sm flex flex-col items-center justify-center text-center py-6">
                      <Trophy className="h-10 w-10 text-amber-400 mb-2 drop-shadow-[0_0_10px_rgba(251,191,36,0.5)]" />
                      <p className="text-xs text-amber-200 font-bold uppercase tracking-wider">Top Tier Status</p>
                      <h3 className="text-xl font-bold text-white">Legendary Driver</h3>
                  </div>
              )}
          </CardContent>
      </Card>

      {/* Earnings Stats Row */}
      <div className="flex-1 flex flex-col justify-center">
        <div className="grid grid-cols-3 gap-3 w-full">
            <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4 flex flex-col items-center justify-center text-center">
                <span className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider mb-1">Roam</span>
                <span className="text-lg font-bold text-indigo-900">${(todayEarnings?.breakdown?.roam || todayEarnings?.breakdown?.goride || 0).toFixed(2)}</span>
            </div>
            <div className="bg-white border border-slate-100 rounded-2xl p-4 flex flex-col items-center justify-center text-center shadow-sm">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Uber</span>
                <span className="text-lg font-bold text-slate-900">${(todayEarnings?.breakdown?.uber || 0).toFixed(2)}</span>
            </div>
            <div className="bg-white border border-slate-100 rounded-2xl p-4 flex flex-col items-center justify-center text-center shadow-sm">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">InDrive</span>
                <span className="text-lg font-bold text-slate-900">${(todayEarnings?.breakdown?.indrive || 0).toFixed(2)}</span>
            </div>
        </div>
      </div>

      {/* Start Trip Button - REMOVED (Duplicate in TripTimer) */}

    </div>
  );
}