import React, { useMemo, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../ui/table';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/tooltip';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../../ui/accordion';
import { cn } from '../../ui/utils';
import {
  AlertCircle,
  Fuel,
  CreditCard,
  Banknote,
  HelpCircle,
  RotateCcw,
  Scissors,
  Pencil,
  ChevronDown,
} from 'lucide-react';
import { FuelCycle, FuelEntry } from '../../../types/fuel';
import { Vehicle } from '../../../types/vehicle';
import { formatFuelMoney } from '../../../utils/formatFuelMoney';
import { explainCycleAnomaly } from '../../../utils/fuelAnomalyExplain';
import type { PeriodBoundsYmd } from '../../../utils/fuelCycleTrust';
import { toMobileFuelReviewCards } from '../../../utils/fuelMobileReview';
import {
  buildScheduledFuelExportRows,
  priorCompletedWeekRange,
} from '../../../utils/fuelScheduledExport';
import { FuelExceptionQueue } from './FuelExceptionQueue';
import { FuelEfficiencyTrend } from './FuelEfficiencyTrend';
import {
  formatFuelLogDate,
  humanizeEntryType,
  humanizeResetType,
} from './fuelLogDisplay';

function getTypeIcon(label: string) {
  switch (label) {
    case 'Gas Card':
      return <CreditCard className="h-4 w-4 text-indigo-500" />;
    case 'Driver Cash':
      return <Banknote className="h-4 w-4 text-emerald-500" />;
    case 'RideShare Cash':
      return <Banknote className="h-4 w-4 text-orange-500" />;
    case 'Petty Cash':
      return <Banknote className="h-4 w-4 text-amber-500" />;
    case 'Reimbursement':
      return <HelpCircle className="h-4 w-4 text-slate-400" />;
    default:
      return <Fuel className="h-4 w-4 text-slate-500" />;
  }
}

export type FuelCyclesPanelProps = {
  trustedCycles: FuelCycle[];
  exceptionCycles: FuelCycle[];
  vehicles: Vehicle[];
  periodBounds: PeriodBoundsYmd;
  isPeriodOpen: boolean;
  getVehicleName: (id?: string) => string;
  canEdit: boolean;
  onEdit: (entry: FuelEntry) => void;
  onViewFills: (cycleId: string, vehicleId?: string) => void;
  onAssignException: (cycleId: string, note: string) => void;
  exceptionAssignments: Record<string, { note: string; at: string; by?: string }>;
  exceptionQueueRef?: React.Ref<HTMLDivElement>;
};

export function FuelCyclesPanel({
  trustedCycles,
  exceptionCycles,
  vehicles,
  periodBounds,
  isPeriodOpen,
  getVehicleName,
  canEdit,
  onEdit,
  onViewFills,
  onAssignException,
  exceptionAssignments,
  exceptionQueueRef,
}: FuelCyclesPanelProps) {
  const [showRoadCards, setShowRoadCards] = useState(false);

  const exceptionEntries = useMemo(() => {
    const out: FuelEntry[] = [];
    for (const c of exceptionCycles) {
      for (const tx of c.transactions ?? []) {
        if (!tx.isCarryover) out.push(tx);
      }
    }
    return out;
  }, [exceptionCycles]);

  const roadCards = useMemo(
    () => toMobileFuelReviewCards(exceptionEntries),
    [exceptionEntries],
  );

  // Keep scheduled-export helper reachable for ops / future cron (preview count).
  const scheduledPreviewCount = useMemo(
    () => buildScheduledFuelExportRows(exceptionEntries, getVehicleName, () => '').length,
    [exceptionEntries, getVehicleName],
  );

  return (
    <div className="p-4">
      {trustedCycles.length === 0 ? (
        <div className="h-24 flex flex-col items-center justify-center gap-1 text-sm text-slate-500 px-4 text-center">
          <span>
            {exceptionCycles.length > 0
              ? 'No completed full tanks in this week yet'
              : 'No fuel cycles identified'}
          </span>
          <span className="text-[11px] text-slate-400">
            {exceptionCycles.length > 0
              ? 'Incomplete tank history is in the Exception queue below — excluded from period totals.'
              : 'Cycles appear after capacity-close fills with odometer. Set tank capacity on the vehicle if closes are missing.'}
          </span>
        </div>
      ) : (
        <Accordion type="multiple" className="space-y-3">
          {trustedCycles.map((cycle) => {
            const vehicle = vehicles.find((v) => v.id === cycle.vehicleId);
            const tankCap =
              Number(vehicle?.specifications?.tankCapacity) ||
              vehicle?.fuelSettings?.tankCapacity ||
              0;
            const tankConfigured = tankCap > 0;
            const calculatedEndPct = tankConfigured
              ? Math.min(100, (cycle.startingPercentage || 0) + (cycle.totalLiters / tankCap) * 100)
              : 0;

            return (
              <AccordionItem
                key={cycle.id}
                value={cycle.id}
                className="border rounded-xl px-4 py-1 hover:bg-slate-50/50 transition-colors"
              >
                <AccordionTrigger
                  className="hover:no-underline py-3"
                  title={explainCycleAnomaly(cycle)}
                >
                  <div className="flex items-center gap-6 w-full text-left">
                    <div className="flex flex-col">
                      <span className="text-[11px] text-slate-400 font-bold uppercase">
                        {cycle.status === 'Active' ? 'Started' : 'Cycle End'}
                      </span>
                      <span className="text-sm font-bold">
                        {formatFuelLogDate(
                          cycle.status === 'Active' ? cycle.startDate : cycle.endDate,
                        )}
                      </span>
                    </div>
                    <div className="flex flex-col min-w-[110px]">
                      <span className="text-[11px] text-slate-400 font-bold uppercase">Vehicle</span>
                      <span className="text-sm font-medium">{getVehicleName(cycle.vehicleId)}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[11px] text-slate-400 font-bold uppercase">Distance</span>
                      <span className="text-sm font-bold text-indigo-600">
                        {cycle.distance.toLocaleString()} km
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[11px] text-slate-400 font-bold uppercase">
                        Efficiency
                      </span>
                      <span className="text-sm font-bold text-emerald-600">
                        {cycle.efficiency.toFixed(2)}{' '}
                        <span className="text-[11px] font-normal text-slate-400">km/L</span>
                      </span>
                    </div>
                    <div className="flex flex-col min-w-[120px]">
                      <span className="text-[11px] text-slate-400 font-bold uppercase">
                        Tank Range
                      </span>
                      {tankConfigured ? (
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] font-bold text-slate-500">
                            {(cycle.startingPercentage || 0).toFixed(0)}%
                          </span>
                          <div className="h-1.5 w-14 bg-slate-100 rounded-full overflow-hidden flex border border-slate-200/50">
                            <div
                              className="h-full bg-slate-200"
                              style={{ width: `${cycle.startingPercentage || 0}%` }}
                            />
                            <div
                              className="h-full bg-emerald-500"
                              style={{
                                width: `${Math.min(
                                  100 - (cycle.startingPercentage || 0),
                                  (cycle.totalLiters / tankCap) * 100,
                                )}%`,
                              }}
                            />
                          </div>
                          <span className="text-[11px] font-bold text-emerald-600">
                            {cycle.isCapped ? '100%' : `${calculatedEndPct.toFixed(0)}%`}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[11px] font-medium text-amber-600 mt-0.5">
                          Tank capacity not configured
                        </span>
                      )}
                    </div>
                    <div className="flex-1" />
                    {cycle.signalTier === 'exception' || cycle.status === 'Anomaly' ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge className="bg-rose-50 text-rose-700 border-rose-200 gap-1.5 cursor-help">
                            <AlertCircle className="h-3 w-3" />
                            EXCEPTION
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[280px]">
                          <p className="font-bold text-xs text-rose-600">Cycle exception:</p>
                          <p className="text-[11px] text-slate-600">{explainCycleAnomaly(cycle)}</p>
                        </TooltipContent>
                      </Tooltip>
                    ) : cycle.status === 'Active' ? (
                      <div className="flex flex-col items-end gap-1">
                        <Badge className="bg-blue-50 text-blue-700 border-blue-200 animate-pulse">
                          ACTIVE CYCLE
                        </Badge>
                        <span className="text-[11px] text-blue-500 font-bold uppercase">
                          Calculating...
                        </span>
                      </div>
                    ) : cycle.trustTier === 'Soft' || cycle.resetType === 'Auto_Soft' ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge className="bg-teal-50 text-teal-800 border-teal-200 gap-1 cursor-help">
                            Full Tank
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[220px]">
                          <p className="text-xs font-bold">Full Tank close</p>
                          <p className="text-[11px] text-slate-300">
                            Cumulative liters reached ~98% of tank. Spillover liters open the next cycle.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1 cursor-help">
                            COMPLETE
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[220px]">
                          <p className="text-xs font-bold">Closed cycle</p>
                          <p className="text-[11px] text-slate-300">
                            Cycle ended from capacity math (historical rows may still show older labels).
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pt-4 pb-2 border-t mt-1">
                  <div className="mb-3 flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1.5"
                      onClick={() => onViewFills(cycle.id, cycle.vehicleId)}
                    >
                      View fills
                    </Button>
                  </div>
                  <div className="grid grid-cols-5 gap-6 bg-slate-50 p-4 rounded-lg mb-4 border border-slate-100">
                    <div>
                      <p className="text-[11px] font-bold text-slate-400 uppercase">Odo Range</p>
                      <p className="text-xs font-mono">
                        {cycle.startOdometer?.toLocaleString()} → {cycle.endOdometer?.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-slate-400 uppercase">Total Fuel</p>
                      <p className="text-sm font-bold">{cycle.totalLiters.toFixed(1)} L</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-slate-400 uppercase">Total Cost</p>
                      <p className="text-sm font-bold">{formatFuelMoney(cycle.totalCost)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-slate-400 uppercase">Avg Price/L</p>
                      <p className="text-sm">{formatFuelMoney(cycle.avgPricePerLiter, 3)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-slate-400 uppercase">Close Mode</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Badge variant="outline" className="text-[11px] font-bold">
                          {humanizeResetType(cycle.resetType)}
                        </Badge>
                        {cycle.isCapped && (
                          <Badge className="text-[11px] bg-amber-100 text-amber-700 border-amber-200">
                            CAPPED @ 98%
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <Table>
                    <TableHeader className="bg-slate-50/50 sticky top-0 z-10">
                      <TableRow>
                        <TableHead className="h-8 text-[11px]">Date</TableHead>
                        <TableHead className="h-8 text-[11px]">Type</TableHead>
                        <TableHead className="h-8 text-[11px]">Contrib. Volume</TableHead>
                        <TableHead className="h-8 text-[11px]">Contrib. Cost</TableHead>
                        <TableHead className="h-8 text-[11px]">Odo</TableHead>
                        <TableHead className="h-8 text-[11px] text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(cycle.transactions ?? []).map((tx, txIdx) => (
                        <TableRow
                          key={`${tx.id}-${txIdx}`}
                          className={cn('group hover:bg-slate-50', tx.isCarryover && 'bg-blue-50/30')}
                        >
                          <TableCell className="py-2 text-xs">
                            <div className="flex flex-col">
                              <span>{formatFuelLogDate(tx.date)}</span>
                              {tx.isCarryover && (
                                <span className="text-[11px] text-blue-600 font-bold uppercase flex items-center gap-0.5">
                                  <RotateCcw className="h-2 w-2" /> Balance from Prev.
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="py-2 text-xs">
                            <div className="flex items-center gap-1">
                              {getTypeIcon(humanizeEntryType(String(tx.type || '')))}
                              {humanizeEntryType(String(tx.type || 'Fuel'))}
                            </div>
                          </TableCell>
                          <TableCell className="py-2 text-xs font-medium">
                            <div className="flex items-center gap-1.5">
                              {tx.volumeContributed?.toFixed(1) || tx.liters?.toFixed(1)} L
                              {tx.volumeContributed !== undefined &&
                                tx.liters !== undefined &&
                                tx.volumeContributed < tx.liters &&
                                !tx.isCarryover && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="flex items-center text-[11px] text-amber-600 bg-amber-50 px-1 rounded border border-amber-200 cursor-help font-bold">
                                        <Scissors className="h-2 w-2 mr-0.5" /> SPLIT
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="text-xs font-bold">Partial Fill applied to this cycle</p>
                                      <p className="text-[11px]">Receipt: {tx.liters.toFixed(1)} L</p>
                                      <p className="text-[11px] text-emerald-600 font-medium">
                                        {(tx.liters - tx.volumeContributed).toFixed(1)} L carried to next tank
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                            </div>
                          </TableCell>
                          <TableCell className="py-2 text-xs font-bold">
                            {formatFuelMoney(
                              tx.volumeContributed !== undefined &&
                                tx.liters !== undefined &&
                                tx.liters > 0 &&
                                !tx.isCarryover
                                ? tx.amount * (tx.volumeContributed / tx.liters)
                                : tx.isCarryover
                                  ? 0
                                  : tx.amount,
                            )}
                          </TableCell>
                          <TableCell className="py-2 text-xs font-mono">
                            {tx.odometer?.toLocaleString() || '-'}
                          </TableCell>
                          <TableCell className="py-2 text-right">
                            {!tx.isCarryover && canEdit && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                disabled={!!(tx.isLocked || tx.status === 'Finalized')}
                                title={
                                  tx.isLocked || tx.status === 'Finalized'
                                    ? 'Locked seal — edit disabled'
                                    : 'Edit log'
                                }
                                onClick={() => onEdit(tx)}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

      {(trustedCycles.length > 0 || exceptionCycles.length > 0) && (
        <div className="mt-6 space-y-4">
          {trustedCycles.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Efficiency trend</h3>
              <FuelEfficiencyTrend cycles={trustedCycles} />
            </div>
          )}
          <div ref={exceptionQueueRef}>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Exception queue</h3>
            <FuelExceptionQueue
              cycles={exceptionCycles}
              period={periodBounds}
              isPeriodOpen={isPeriodOpen}
              onAssign={onAssignException}
              assignments={exceptionAssignments}
            />
          </div>
          {roadCards.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50/60">
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold text-slate-700"
                onClick={() => setShowRoadCards((v) => !v)}
              >
                Road review cards
                <ChevronDown
                  className={cn('h-4 w-4 text-slate-400 transition-transform', showRoadCards && 'rotate-180')}
                />
              </button>
              {showRoadCards && (
                <ul className="space-y-2 border-t border-slate-200 px-3 py-3">
                  {(() => {
                    const win = priorCompletedWeekRange();
                    return (
                      <li className="text-[11px] text-slate-500 px-1">
                        Scheduled export window (prior completed week): {win.start} → {win.end}
                        {scheduledPreviewCount > 0
                          ? ` · ${scheduledPreviewCount} exception fill(s) in payload shape`
                          : ''}
                      </li>
                    );
                  })()}
                  {roadCards.map((card) => (
                    <li
                      key={card.id}
                      className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs"
                    >
                      <div className="font-semibold text-slate-800">{card.title}</div>
                      <div className="text-slate-500">{card.subtitle}</div>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="font-medium text-slate-700">{card.amount}</span>
                        <Badge variant="outline" className="text-[11px]">
                          {card.status}
                        </Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default FuelCyclesPanel;
