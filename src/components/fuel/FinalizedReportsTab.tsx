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
  Trash2,
  Loader2,
  CheckCircle2,
  RefreshCw,
  Download,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { api } from '../../services/api';
import { toast } from 'sonner@2.0.3';
import { downloadCSV } from '../../utils/export';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

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
  const [deleteTarget, setDeleteTarget] = useState<{ weekStart: string; vehicleId: string; label: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await api.deleteFinalizedReport(deleteTarget.weekStart, deleteTarget.vehicleId);
      setReports((prev) =>
        prev.filter(
          (r) => !(r.weekStart === deleteTarget.weekStart && r.vehicleId === deleteTarget.vehicleId)
        )
      );
      toast.success(`Removed finalized report for ${deleteTarget.label}`);
    } catch (err: any) {
      console.error('[FinalizedReportsTab] Delete error:', err);
      toast.error(`Failed to delete: ${err.message}`);
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  const formatWeekRange = (weekStart: string, weekEnd: string): string => {
    try {
      const start = parseISO(weekStart.split('T')[0]);
      const end = parseISO(weekEnd.split('T')[0]);
      const startYear = start.getFullYear();
      const endYear = end.getFullYear();
      if (startYear === endYear) {
        return `${format(start, 'MMM d')} \u2013 ${format(end, 'MMM d, yyyy')}`;
      }
      return `${format(start, 'MMM d, yyyy')} \u2013 ${format(end, 'MMM d, yyyy')}`;
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
      CompanyOps: Number(((r.companyUsageCost ?? r.companyOpsCost) || 0).toFixed(2)),
      Deadhead: Number((r.deadheadCost || 0).toFixed(2)),
      Personal: Number(((r.personalUsageCost ?? r.personalCost) || 0).toFixed(2)),
      Misc: Number(((r.miscellaneousCost ?? r.miscCost) || 0).toFixed(2)),
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

  // --- Empty State ---
  if (weekGroups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-slate-400">
        <FileCheck className="h-12 w-12 opacity-40" />
        <div className="text-center space-y-1">
          <p className="text-base font-semibold text-slate-500">No finalized statements yet</p>
          <p className="text-sm">
            Finalize a week from the Standard Fleet Rule tab to see it here.
          </p>
        </div>
      </div>
    );
  }

  // --- Main Render ---
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {weekGroups.length} finalized week{weekGroups.length !== 1 ? 's' : ''}
        </p>
        <Button variant="outline" size="sm" onClick={loadReports} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {weekGroups.map((group) => {
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
                          {currency.format(group.totalSpend)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-400 text-xs block">Deduction</span>
                        <span className="font-semibold text-red-600">
                          {currency.format(group.totalDeduction)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-400 text-xs block">Net Pay</span>
                        <span className="font-semibold text-slate-700">
                          {currency.format(group.totalNetPay)}
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
                        <TableHead className="w-10" />
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
                            {currency.format(r.totalGasCardCost || 0)}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {currency.format(r.rideShareCost || 0)}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {currency.format(r.companyUsageCost ?? r.companyOpsCost ?? 0)}
                          </TableCell>
                          <TableCell className="text-right text-sm text-amber-600">
                            {currency.format(r.deadheadCost || 0)}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {currency.format(r.personalUsageCost ?? r.personalCost ?? 0)}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {currency.format(r.miscellaneousCost ?? r.miscCost ?? 0)}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {currency.format(r.driverSpend || 0)}
                          </TableCell>
                          <TableCell className="text-right font-medium text-red-600">
                            {currency.format(r.driverShare || 0)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {currency.format(r.netPay || 0)}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-slate-400 hover:text-red-600"
                              title="Remove this finalized report"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget({
                                  weekStart: r.weekStart,
                                  vehicleId: r.vehicleId,
                                  label: `${r.vehiclePlate || r.vehicleId}`,
                                });
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow className="bg-slate-50 font-semibold">
                        <TableCell>Totals ({group.reports.length} vehicles)</TableCell>
                        <TableCell className="text-right">
                          {currency.format(group.totalSpend)}
                        </TableCell>
                        <TableCell className="text-right">
                          {currency.format(
                            group.reports.reduce((s: number, r: any) => s + (r.rideShareCost || 0), 0)
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {currency.format(
                            group.reports.reduce((s: number, r: any) => s + (r.companyUsageCost ?? r.companyOpsCost ?? 0), 0)
                          )}
                        </TableCell>
                        <TableCell className="text-right text-amber-600">
                          {currency.format(
                            group.reports.reduce((s: number, r: any) => s + (r.deadheadCost || 0), 0)
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {currency.format(
                            group.reports.reduce((s: number, r: any) => s + (r.personalUsageCost ?? r.personalCost ?? 0), 0)
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {currency.format(
                            group.reports.reduce((s: number, r: any) => s + (r.miscellaneousCost ?? r.miscCost ?? 0), 0)
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {currency.format(
                            group.reports.reduce((s: number, r: any) => s + (r.driverSpend || 0), 0)
                          )}
                        </TableCell>
                        <TableCell className="text-right text-red-600">
                          {currency.format(group.totalDeduction)}
                        </TableCell>
                        <TableCell className="text-right">
                          {currency.format(group.totalNetPay)}
                        </TableCell>
                        <TableCell />
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
      })}

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Finalized Report?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the frozen snapshot for{' '}
              <strong>{deleteTarget?.label}</strong> from the Finalized tab. The original
              settlement ledger entries are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Removing...
                </>
              ) : (
                'Remove'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}