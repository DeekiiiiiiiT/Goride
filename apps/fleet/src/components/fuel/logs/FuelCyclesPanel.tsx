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
  formatFuelLogDayLabel,
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
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      {trustedCycles.length === 0 ? (
        <div className="h-24 flex flex-col items-center justify-center gap-1 text-sm text-slate-500 px-4 text-center">
          <span>
            {exceptionCycles.length > 0
              ? 'No finished full tanks this week yet'
              : 'No full tanks yet'}
          </span>
          <span className="text-[11px] text-slate-400">
            {exceptionCycles.length > 0
              ? 'Tanks that can\'t be measured yet are listed under Needs a look below. They are left out of the totals.'
              : 'A full tank shows once fills add up to a full tank with odometer readings. Set the tank size on the car if none show.'}
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
                className="overflow-hidden rounded-2xl border-0 bg-white px-4 py-1 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(15,23,42,0.06)] ring-1 ring-[#e6eeff] transition-colors hover:bg-[#f8f9ff] sm:px-6 dark:bg-[#2a2a2d] dark:ring-zinc-800"
              >
                <AccordionTrigger
                  className="hover:no-underline py-3 gap-2"
                  title={explainCycleAnomaly(cycle)}
                >
                  {/* Mobile: 2×2 grid so Efficiency stays inside the card; desktop keeps a row. */}
                  <div className="grid w-full min-w-0 flex-1 grid-cols-2 gap-x-3 gap-y-2 text-left sm:grid-cols-4 lg:flex lg:items-center lg:gap-6">
                    <div className="flex min-w-0 flex-col">
                      <span className="text-[11px] text-slate-400 font-bold uppercase">
                        {cycle.status === 'Active' ? 'Started' : 'Ended'}
                      </span>
                      <span className="truncate text-sm font-bold">
                        {formatFuelLogDayLabel(cycle.status === 'Active' ? cycle.startDate : cycle.endDate)}
                      </span>
                    </div>
                    <div className="flex min-w-0 flex-col lg:min-w-[110px]">
                      <span className="text-[11px] text-slate-400 font-bold uppercase">Car</span>
                      <span className="truncate text-sm font-medium">
                        {getVehicleName(cycle.vehicleId)}
                      </span>
                    </div>
                    <div className="flex min-w-0 flex-col">
                      <span className="text-[11px] text-slate-400 font-bold uppercase">Distance</span>
                      <span className="truncate text-sm font-bold text-indigo-600">
                        {cycle.distance.toLocaleString()} km
                      </span>
                    </div>
                    <div className="flex min-w-0 flex-col">
                      <span className="text-[11px] text-slate-400 font-bold uppercase">
                        Km a litre
                      </span>
                      <span className="truncate text-sm font-bold text-emerald-600">
                        {cycle.efficiency.toFixed(2)}{' '}
                        <span className="text-[11px] font-normal text-slate-400">km/L</span>
                      </span>
                    </div>
                    <div className="col-span-2 flex min-w-0 flex-col sm:col-span-4 lg:col-span-1 lg:min-w-[120px]">
                      <span className="text-[11px] text-slate-400 font-bold uppercase">
                        Tank filled
                      </span>
                      {tankConfigured ? (
                        <div className="mt-0.5 flex min-w-0 items-center gap-2">
                          <span className="shrink-0 text-[11px] font-bold text-slate-500">
                            {(cycle.startingPercentage || 0).toFixed(0)}%
                          </span>
                          <div className="flex h-1.5 w-14 shrink-0 overflow-hidden rounded-full border border-slate-200/50 bg-slate-100">
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
                          <span className="shrink-0 text-[11px] font-bold text-emerald-600">
                            {cycle.isCapped ? '100%' : `${calculatedEndPct.toFixed(0)}%`}
                          </span>
                        </div>
                      ) : (
                        <span className="mt-0.5 text-[11px] font-medium text-amber-600">
                          Tank size not set on this car
                        </span>
                      )}
                    </div>
                    <div className="hidden flex-1 lg:block" />
                    {cycle.signalTier === 'exception' || cycle.status === 'Anomaly' ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex w-fit shrink-0 cursor-help items-center gap-1.5 rounded-full bg-[#fffbeb] px-3 py-1 text-[12px] font-semibold text-[#b45309]">
                            <AlertCircle className="h-3 w-3" />
                            Needs a look
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[280px]">
                          <p className="font-bold text-xs text-amber-700">Why this tank needs a look:</p>
                          <p className="text-[11px] text-slate-600">{explainCycleAnomaly(cycle)}</p>
                        </TooltipContent>
                      </Tooltip>
                    ) : cycle.status === 'Active' ? (
                      <div className="flex flex-col items-start gap-1 lg:items-end">
                        <span className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full bg-[#e6eeff] px-3 py-1 text-[12px] font-semibold text-[#0d1c2e] dark:bg-zinc-800 dark:text-zinc-100">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#47464c]" /> Still filling
                        </span>
                      </div>
                    ) : cycle.trustTier === 'Soft' || cycle.resetType === 'Auto_Soft' ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex w-fit shrink-0 cursor-help items-center gap-1.5 rounded-full bg-[#ecfdf5] px-3 py-1 text-[12px] font-semibold text-[#069669]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#069669]" /> Filled to full
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[220px]">
                          <p className="text-xs font-bold">Filled to full</p>
                          <p className="text-[11px] text-slate-300">
                            The fills added up to a full tank. Any extra litres start the next tank.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex w-fit shrink-0 cursor-help items-center gap-1.5 rounded-full bg-[#ecfdf5] px-3 py-1 text-[12px] font-semibold text-[#069669]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#069669]" /> Done
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[220px]">
                          <p className="text-xs font-bold">Done</p>
                          <p className="text-[11px] text-slate-300">
                            This tank is finished, worked out from the tank size.
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
                      className="min-h-[44px] gap-1.5 rounded-xl border-0 bg-white px-5 text-[13px] font-medium shadow-sm ring-1 ring-[#c9c5cd] dark:bg-zinc-900"
                      onClick={() => onViewFills(cycle.id, cycle.vehicleId)}
                    >
                      View fills
                    </Button>
                  </div>
                  <div className="mb-4 grid grid-cols-2 gap-6 rounded-xl bg-[#eff4ff] p-4 sm:grid-cols-5 dark:bg-zinc-900/50">
                    <div>
                      <p className="text-[11px] font-bold text-slate-400 uppercase">Odometer</p>
                      <p className="text-sm tabular-nums">
                        {cycle.startOdometer?.toLocaleString()} → {cycle.endOdometer?.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-slate-400 uppercase">Fuel</p>
                      <p className="text-sm font-bold">{cycle.totalLiters.toFixed(1)} L</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-slate-400 uppercase">Cost</p>
                      <p className="text-sm font-bold">{formatFuelMoney(cycle.totalCost)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-slate-400 uppercase">Price a litre</p>
                      <p className="text-sm">{formatFuelMoney(cycle.avgPricePerLiter, 3)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-slate-400 uppercase">How it closed</p>
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
                    <TableHeader className="sticky top-0 z-10 bg-[#eff4ff] dark:bg-zinc-900">
                      <TableRow>
                        <TableHead className="h-8 text-[11px]">Date</TableHead>
                        <TableHead className="h-8 text-[11px]">Type</TableHead>
                        <TableHead className="h-8 text-[11px]">Litres in this tank</TableHead>
                        <TableHead className="h-8 text-[11px]">Cost in this tank</TableHead>
                        <TableHead className="h-8 text-[11px]">Odometer</TableHead>
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
        <div className="mt-2 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {trustedCycles.length > 0 && (
            <div className="order-2 flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(15,23,42,0.06)] dark:bg-[#2a2a2d]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[17px] font-semibold text-[#0d1c2e] dark:text-zinc-50">How far a litre goes</h3>
                  <p className="text-[13px] text-[#47464c] dark:text-zinc-400">Km a litre for each full tank</p>
                </div>
                {([...trustedCycles].filter((c) => c.status !== 'Active' && c.efficiency > 0).sort((a, b) => String(b.endDate).localeCompare(String(a.endDate)))[0]?.efficiency) ? (
                  <span className="text-right text-[28px] font-bold tabular-nums text-[#069669]">
                    {([...trustedCycles].filter((c) => c.status !== 'Active' && c.efficiency > 0).sort((a, b) => String(b.endDate).localeCompare(String(a.endDate)))[0]?.efficiency as number).toFixed(1)}
                    <span className="ml-1 text-[13px] font-medium text-[#47464c]">km/L latest</span>
                  </span>
                ) : null}
              </div>
              <FuelEfficiencyTrend cycles={trustedCycles.filter((c) => c.status !== 'Active')} width={480} height={140} className="w-full" />
            </div>
          )}
          <div ref={exceptionQueueRef} className="order-1">
            <h3 className="mb-2 flex items-center gap-2 text-[17px] font-semibold text-[#0d1c2e] dark:text-zinc-50"><span className="material-symbols-outlined text-[20px] text-[#b45309]">warning</span>Needs a look</h3>
            <FuelExceptionQueue
              cycles={exceptionCycles}
              period={periodBounds}
              isPeriodOpen={isPeriodOpen}
              onAssign={onAssignException}
              assignments={exceptionAssignments}
              getVehicleName={getVehicleName}
            />
          </div>
          {roadCards.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50/60">
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold text-slate-700"
                onClick={() => setShowRoadCards((v) => !v)}
              >
                Fills to check on the road
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
