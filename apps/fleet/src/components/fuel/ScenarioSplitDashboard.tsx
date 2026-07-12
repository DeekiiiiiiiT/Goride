import React, { useMemo } from 'react';
import { Card, CardContent } from "../ui/card";
import { WeeklyFuelReport, FuelScenario } from '../../types/fuel';
import { Vehicle } from '../../types/vehicle';
import { Car, Building2, User, Info, Navigation } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { splitAllCategoryCosts, sumSplitTotals } from '../../utils/fuelCoverageSplit';
import { pickScenarioForVehicleWeek } from '../../utils/fuelPolicyVersion';

interface ScenarioSplitDashboardProps {
    reports: WeeklyFuelReport[];
    scenarios: FuelScenario[];
    vehicles: Vehicle[];
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

export function ScenarioSplitDashboard({ reports, scenarios, vehicles }: ScenarioSplitDashboardProps) {

    // Shared contract with fuelCalculationService / fuelCoverageSplit
    const calculateBreakdown = (report: WeeklyFuelReport, scenario?: FuelScenario): SplitBreakdown => {
        const fuelRule = scenario?.rules.find(r => r.category === 'Fuel');
        const split = splitAllCategoryCosts(
            {
                rideShare: report.rideShareCost,
                companyUsage: report.companyUsageCost,
                deadhead: report.deadheadCost || 0,
                personal: report.personalUsageCost,
                misc: report.miscellaneousCost,
            },
            fuelRule,
        );
        const totals = sumSplitTotals(split);
        return {
            company: {
                total: totals.company,
                rideShare: split.company.rideShare,
                companyOps: split.company.companyUsage,
                deadhead: split.company.deadhead,
                personal: split.company.personal,
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

    // Aggregate Data by Scenario
    const scenarioGroups = useMemo(() => {
        const groups: Record<string, { 
            name: string, 
            count: number, 
            totalSpend: number,
            breakdown: SplitBreakdown 
        }> = {};

        reports.forEach(report => {
            const vehicle = vehicles.find(v => v.id === report.vehicleId);
            const weekStart = String(report.weekStart).split('T')[0];
            const scenario = pickScenarioForVehicleWeek(
                scenarios,
                vehicle?.fuelScenarioId,
                weekStart,
            );

            const activeScenarioId = scenario?.id || vehicle?.fuelScenarioId || 'legacy';
            const scenarioName = scenario ? scenario.name : 'Default Rule (Legacy)';

            if (!groups[activeScenarioId]) {
                groups[activeScenarioId] = {
                    name: scenarioName,
                    count: 0,
                    totalSpend: 0,
                    breakdown: {
                        company: { total: 0, rideShare: 0, companyOps: 0, deadhead: 0, personal: 0, misc: 0 },
                        driver: { total: 0, rideShare: 0, companyOps: 0, deadhead: 0, personal: 0, misc: 0 }
                    }
                };
            }

            const bd = calculateBreakdown(report, scenario);

            groups[activeScenarioId].count++;
            groups[activeScenarioId].totalSpend += report.totalGasCardCost;
            
            // Aggregate
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
    }, [reports, scenarios, vehicles]);

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
                        <CategoryTile 
                            title="Ride Share" 
                            icon={Car}
                            companyAmount={group.breakdown.company.rideShare}
                            driverAmount={group.breakdown.driver.rideShare}
                            tooltip={
                                <div className="space-y-2 max-w-xs">
                                    <p className="font-semibold text-slate-100">Ride Share</p>
                                    <p>Fuel consumed during active rideshare passenger trips (Uber, InDrive, etc.).</p>
                                    <div className="border-t border-slate-600 pt-1.5 space-y-1">
                                        <p className="font-medium text-slate-300 text-[11px] uppercase tracking-wide">How it's calculated</p>
                                        <p className="font-mono text-[11px]">(Trip km ÷ efficiency km/L) × $/L</p>
                                        <p className="text-slate-400 text-[11px]">Trip km comes from completed rideshare trip logs. Efficiency and price per liter are derived from actual fuel entries in the period.</p>
                                    </div>
                                    <div className="border-t border-slate-600 pt-1.5">
                                        <p className="font-medium text-slate-300 text-[11px] uppercase tracking-wide">Company / Driver split</p>
                                        <p className="text-slate-400 text-[11px]">Split is determined by the Ride Share coverage % in the active fuel scenario.</p>
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
                                    <div className="border-t border-slate-600 pt-1.5 space-y-1">
                                        <p className="font-medium text-slate-300 text-[11px] uppercase tracking-wide">How it's calculated</p>
                                        <p className="font-mono text-[11px]">(Company ops km ÷ efficiency km/L) × $/L</p>
                                        <p className="text-slate-400 text-[11px]">Company ops km comes from mileage adjustments tagged as "Company_Misc" or "Maintenance."</p>
                                    </div>
                                    <div className="border-t border-slate-600 pt-1.5">
                                        <p className="font-medium text-slate-300 text-[11px] uppercase tracking-wide">Company / Driver split</p>
                                        <p className="text-slate-400 text-[11px]">Split follows the Company Ops coverage % on the active fuel policy (often 100% company, but configurable).</p>
                                    </div>
                                </div>
                            }
                        />
                        <CategoryTile 
                            title="Deadhead" 
                            icon={Navigation}
                            companyAmount={group.breakdown.company.deadhead}
                            driverAmount={group.breakdown.driver.deadhead}
                            tooltip={
                                <div className="space-y-2 max-w-xs">
                                    <p className="font-semibold text-slate-100">Deadhead</p>
                                    <p>Fuel burned while repositioning or cruising between trips — driving without a passenger that is still work-related.</p>
                                    <div className="border-t border-slate-600 pt-1.5 space-y-1">
                                        <p className="font-medium text-slate-300 text-[11px] uppercase tracking-wide">How it's calculated</p>
                                        <p className="font-mono text-[11px]">(Deadhead km ÷ efficiency km/L) × $/L</p>
                                        <p className="text-slate-400 text-[11px]">Deadhead km is sourced from the fleet deadhead attribution API, then capped so it never exceeds the residual km (odometer delta − trip km − company ops km).</p>
                                    </div>
                                    <div className="border-t border-slate-600 pt-1.5">
                                        <p className="font-medium text-slate-300 text-[11px] uppercase tracking-wide">Company / Driver split</p>
                                        <p className="text-slate-400 text-[11px]">Split is determined by the Deadhead coverage % in the active fuel scenario. Falls back to Company Ops % if not explicitly set.</p>
                                    </div>
                                </div>
                            }
                        />
                        <CategoryTile 
                            title="Personal" 
                            icon={User}
                            companyAmount={group.breakdown.company.personal}
                            driverAmount={group.breakdown.driver.personal}
                            tooltip={
                                <div className="space-y-2 max-w-xs">
                                    <p className="font-semibold text-slate-100">Personal</p>
                                    <p>Fuel consumed for non-work personal driving. This is the true personal residual after all work-related categories have been subtracted.</p>
                                    <div className="border-t border-slate-600 pt-1.5 space-y-1">
                                        <p className="font-medium text-slate-300 text-[11px] uppercase tracking-wide">How it's calculated</p>
                                        <p className="font-mono text-[11px]">(Personal km ÷ efficiency km/L) × $/L</p>
                                        <p className="text-slate-400 text-[11px]">Personal km = Total odometer delta − Trip km − Company Ops km − Deadhead km. If no odometer data exists, falls back to mileage adjustments tagged as "Personal."</p>
                                    </div>
                                    <div className="border-t border-slate-600 pt-1.5">
                                        <p className="font-medium text-slate-300 text-[11px] uppercase tracking-wide">Company / Driver split</p>
                                        <p className="text-slate-400 text-[11px]">Split is determined by the Personal coverage % in the active fuel scenario. Typically 0% company-covered (fully driver responsibility).</p>
                                    </div>
                                </div>
                            }
                        />
                        <CategoryTile 
                            title="Misc (Leakage)" 
                            companyAmount={group.breakdown.company.misc}
                            driverAmount={group.breakdown.driver.misc}
                            tooltip={
                                <div className="space-y-2 max-w-xs">
                                    <p className="font-semibold text-slate-100">Misc (Leakage)</p>
                                    <p>Unaccounted fuel — the gap between what was actually spent on the gas card and what can be explained by all known usage categories.</p>
                                    <div className="border-t border-slate-600 pt-1.5 space-y-1">
                                        <p className="font-medium text-slate-300 text-[11px] uppercase tracking-wide">How it's calculated</p>
                                        <p className="font-mono text-[11px]">Total Spend − (Ride Share + Company Ops + Deadhead + Personal)</p>
                                        <p className="text-slate-400 text-[11px]">A positive value may indicate efficiency drift between estimated and actual consumption, fuel price variance, data gaps in odometer readings, or potential misuse.</p>
                                    </div>
                                    <div className="border-t border-slate-600 pt-1.5">
                                        <p className="font-medium text-slate-300 text-[11px] uppercase tracking-wide">Company / Driver split</p>
                                        <p className="text-slate-400 text-[11px]">Split is determined by the Misc coverage % in the active fuel scenario. Typically shared 50/50 unless explicitly configured.</p>
                                    </div>
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

    const isNonZero = Math.abs(total) > 0.01;

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

                {/* Progress Bar */}
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex">
                    <div 
                        className="h-full bg-indigo-500" 
                        style={{ width: `${companyPct}%` }}
                    />
                    <div 
                        className="h-full bg-amber-400" 
                        style={{ width: `${driverPct}%` }}
                    />
                </div>

                {/* Legend / Values */}
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