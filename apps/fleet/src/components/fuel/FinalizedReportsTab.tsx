import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '../ui/table';
import {
  CalendarIcon,
  FileCheck,
  ChevronDown,
  ChevronRight,
  Loader2,
  CheckCircle2,
  RefreshCw,
  Download,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { reportWeekYmdBounds } from '../../utils/fuelWeekPeriod';
import { api } from '../../services/api';
import { toast } from 'sonner';
import { downloadCSV } from '../../utils/export';
import { formatFuelMoney } from '../../utils/formatFuelMoney';

interface WeekGroup {
  key: string;
  weekStart: string;
  weekEnd: string;
  vehicleCount: number;
  totalSpend: number;
  totalDeduction: number;
  totalNetPay: number;
  finalizedAt: string;
  reports: any[];
}

export function FinalizedReportsTab() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedWeek, setExpandedWeek] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadReports = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getFinalizedReports();
      setReports(data);
    } catch (err: any) {
      console.error('[FinalizedReportsTab] Load error:', err);
      setError(err.message || 'Failed to load finalized reports');
      toast.error('Failed to load finalized reports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  const weekGroups: WeekGroup[] = useMemo(() => {
    const groupMap = new Map<string, any[]>();

    for (const report of reports) {
      const key = `${report.weekStart}::${report.weekEnd}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, []);
      }
      groupMap.get(key)!.push(report);
    }

    const groups: WeekGroup[] = [];
    for (const [key, groupReports] of groupMap) {
      const first = groupReports[0];
      groups.push({
        key,
        weekStart: first.weekStart,
        weekEnd: first.weekEnd,
        vehicleCount: groupReports.length,
        totalSpend: groupReports.reduce((s: number, r: any) => s + (r.totalGasCardCost || 0), 0),
        totalDeduction: groupReports.reduce((s: number, r: any) => s + (r.driverShare || 0), 0),
        totalNetPay: groupReports.reduce((s: number, r: any) => s + (r.netPay || 0), 0),
        finalizedAt: first.finalizedAt,
        reports: groupReports,
      });
    }

    groups.sort((a, b) => b.weekStart.localeCompare(a.weekStart));
    return groups;
  }, [reports]);


  const formatWeekRange = (weekStart: string, weekEnd: string): string => {
    try {
      const { start, end } = reportWeekYmdBounds({ weekStart, weekEnd });
      const startD = parseISO(start);
      const endD = parseISO(end);
      const startYear = startD.getFullYear();
      const endYear = endD.getFullYear();
      if (startYear === endYear) {
        return `${format(startD, 'MMM d')} \u2013 ${format(endD, 'MMM d, yyyy')}`;
      }
      return `${format(startD, 'MMM d, yyyy')} \u2013 ${format(endD, 'MMM d, yyyy')}`;
    } catch {
      return `${weekStart} \u2013 ${weekEnd}`;
    }
  };

  const formatFinalizedAt = (iso: string): string => {
    try {
      return `Finalized ${format(parseISO(iso), "MMM d, yyyy 'at' h:mm a")}`;
    } catch {
      return 'Finalized';
    }
  };

  const handleExportWeek = async (group: WeekGroup) => {
    const data = group.reports.map((r: any) => ({
      WeekStart: r.weekStart?.split('T')[0] || '',
      WeekEnd: r.weekEnd?.split('T')[0] || '',
      Vehicle: r.vehiclePlate || r.vehicleId || '',
      Driver: r.driverName || 'Unknown',
      TotalSpend: Number((r.totalGasCardCost || 0).toFixed(2)),
      RideShare: Number((r.rideShareCost || 0).toFixed(2)),
      CompanyOps: Number((r.companyUsageCost || 0).toFixed(2)),
      Deadhead: Number((r.deadheadCost || 0).toFixed(2)),
      Personal: Number((r.personalUsageCost || 0).toFixed(2)),
      Misc: Number((r.miscellaneousCost || 0).toFixed(2)),
      PaidByDriver: Number((r.driverSpend || 0).toFixed(2)),
      Deduction: Number((r.driverShare || 0).toFixed(2)),
      NetPay: Number((r.netPay || 0).toFixed(2)),
      FinalizedAt: r.finalizedAt || '',
    }));
    const weekLabel = group.weekStart?.split('T')[0] || 'unknown';
    await downloadCSV(data, `finalized-reconciliation-${weekLabel}`, { checksum: true });
    toast.success('CSV exported');
  };

  // --- Loading State ---
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="text-sm font-medium">Loading finalized reports...</p>
      </div>
    );
  }

  // --- Error State ---
  if (error && reports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-red-400">
        <p className="text-sm font-medium">{error}</p>
        <Button variant="outline" size="sm" onClick={loadReports}>
          <RefreshCw className="h-4 w-4 mr-2" /> Retry
        </Button>
      </div>
    );
  }

  // --- Main Render ---
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {weekGroups.length} finalized week{weekGroups.length !== 1 ? 's' : ''}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadReports} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {weekGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-slate-400">
          <FileCheck className="h-12 w-12 opacity-40" />
          <div className="text-center space-y-1">
            <p className="text-base font-semibold text-slate-500">No finalized statements yet</p>
            <p className="text-sm">
              Finalize a week from Consumption Reconciliation to see it here.
            </p>
          </div>
        </div>
      ) : (
        weekGroups.map((group) => {
        const isExpanded = expandedWeek === group.key;

        return (
          <Card key={group.key} className="overflow-hidden">
            {/* Collapsed header row */}
            <button
              type="button"
              className="w-full text-left"
              onClick={() => setExpandedWeek(isExpanded ? null : group.key)}
            >
              <CardHeader className="py-4 px-5 hover:bg-slate-50/60 transition-colors">
                <div className="flex items-center justify-between gap-4">
                  {/* Left: chevron + week info */}
                  <div className="flex items-center gap-3 min-w-0">
                    {isExpanded ? (
                      <ChevronDown className="h-5 w-5 text-slate-400 shrink-0" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-slate-400 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
                        <CalendarIcon className="h-4 w-4 text-slate-400 shrink-0" />
                        {formatWeekRange(group.weekStart, group.weekEnd)}
                      </CardTitle>
                      <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        {formatFinalizedAt(group.finalizedAt)}
                      </p>
                    </div>
                  </div>

                  {/* Right: summary badges + stats */}
                  <div className="flex items-center gap-4 shrink-0">
                    <Badge variant="outline" className="text-xs font-medium">
                      {group.vehicleCount} Vehicle{group.vehicleCount !== 1 ? 's' : ''}
                    </Badge>
                    <div className="hidden md:flex items-center gap-5 text-sm">
                      <div className="text-right">
                        <span className="text-slate-400 text-xs block">Total Spend</span>
                        <span className="font-semibold text-slate-700">
                          {formatFuelMoney(group.totalSpend)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-400 text-xs block">Deduction</span>
                        <span className="font-semibold text-red-600">
                          {formatFuelMoney(group.totalDeduction)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-400 text-xs block">Net Pay</span>
                        <span className="font-semibold text-slate-700">
                          {formatFuelMoney(group.totalNetPay)}
                        </span>
                      </div>
                    </div>
                    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100">
                      Finalized
                    </Badge>
                  </div>
                </div>
              </CardHeader>
            </button>

            {/* Expanded detail table */}
            {isExpanded && (
              <CardContent className="p-0 border-t">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/80">
                        <TableHead className="font-semibold">Vehicle / Driver</TableHead>
                        <TableHead className="text-right font-semibold">Total Spend</TableHead>
                        <TableHead className="text-right font-semibold">Ride Share</TableHead>
                        <TableHead className="text-right font-semibold">Company Ops</TableHead>
                        <TableHead className="text-right font-semibold text-amber-700">Deadhead</TableHead>
                        <TableHead className="text-right font-semibold">Personal</TableHead>
                        <TableHead className="text-right font-semibold">Misc</TableHead>
                        <TableHead className="text-right font-semibold">Paid by Driver</TableHead>
                        <TableHead className="text-right font-semibold text-red-700">Deduction</TableHead>
                        <TableHead className="text-right font-semibold">Net Pay</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.reports.map((r: any) => (
                        <TableRow key={`${r.vehicleId}-${r.weekStart}`}>
                          <TableCell>
                            <div className="font-medium text-sm text-slate-800">
                              {r.vehiclePlate || r.vehicleId}
                            </div>
                            <div className="text-xs text-slate-400">
                              {r.driverName || 'Unknown'}{r.vehicleModel ? ` \u00b7 ${r.vehicleModel}` : ''}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatFuelMoney(r.totalGasCardCost || 0)}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {formatFuelMoney(r.rideShareCost || 0)}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {formatFuelMoney(r.companyUsageCost ?? 0)}
                          </TableCell>
                          <TableCell className="text-right text-sm text-amber-600">
                            {formatFuelMoney(r.deadheadCost || 0)}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {formatFuelMoney(r.personalUsageCost ?? 0)}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {formatFuelMoney(r.miscellaneousCost ?? 0)}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {formatFuelMoney(r.driverSpend || 0)}
                          </TableCell>
                          <TableCell className="text-right font-medium text-red-600">
                            {formatFuelMoney(r.driverShare || 0)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatFuelMoney(r.netPay || 0)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow className="bg-slate-50 font-semibold">
                        <TableCell>Totals ({group.reports.length} vehicles)</TableCell>
                        <TableCell className="text-right">
                          {formatFuelMoney(group.totalSpend)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatFuelMoney(
                            group.reports.reduce((s: number, r: any) => s + (r.rideShareCost || 0), 0)
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatFuelMoney(
                            group.reports.reduce((s: number, r: any) => s + (r.companyUsageCost ?? 0), 0)
                          )}
                        </TableCell>
                        <TableCell className="text-right text-amber-600">
                          {formatFuelMoney(
                            group.reports.reduce((s: number, r: any) => s + (r.deadheadCost || 0), 0)
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatFuelMoney(
                            group.reports.reduce((s: number, r: any) => s + (r.personalUsageCost ?? 0), 0)
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatFuelMoney(
                            group.reports.reduce((s: number, r: any) => s + (r.miscellaneousCost ?? 0), 0)
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatFuelMoney(
                            group.reports.reduce((s: number, r: any) => s + (r.driverSpend || 0), 0)
                          )}
                        </TableCell>
                        <TableCell className="text-right text-red-600">
                          {formatFuelMoney(group.totalDeduction)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatFuelMoney(group.totalNetPay)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
                {/* Export button */}
                <div className="flex justify-end px-4 py-3 border-t bg-slate-50/40">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleExportWeek(group);
                    }}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download CSV
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>
        );
      })
      )}


    </div>
  );
}