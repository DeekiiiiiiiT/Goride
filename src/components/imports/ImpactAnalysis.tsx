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
  const profitDelta = (newFinancials.fleetProfitMargin || 0) - (currentFinancials.fleetProfitMargin || 0);
  
  // Count *new* entities (simple ID check)
  const currentDriverIds = new Set(currentState.drivers.map(d => d.driverId));
  const newDriversCount = newState.sanitized.drivers.filter(d => !currentDriverIds.has(d.data.driverId)).length;
  
  const currentVehicleIds = new Set(currentState.vehicles.map(v => v.plateNumber));
  const newVehiclesCount = newState.sanitized.vehicles.filter(v => !currentVehicleIds.has(v.data.plateNumber)).length;

  const newTripsCount = newState.sanitized.trips ? newState.sanitized.trips.length : 0;

  return (
    <Card className="border-indigo-100 shadow-sm bg-indigo-50/30">
      <CardHeader className="pb-3 border-b border-indigo-100">
        <CardTitle className="text-indigo-900 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-indigo-600" />
            Impact Preview
        </CardTitle>
        <CardDescription className="text-indigo-700">
            Committing this import will result in the following changes to your fleet database.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* Revenue Impact */}
            <div className="space-y-1">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <Wallet className="h-3 w-3" /> Revenue Impact
                </span>
                <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-slate-900">
                        ${newFinancials.totalEarnings.toLocaleString()}
                    </span>
                    {revenueDelta !== 0 && (
                        <Badge variant={revenueDelta > 0 ? "default" : "destructive"} className={revenueDelta > 0 ? "bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200" : ""}>
                            {revenueDelta > 0 ? '+' : ''}{revenueDelta.toLocaleString()}
                        </Badge>
                    )}
                </div>
                <p className="text-xs text-slate-500">
                    Total Fleet Earnings
                </p>
            </div>

            {/* Drivers Impact */}
            <div className="space-y-1">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <Users className="h-3 w-3" /> Driver Updates
                </span>
                <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-slate-900">
                        {newState.sanitized.drivers.length}
                    </span>
                    {newDriversCount > 0 && (
                        <Badge className="bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200">
                            +{newDriversCount} New
                        </Badge>
                    )}
                </div>
                 <p className="text-xs text-slate-500">
                    Active Drivers in Report
                </p>
            </div>

            {/* Vehicles Impact */}
            <div className="space-y-1">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <Car className="h-3 w-3" /> Vehicle Updates
                </span>
                <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-slate-900">
                        {newState.sanitized.vehicles.length}
                    </span>
                    {newVehiclesCount > 0 && (
                        <Badge className="bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-200">
                            +{newVehiclesCount} New
                        </Badge>
                    )}
                </div>
                 <p className="text-xs text-slate-500">
                    Active Vehicles in Report
                </p>
            </div>

            {/* Trips Added */}
            <div className="space-y-1">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" /> Activity Added
                </span>
                <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-slate-900">
                        +{newTripsCount}
                    </span>
                </div>
                <p className="text-xs text-slate-500">
                    New Trips to be Inserted
                </p>
            </div>

        </div>
      </CardContent>
    </Card>
  );
}