import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Badge } from "../ui/badge";
import { ArrowRight, TrendingUp, TrendingDown, Minus, Users, Car, Wallet, AlertCircle } from 'lucide-react';
import { api } from '../../services/api';
import { DriverMetrics, VehicleMetrics, OrganizationMetrics, Trip, ImportAuditState } from '../../types/data';

interface ImpactAnalysisProps {
  newState: ImportAuditState;
  onReady?: (isReady: boolean) => void;
}

export function ImpactAnalysis({ newState, onReady }: ImpactAnalysisProps) {
  const [loading, setLoading] = useState(true);
  const [currentState, setCurrentState] = useState<{
    financials: OrganizationMetrics | null;
    drivers: DriverMetrics[];
    vehicles: VehicleMetrics[];
    trips: Trip[];
  }>({ financials: null, drivers: [], vehicles: [], trips: [] });

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [financials, drivers, vehicles, trips] = await Promise.all([
          api.getFinancials().catch(() => null),
          api.getDriverMetrics().catch(() => []),
          api.getVehicleMetrics().catch(() => []),
          api.getTrips().catch(() => [])
        ]);
        
        setCurrentState({ 
          financials: financials || { totalEarnings: 0, netFare: 0, balanceStart: 0, balanceEnd: 0, periodChange: 0, fleetProfitMargin: 0, cashPosition: 0, periodStart: "", periodEnd: "" }, 
          drivers, 
          vehicles, 
          trips 
        });
        
        if (onReady) onReady(true);
      } catch (e) {
        console.error("Failed to fetch current state for impact analysis", e);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);

  if (loading) {
    return (
      <Card className="border-indigo-100 bg-indigo-50/50 animate-pulse">
        <CardContent className="p-6">
          <div className="h-4 bg-indigo-200 rounded w-1/4 mb-4"></div>
          <div className="grid grid-cols-3 gap-4">
             <div className="h-20 bg-indigo-200 rounded"></div>
             <div className="h-20 bg-indigo-200 rounded"></div>
             <div className="h-20 bg-indigo-200 rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Calculate Deltas
  const newFinancials = newState.sanitized.financials.data;
  const currentFinancials = currentState.financials || { totalEarnings: 0 };

  const revenueDelta = newFinancials.totalEarnings - (currentFinancials.totalEarnings || 0);
  
  // Count *new* entities (simple ID check)
  const currentDriverIds = new Set(currentState.drivers.map(d => d.driverId));
  const newDriversCount = newState.sanitized.drivers.filter(d => !currentDriverIds.has(d.data.driverId)).length;
  
  const currentVehicleIds = new Set(currentState.vehicles.map(v => v.plateNumber));
  const newVehiclesCount = newState.sanitized.vehicles.filter(v => !currentVehicleIds.has(v.data.plateNumber)).length;

  const newTripsCount = newState.sanitized.trips ? newState.sanitized.trips.length : 0;

  return (
    <Card className="border-indigo-100 shadow-sm bg-white">
      <CardHeader className="pb-4 border-b border-indigo-50 bg-indigo-50/30">
        <div className="space-y-1">
            <CardTitle className="text-indigo-900 flex items-center gap-2 text-base">
                <TrendingUp className="h-5 w-5 text-indigo-600" />
                Impact Preview
            </CardTitle>
            <CardDescription className="text-indigo-600/80">
                Committing this import will result in the following changes to your fleet database.
            </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        <div className="flex flex-col md:flex-row justify-between gap-8 md:gap-4">
            
            {/* Revenue Impact */}
            <div className="space-y-1 flex-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                    <Wallet className="h-3 w-3" /> Revenue Impact
                </span>
                <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                        <span className="text-3xl font-bold text-slate-900 tracking-tight">
                            ${newFinancials.totalEarnings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                    </div>
                    <p className="text-xs text-slate-500 font-medium">
                        Total Fleet Earnings
                    </p>
                </div>
            </div>

            {/* Separator */}
            <div className="hidden md:block w-px bg-slate-100 mx-2"></div>

            {/* Driver Updates */}
            <div className="space-y-1 flex-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                    <Users className="h-3 w-3" /> Driver Updates
                </span>
                <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                        <span className="text-3xl font-bold text-slate-900 tracking-tight">
                            {newState.sanitized.drivers.length}
                        </span>
                        {newDriversCount > 0 && (
                            <Badge className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 px-1.5 h-5 text-[10px] font-semibold">
                                +{newDriversCount} New
                            </Badge>
                        )}
                    </div>
                    <p className="text-xs text-slate-500 font-medium">
                        Active Drivers in Report
                    </p>
                </div>
            </div>

            {/* Separator */}
            <div className="hidden md:block w-px bg-slate-100 mx-2"></div>

            {/* Vehicle Updates */}
            <div className="space-y-1 flex-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                    <Car className="h-3 w-3" /> Vehicle Updates
                </span>
                <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                         <span className="text-3xl font-bold text-slate-900 tracking-tight">
                            {newState.sanitized.vehicles.length}
                        </span>
                        {newVehiclesCount > 0 && (
                            <Badge className="bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100 px-1.5 h-5 text-[10px] font-semibold">
                                +{newVehiclesCount} New
                            </Badge>
                        )}
                    </div>
                    <p className="text-xs text-slate-500 font-medium">
                        Active Vehicles in Report
                    </p>
                </div>
            </div>

            {/* Separator */}
            <div className="hidden md:block w-px bg-slate-100 mx-2"></div>

            {/* Activity Added */}
            <div className="space-y-1 flex-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                    <TrendingUp className="h-3 w-3" /> Activity Added
                </span>
                <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                        <span className="text-3xl font-bold text-slate-900 tracking-tight">
                            +{newTripsCount}
                        </span>
                    </div>
                    <p className="text-xs text-slate-500 font-medium">
                        New Trips to be Inserted
                    </p>
                </div>
            </div>

        </div>
      </CardContent>
    </Card>
  );
}