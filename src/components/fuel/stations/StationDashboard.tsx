import React, { useMemo } from 'react';
import { Card, CardContent } from '../../ui/card';
import { StationAnalyticsContextType } from '../../../types/station';
import { FuelEntry } from '../../../types/fuel';
import { calculateDashboardKPIs } from '../../../utils/stationUtils';
import { DollarSign, TrendingDown, TrendingUp, Minus, MapPin, Fuel, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from '../../ui/utils';

export function StationDashboard({ context, logs }: { context: StationAnalyticsContextType, logs: FuelEntry[] }) {
  const { stations, regionalStats } = context;

  // Calculate advanced KPIs
  const kpis = useMemo(() => {
    return calculateDashboardKPIs(logs, regionalStats.minPrice);
  }, [logs, regionalStats.minPrice]);

  const bestStation = stations.sort((a, b) => a.stats.lastPrice - b.stats.lastPrice)[0];

  const hasData = logs.length > 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {/* 1. Avg Fuel Price Card */}
      <Card>
        <CardContent className="p-6 flex items-start justify-between">
          <div>
            <p className="text-sm text-slate-500 font-medium mb-1">Avg. Price / Liter</p>
            <h3 className="text-2xl font-bold text-slate-900">
              {hasData ? `$${kpis.avgPriceThisWeek > 0 ? kpis.avgPriceThisWeek.toFixed(2) : regionalStats.avgPrice.toFixed(2)}` : '-'}
            </h3>
            <div className="flex items-center mt-1 gap-1">
              {hasData ? (
                <>
                  {kpis.trendDirection === 'up' && <ArrowUpRight className="h-4 w-4 text-red-500" />}
                  {kpis.trendDirection === 'down' && <ArrowDownRight className="h-4 w-4 text-emerald-500" />}
                  {kpis.trendDirection === 'stable' && <Minus className="h-4 w-4 text-slate-400" />}
                  
                  <span className={cn(
                    "text-xs font-medium",
                    kpis.trendDirection === 'up' ? "text-red-600" : 
                    kpis.trendDirection === 'down' ? "text-emerald-600" : "text-slate-500"
                  )}>
                    {kpis.trendDirection === 'up' ? "Rising" : kpis.trendDirection === 'down' ? "Dropping" : "Stable"} vs last week
                  </span>
                </>
              ) : (
                <span className="text-xs text-slate-400">No data available</span>
              )}
            </div>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
            <DollarSign className="h-5 w-5" />
          </div>
        </CardContent>
      </Card>

      {/* 2. Top Station Card */}
      <Card>
        <CardContent className="p-6 flex items-start justify-between">
           <div>
            <p className="text-sm text-slate-500 font-medium mb-1">Best Regional Price</p>
            <h3 className="text-2xl font-bold text-slate-900">
              {hasData ? `$${regionalStats.minPrice.toFixed(2)}` : '-'}
            </h3>
            <p className="text-xs text-slate-500 mt-1 truncate max-w-[140px]" title={bestStation?.name}>
              {bestStation?.name || (hasData ? 'No Data' : '')}
            </p>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
            <TrendingDown className="h-5 w-5" />
          </div>
        </CardContent>
      </Card>

      {/* 3. Potential Savings Card */}
      <Card>
        <CardContent className="p-6 flex items-start justify-between">
           <div>
            <p className="text-sm text-slate-500 font-medium mb-1">Est. Weekly Savings</p>
            <h3 className="text-2xl font-bold text-slate-900">
              {hasData ? `$${kpis.potentialSavings.toFixed(2)}` : '-'}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              If all fuel bought at min price
            </p>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
            <Fuel className="h-5 w-5" />
          </div>
        </CardContent>
      </Card>

      {/* 4. Mini Map / Network Overview */}
      <Card className="relative overflow-hidden">
        <div className="absolute inset-0 bg-slate-100 flex items-center justify-center">
            {/* Simple CSS Grid Pattern to look like a map placeholder */}
            <div className="w-full h-full opacity-10" 
                 style={{ backgroundImage: 'radial-gradient(#475569 1px, transparent 1px)', backgroundSize: '10px 10px' }}>
            </div>
        </div>
        <CardContent className="p-6 relative z-10 flex flex-col h-full justify-between pointer-events-none">
            <div className="flex justify-between items-start">
               <div>
                 <p className="text-sm text-slate-600 font-bold">Network Reach</p>
                 <h3 className="text-2xl font-bold text-slate-900">{stations.length}</h3>
                 <p className="text-xs text-slate-500">Active Stations</p>
               </div>
               <div className="p-2 bg-white shadow-sm rounded-full">
                  <MapPin className="h-4 w-4 text-slate-700" />
               </div>
            </div>
            {hasData && (
              <div className="mt-2 flex items-center gap-2">
                   <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></div>
                   <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Live Updates</span>
              </div>
            )}
        </CardContent>
      </Card>
    </div>
  );
}
