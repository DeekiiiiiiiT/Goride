import React, { useMemo } from 'react';
import { Card, CardContent } from "../ui/card";
import { WeeklyFuelReport, FuelScenario } from '../../types/fuel';
import { Vehicle } from '../../types/vehicle';
import { Trip } from '../../types/data';
import { Car, Building2, User, Info, Navigation } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { splitAllCategoryCosts, sumSplitTotals } from '../../utils/fuelCoverageSplit';
import {
  personalCostForCoverageSplit,
  personalEarnedCostAbsorbed,
} from '../../utils/personalAllowance';
import { resolveActiveFuelPolicyForDriverWeek } from '../../utils/fuelPolicyVersion';
import { reportWeekYmdBounds } from '../../utils/fuelWeekPeriod';
import {
  addPlatformAmounts,
  allocateAmountByKmShare,
  emptyPlatformAmounts,
  platformAmountsTotal,
  sumTripKmByPlatform,
  type PlatformAmountMap,
  type RideshareInsightPlatform,
} from '../../utils/fuelPlatformSplit';

interface ScenarioSplitDashboardProps {
    reports: WeeklyFuelReport[];
    scenarios: FuelScenario[];
    vehicles: Vehicle[];
    /** Week trips — used for Roam / Uber / InDrive Ride Share + Deadhead insight. */
    trips?: Trip[];
}

interface SplitBreakdown {
    company: {
        total: number;
        rideShare: number;
        companyOps: number;
        deadhead: number;
        personal: number;
        misc: number;
    };
    driver: {
        total: number;
        rideShare: number;
        companyOps: number;
        deadhead: number;
        personal: number;
        misc: number;
    };
}

const PLATFORM_COLORS: Record<RideshareInsightPlatform, string> = {
  Roam: 'bg-violet-600',
  Uber: 'bg-neutral-800',
  InDrive: 'bg-emerald-500',
  Other: 'bg-slate-400',
};

const PLATFORM_TEXT: Record<RideshareInsightPlatform, string> = {
  Roam: 'text-violet-700',
  Uber: 'text-neutral-800',
  InDrive: 'text-emerald-700',
  Other: 'text-slate-600',
};

export function ScenarioSplitDashboard({
  reports,
  scenarios,
  vehicles: _vehicles,
  trips = [],
}: ScenarioSplitDashboardProps) {
    const calculateBreakdown = (report: WeeklyFuelReport, scenario?: FuelScenario): SplitBreakdown => {
        const fuelRule = scenario?.rules.find(r => r.category === 'Fuel');
        const personalForSplit = personalCostForCoverageSplit(report);
        const earnedAbsorb = personalEarnedCostAbsorbed(report);
        const split = splitAllCategoryCosts(
            {
                rideShare: report.rideShareCost,
                companyUsage: report.companyUsageCost,
                deadhead: report.deadheadCost || 0,
                personal: personalForSplit,
                misc: report.miscellaneousCost,
            },
            fuelRule,
        );
        const totals = sumSplitTotals(split);
        return {
            company: {
                total: totals.company + earnedAbsorb,
                rideShare: split.company.rideShare,
                companyOps: split.company.companyUsage,
                deadhead: split.company.deadhead,
                personal: split.company.personal + earnedAbsorb,
                misc: split.company.misc,
            },
            driver: {
                total: totals.driver,
                rideShare: split.driver.rideShare,
                companyOps: split.driver.companyUsage,
                deadhead: split.driver.deadhead,
                personal: split.driver.personal,
                misc: split.driver.misc,
            },
        };
    };

    const scenarioGroups = useMemo(() => {
        const groups: Record<string, {
            name: string;
            count: number;
            totalSpend: number;
            breakdown: SplitBreakdown;
            rideShareByPlatform: PlatformAmountMap;
            deadheadByPlatform: PlatformAmountMap;
            personalAllowance: {
              earnedKm: number;
              overageKm: number;
              earnedCost: number;
              overageCost: number;
              active: boolean;
            };
        }> = {};

        reports.forEach(report => {
            const weekStart = reportWeekYmdBounds(report).start;
            const weekEnd = reportWeekYmdBounds(report).end;
            const policy = resolveActiveFuelPolicyForDriverWeek(
                scenarios,
                report.driverId,
                weekStart,
            );
            const scenario = policy?.scenario;

            const activeScenarioId = scenario?.id || report.metadata?.scenarioId || 'legacy';
            const scenarioName = scenario ? scenario.name : (report.metadata?.scenarioName || 'Default Rule (Legacy)');

            if (!groups[activeScenarioId]) {
                groups[activeScenarioId] = {
                    name: scenarioName,
                    count: 0,
                    totalSpend: 0,
                    breakdown: {
                        company: { total: 0, rideShare: 0, companyOps: 0, deadhead: 0, personal: 0, misc: 0 },
                        driver: { total: 0, rideShare: 0, companyOps: 0, deadhead: 0, personal: 0, misc: 0 }
                    },
                    rideShareByPlatform: emptyPlatformAmounts(),
                    deadheadByPlatform: emptyPlatformAmounts(),
                    personalAllowance: {
                      earnedKm: 0,
                      overageKm: 0,
                      earnedCost: 0,
                      overageCost: 0,
                      active: false,
                    },
                };
            }

            const bd = calculateBreakdown(report, scenario);
            const kmByPlatform = sumTripKmByPlatform(trips, {
                weekStart,
                weekEnd,
                driverId: report.driverId || undefined,
            });
            const rideShare$ = allocateAmountByKmShare(report.rideShareCost || 0, kmByPlatform);
            const deadhead$ = allocateAmountByKmShare(report.deadheadCost || 0, kmByPlatform);
            const pa = report.metadata?.personalAllowance;

            groups[activeScenarioId].count++;
            groups[activeScenarioId].totalSpend += report.totalGasCardCost;
            groups[activeScenarioId].rideShareByPlatform = addPlatformAmounts(
                groups[activeScenarioId].rideShareByPlatform,
                rideShare$,
            );
            groups[activeScenarioId].deadheadByPlatform = addPlatformAmounts(
                groups[activeScenarioId].deadheadByPlatform,
                deadhead$,
            );
            if (pa) {
              groups[activeScenarioId].personalAllowance.active = true;
              groups[activeScenarioId].personalAllowance.earnedKm += Number(pa.earnedKm) || 0;
              groups[activeScenarioId].personalAllowance.overageKm += Number(pa.overageKm) || 0;
              groups[activeScenarioId].personalAllowance.earnedCost += Number(pa.earnedCost) || 0;
              groups[activeScenarioId].personalAllowance.overageCost += Number(pa.overageCost) || 0;
            }

            groups[activeScenarioId].breakdown.company.total += bd.company.total;
            groups[activeScenarioId].breakdown.company.rideShare += bd.company.rideShare;
            groups[activeScenarioId].breakdown.company.companyOps += bd.company.companyOps;
            groups[activeScenarioId].breakdown.company.deadhead += bd.company.deadhead;
            groups[activeScenarioId].breakdown.company.personal += bd.company.personal;
            groups[activeScenarioId].breakdown.company.misc += bd.company.misc;

            groups[activeScenarioId].breakdown.driver.total += bd.driver.total;
            groups[activeScenarioId].breakdown.driver.rideShare += bd.driver.rideShare;
            groups[activeScenarioId].breakdown.driver.companyOps += bd.driver.companyOps;
            groups[activeScenarioId].breakdown.driver.deadhead += bd.driver.deadhead;
            groups[activeScenarioId].breakdown.driver.personal += bd.driver.personal;
            groups[activeScenarioId].breakdown.driver.misc += bd.driver.misc;
        });

        return Object.values(groups);
    }, [reports, scenarios, trips]);

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

    if (scenarioGroups.length === 0) return null;

    return (
        <div className="space-y-8 mb-8">
            {scenarioGroups.map((group) => (
                <div key={group.name} className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">{group.name}</h3>
                            <p className="text-sm text-slate-500">{group.count} Vehicle{group.count !== 1 ? 's' : ''} • Total Spend: <span className="font-semibold text-slate-900">{formatCurrency(group.totalSpend)}</span></p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
                        <PlatformCategoryTile
                            title="Ride Share"
                            icon={Car}
                            amounts={group.rideShareByPlatform}
                            fallbackTotal={
                              group.breakdown.company.rideShare + group.breakdown.driver.rideShare
                            }
                            tooltip={
                                <div className="space-y-2 max-w-xs">
                                    <p className="font-semibold text-slate-100">Ride Share by platform</p>
                                    <p>Estimated fuel $ for logged trip km, allocated by each platform’s share of trip km (Roam, Uber, InDrive).</p>
                                    <div className="border-t border-slate-600 pt-1.5 space-y-1">
                                        <p className="font-medium text-slate-300 text-[11px] uppercase tracking-wide">How it's calculated</p>
                                        <p className="font-mono text-[11px]">(Trip km ÷ efficiency) × $/L, then split by platform km %</p>
                                    </div>
                                </div>
                            }
                        />
                        <CategoryTile
                            title="Company Ops"
                            icon={Building2}
                            companyAmount={group.breakdown.company.companyOps}
                            driverAmount={group.breakdown.driver.companyOps}
                            tooltip={
                                <div className="space-y-2 max-w-xs">
                                    <p className="font-semibold text-slate-100">Company Ops</p>
                                    <p>Fuel used for authorized company business — errands, maintenance runs, and other non-trip work driving.</p>
                                </div>
                            }
                        />
                        <PlatformCategoryTile
                            title="Deadhead"
                            icon={Navigation}
                            amounts={group.deadheadByPlatform}
                            fallbackTotal={
                              group.breakdown.company.deadhead + group.breakdown.driver.deadhead
                            }
                            tooltip={
                                <div className="space-y-2 max-w-xs">
                                    <p className="font-semibold text-slate-100">Deadhead by platform (insight)</p>
                                    <p>Deadhead miles aren’t tagged to an app. We allocate Deadhead $ using the same Roam / Uber / InDrive trip-km mix so you can see which book of trips is carrying repositioning cost.</p>
                                </div>
                            }
                        />
                        {group.personalAllowance.active ? (
                            <PersonalAllowanceTile
                                totalCost={
                                  group.breakdown.company.personal + group.breakdown.driver.personal
                                }
                                earnedKm={group.personalAllowance.earnedKm}
                                overageKm={group.personalAllowance.overageKm}
                                earnedCost={group.personalAllowance.earnedCost}
                                overageCost={group.personalAllowance.overageCost}
                                tooltip={
                                    <div className="space-y-2 max-w-xs">
                                        <p className="font-semibold text-slate-100">Personal Allowance</p>
                                        <p>Earned Personal km is covered 100% by the company. Overage km is charged to the driver at period fuel $/km.</p>
                                        <div className="border-t border-slate-600 pt-1.5 space-y-1">
                                            <p className="font-medium text-slate-300 text-[11px] uppercase tracking-wide">Bar meaning</p>
                                            <p>Teal = earned (free) km · Amber = overage km</p>
                                        </div>
                                    </div>
                                }
                            />
                        ) : (
                            <CategoryTile
                                title="Personal"
                                icon={User}
                                companyAmount={group.breakdown.company.personal}
                                driverAmount={group.breakdown.driver.personal}
                                tooltip={
                                    <div className="space-y-2 max-w-xs">
                                        <p className="font-semibold text-slate-100">Personal</p>
                                        <p>Residual after trips, company ops, and deadhead (includes unlabeled miles).</p>
                                    </div>
                                }
                            />
                        )}
                        <CategoryTile
                            title="Misc (Leakage)"
                            companyAmount={group.breakdown.company.misc}
                            driverAmount={group.breakdown.driver.misc}
                            tooltip={
                                <div className="space-y-2 max-w-xs">
                                    <p className="font-semibold text-slate-100">Misc (Leakage)</p>
                                    <p>Spend − (Ride Share + Company Ops + Deadhead + Personal).</p>
                                </div>
                            }
                        />
                    </div>
                </div>
            ))}
        </div>
    );
}

interface CategoryTileProps {
    title: string;
    icon?: React.ElementType;
    companyAmount: number;
    driverAmount: number;
    tooltip: React.ReactNode;
}

function CategoryTile({ title, icon: Icon, companyAmount, driverAmount, tooltip }: CategoryTileProps) {
    const total = companyAmount + driverAmount;
    const companyPct = total > 0 ? (companyAmount / total) * 100 : 0;
    const driverPct = total > 0 ? (driverAmount / total) * 100 : 0;

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

    return (
        <Card>
            <CardContent className="p-4 space-y-3">
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2 text-slate-600">
                        {Icon && <Icon className="h-4 w-4" />}
                        <span className="text-sm font-medium">{title}</span>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger>
                                    <Info className="h-3 w-3 text-slate-400" />
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-sm p-3 text-xs">
                                    {tooltip}
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                    <span className={`text-lg font-bold ${total < 0 ? 'text-emerald-600' : 'text-slate-900'}`}>
                        {formatCurrency(total)}
                    </span>
                </div>

                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex">
                    <div className="h-full bg-indigo-500" style={{ width: `${companyPct}%` }} />
                    <div className="h-full bg-amber-400" style={{ width: `${driverPct}%` }} />
                </div>

                <div className="flex justify-between items-center text-xs">
                    <div className="flex flex-col">
                        <span className="text-slate-500 mb-0.5 flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full bg-indigo-500" />
                            Company
                        </span>
                        <span className="font-semibold text-indigo-700">{formatCurrency(companyAmount)}</span>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-slate-500 mb-0.5 flex items-center gap-1">
                            Driver
                            <div className="w-2 h-2 rounded-full bg-amber-400" />
                        </span>
                        <span className="font-semibold text-amber-700">{formatCurrency(driverAmount)}</span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

interface PlatformCategoryTileProps {
    title: string;
    icon?: React.ElementType;
    amounts: PlatformAmountMap;
    /** When trips are empty, still show category total from company+driver. */
    fallbackTotal: number;
    tooltip: React.ReactNode;
}

interface PersonalAllowanceTileProps {
    totalCost: number;
    earnedKm: number;
    overageKm: number;
    earnedCost: number;
    overageCost: number;
    tooltip: React.ReactNode;
}

/** Segmented Personal card: earned vs overage km (matches Ride Share / Deadhead bar style). */
function PersonalAllowanceTile({
  totalCost,
  earnedKm,
  overageKm,
  earnedCost,
  overageCost,
  tooltip,
}: PersonalAllowanceTileProps) {
    const kmTotal = Math.max(0, earnedKm) + Math.max(0, overageKm);
    const earnedPct = kmTotal > 0 ? (earnedKm / kmTotal) * 100 : 0;
    const overagePct = kmTotal > 0 ? (overageKm / kmTotal) * 100 : 0;
    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
    const formatKm = (val: number) =>
        `${val.toLocaleString(undefined, { maximumFractionDigits: 0 })} km`;

    return (
        <Card>
            <CardContent className="p-4 space-y-3">
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2 text-slate-600">
                        <User className="h-4 w-4" />
                        <span className="text-sm font-medium">Personal</span>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger>
                                    <Info className="h-3 w-3 text-slate-400" />
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-sm p-3 text-xs">
                                    {tooltip}
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                    <span className={`text-lg font-bold ${totalCost < 0 ? 'text-emerald-600' : 'text-slate-900'}`}>
                        {formatCurrency(totalCost)}
                    </span>
                </div>

                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex">
                    <div className="h-full bg-teal-500" style={{ width: `${earnedPct}%` }} />
                    <div className="h-full bg-amber-400" style={{ width: `${overagePct}%` }} />
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex flex-col min-w-0">
                        <span className="text-slate-500 mb-0.5 flex items-center gap-1 truncate">
                            <span className="w-2 h-2 rounded-full shrink-0 bg-teal-500" />
                            Earned
                        </span>
                        <span className="font-semibold text-teal-700 truncate">{formatKm(earnedKm)}</span>
                        <span className="text-[11px] text-teal-600/80 truncate">{formatCurrency(earnedCost)} covered</span>
                    </div>
                    <div className="flex flex-col items-end min-w-0">
                        <span className="text-slate-500 mb-0.5 flex items-center gap-1 truncate">
                            Overage
                            <span className="w-2 h-2 rounded-full shrink-0 bg-amber-400" />
                        </span>
                        <span className="font-semibold text-amber-700 truncate">{formatKm(overageKm)}</span>
                        <span className="text-[11px] text-amber-600/80 truncate">{formatCurrency(overageCost)} driver</span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function PlatformCategoryTile({
  title,
  icon: Icon,
  amounts,
  fallbackTotal,
  tooltip,
}: PlatformCategoryTileProps) {
    const platformTotal = platformAmountsTotal(amounts);
    const total = platformTotal > 0.01 ? platformTotal : fallbackTotal;
    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

    const mainPlatforms: RideshareInsightPlatform[] = ['Roam', 'Uber', 'InDrive'];
    const showOther = Math.abs(amounts.Other) > 0.01;
    const bars = showOther ? [...mainPlatforms, 'Other' as const] : mainPlatforms;
    const barBase = platformTotal > 0.01 ? platformTotal : 0;

    return (
        <Card>
            <CardContent className="p-4 space-y-3">
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2 text-slate-600">
                        {Icon && <Icon className="h-4 w-4" />}
                        <span className="text-sm font-medium">{title}</span>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger>
                                    <Info className="h-3 w-3 text-slate-400" />
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-sm p-3 text-xs">
                                    {tooltip}
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                    <span className={`text-lg font-bold ${total < 0 ? 'text-emerald-600' : 'text-slate-900'}`}>
                        {formatCurrency(total)}
                    </span>
                </div>

                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex">
                    {bars.map((key) => {
                        const pct = barBase > 0 ? (Math.abs(amounts[key]) / barBase) * 100 : 0;
                        return (
                            <div
                              key={key}
                              className={`h-full ${PLATFORM_COLORS[key]}`}
                              style={{ width: `${pct}%` }}
                            />
                        );
                    })}
                </div>

                <div className="grid grid-cols-3 gap-1 text-xs">
                    {mainPlatforms.map((key) => (
                        <div key={key} className="flex flex-col min-w-0">
                            <span className="text-slate-500 mb-0.5 flex items-center gap-1 truncate">
                                <span className={`w-2 h-2 rounded-full shrink-0 ${PLATFORM_COLORS[key]}`} />
                                {key}
                            </span>
                            <span className={`font-semibold truncate ${PLATFORM_TEXT[key]}`}>
                                {formatCurrency(amounts[key])}
                            </span>
                        </div>
                    ))}
                </div>
                {showOther && (
                    <p className="text-[11px] text-slate-500">
                        Other platforms: {formatCurrency(amounts.Other)}
                    </p>
                )}
                {platformTotal < 0.01 && Math.abs(fallbackTotal) > 0.01 && (
                    <p className="text-[11px] text-amber-700">
                        No trip km by platform in this week — showing category total only.
                    </p>
                )}
            </CardContent>
        </Card>
    );
}
