import React, { useState } from 'react';
import { usePerformanceReport } from '../../hooks/usePerformanceReport';
import { PerformanceCharts } from './PerformanceCharts';
import { AtRiskTable } from './AtRiskTable';
import { getDriverStats, getAtRiskDrivers } from '../../utils/performanceUtils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Calendar } from "../ui/calendar";
import { format } from 'date-fns';
import { Calendar as CalendarIcon, RefreshCw, Settings, Users, DollarSign, Activity, AlertTriangle } from 'lucide-react';
import { cn } from "../ui/utils";

export function PerformanceDashboard() {
  // Quick filters state
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({
    dailyRideTarget: 20,
    dailyEarningsTarget: 300
  });
  const [appliedSettings, setAppliedSettings] = useState(settings);

  const { data: drivers, loading, error, dateRange, setDateRange, refresh } = usePerformanceReport(appliedSettings);
  
  const stats = getDriverStats(drivers);
  const atRiskDrivers = getAtRiskDrivers(drivers);

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Driver Performance</h1>
          <p className="text-muted-foreground mt-1">
             Monitor fleet efficiency, revenue, and driver compliance.
          </p>
        </div>
        
        <div className="flex items-center gap-2">
           <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={"outline"}
                className={cn(
                  "w-[240px] justify-start text-left font-normal",
                  !dateRange && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateRange?.from ? (
                  dateRange.to ? (
                    <>
                      {format(dateRange.from, "LLL dd, y")} -{" "}
                      {format(dateRange.to, "LLL dd, y")}
                    </>
                  ) : (
                    format(dateRange.from, "LLL dd, y")
                  )
                ) : (
                  <span>Pick a date range</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={dateRange?.from}
                selected={dateRange as any}
                onSelect={(range: any) => range && setDateRange(range)}
                numberOfMonths={2}
                showOutsideDays={false}
              />
            </PopoverContent>
          </Popover>

          <Button variant="outline" size="icon" onClick={() => refresh()} title="Refresh Data">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>

          <Popover open={showSettings} onOpenChange={setShowSettings}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" title="Quota Settings">
                <Settings className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
              <div className="grid gap-4">
                <div className="space-y-2">
                  <h4 className="font-medium leading-none">Quota Targets</h4>
                  <p className="text-sm text-muted-foreground">
                    Adjust targets to simulate performance stats.
                  </p>
                </div>
                <div className="grid gap-2">
                  <div className="grid grid-cols-3 items-center gap-4">
                    <Label htmlFor="rides">Daily Rides</Label>
                    <Input
                      id="rides"
                      type="number"
                      defaultValue={settings.dailyRideTarget}
                      className="col-span-2 h-8"
                      onChange={(e) => setSettings(s => ({ ...s, dailyRideTarget: parseInt(e.target.value) || 0 }))}
                    />
                  </div>
                  <div className="grid grid-cols-3 items-center gap-4">
                    <Label htmlFor="earnings">Daily Earn</Label>
                    <Input
                      id="earnings"
                      type="number"
                      defaultValue={settings.dailyEarningsTarget}
                      className="col-span-2 h-8"
                      onChange={(e) => setSettings(s => ({ ...s, dailyEarningsTarget: parseInt(e.target.value) || 0 }))}
                    />
                  </div>
                </div>
                <Button onClick={() => {
                  setAppliedSettings(settings);
                  setShowSettings(false);
                }}>
                  Apply
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${stats.totalEarnings.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Over selected period
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Success Rate</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgSuccessRate}%</div>
            <p className="text-xs text-muted-foreground">
              Drivers meeting quota
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Drivers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeCount}</div>
            <p className="text-xs text-muted-foreground">
              With at least 1 trip
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">At Risk</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{atRiskDrivers.length}</div>
            <p className="text-xs text-muted-foreground">
              Needs attention
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="space-y-6">
        <PerformanceCharts drivers={drivers} />
        <AtRiskTable drivers={atRiskDrivers} />
      </div>
    </div>
  );
}
