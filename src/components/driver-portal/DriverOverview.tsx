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
import { Trip, DriverMetrics, TierConfig, DriverGoals } from '../../types/data';
import { TierCalculations } from '../../utils/tierCalculations';
import { useAuth } from '../auth/AuthContext';
import { DriverFuelDisputes } from './DriverFuelDisputes';

interface DriverOverviewProps {
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
  flaggedCount?: number;
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
  flaggedCount = 0
}: DriverOverviewProps) {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      {/* Fuel Integrity Alert - Sticky Nudge (Phase 7) */}
      {flaggedCount > 0 && (
          <Drawer>
              <DrawerTrigger asChild>
                  <button className="w-full bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-center gap-4 text-left animate-pulse shadow-sm">
                      <div className="p-2 bg-orange-100 rounded-lg text-orange-600">
                          <ShieldAlert className="w-6 h-6" />
                      </div>
                      <div className="flex-1">
                          <p className="text-sm font-bold text-orange-900">Action Required: {flaggedCount} Fuel Flag{flaggedCount > 1 ? 's' : ''}</p>
                          <p className="text-[10px] text-orange-700 font-medium uppercase tracking-tight">Your recent fuel logs have mathematical inconsistencies</p>
                      </div>
                      <div className="bg-orange-600 text-white p-1 rounded-full">
                          <ChevronRight className="w-4 h-4" />
                      </div>
                  </button>
              </DrawerTrigger>
              <DrawerContent>
                  <div className="mx-auto w-full max-w-md">
                      <DrawerHeader>
                          <DrawerTitle>Fuel Integrity Audit</DrawerTitle>
                          <DrawerDescription>Review and resolve flagged transactions to ensure accurate payroll.</DrawerDescription>
                      </DrawerHeader>
                      <div className="p-4 overflow-y-auto max-h-[70vh]">
                          <DriverFuelDisputes />
                      </div>
                      <DrawerFooter>
                          <DrawerClose asChild>
                              <Button variant="outline">Close Audit</Button>
                          </DrawerClose>
                      </DrawerFooter>
                  </div>
              </DrawerContent>
          </Drawer>
      )}

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
                                 <h2 className="text-2xl font-bold text-white tracking-tight">
                                     Welcome, {driverRecord?.name?.split(' ')[0] || 'Driver'}
                                 </h2>
                                 <div className="flex items-center gap-3">
                                     {/* Tier Badge - High Fidelity */}
                                     <div className="px-3 py-1 rounded-full bg-gradient-to-r from-amber-300 to-amber-500 text-slate-900 text-xs font-bold shadow-lg shadow-amber-500/20 flex items-center gap-1.5">
                                         <Trophy className="h-3 w-3 fill-slate-900 stroke-none" />
                                         {tierState.current.name}
                                     </div>
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
                                        {tierState.next?.name || 'Max Level'}
                                    </span>
                                 </div>
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
                             <span>Current: {TierCalculations.formatCurrency(tierState.cumulativeEarnings)}</span>
                             <span>Target: {tierState.next ? TierCalculations.formatCurrency(tierState.next.minEarnings) : 'Max'}</span>
                         </div>
                     </div>
                 </div>
             </CardContent>
         </Card>
      )}

      {!metrics && !recentTrip && !loading && (
          <Card className="border-dashed border-2 border-slate-200 bg-slate-50/50">
              <CardContent className="p-8 flex flex-col items-center text-center space-y-4">
                  <div className="h-16 w-16 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 mb-2">
                      <Car className="h-8 w-8" />
                  </div>
                  <div>
                      <h3 className="text-lg font-bold text-slate-900">Start Your First Trip</h3>
                      <p className="text-sm text-slate-500 mt-1 max-w-[280px] mx-auto">
                          Welcome to the fleet! Complete your first trip to see your earnings, ratings, and performance stats appear here.
                      </p>
                  </div>
              </CardContent>
          </Card>
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