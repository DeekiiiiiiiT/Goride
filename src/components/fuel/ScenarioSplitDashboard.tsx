import React, { useMemo } from 'react';
import { Card, CardContent } from "../ui/card";
import { WeeklyFuelReport, FuelScenario } from '../../types/fuel';
import { Vehicle } from '../../types/vehicle';
import { Car, Building2, User, AlertCircle, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";

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
        personal: number;
        misc: number;
    };
    driver: {
        total: number;
        rideShare: number;
        companyOps: number;
        personal: number;
        misc: number;
    };
}

export function ScenarioSplitDashboard({ reports, scenarios, vehicles }: ScenarioSplitDashboardProps) {

    // Helper to calculate the split for a single report
    const calculateBreakdown = (report: WeeklyFuelReport, scenario?: FuelScenario): SplitBreakdown => {
        const fuelRule = scenario?.rules.find(r => r.category === 'Fuel');
        
        const costs = {
            rideShare: report.rideShareCost,
            companyOps: report.companyUsageCost,
            personal: report.personalUsageCost,
            misc: report.miscellaneousCost
        };

        const result: SplitBreakdown = {
            company: { total: 0, rideShare: 0, companyOps: 0, personal: 0, misc: 0 },
            driver: { total: 0, rideShare: 0, companyOps: 0, personal: 0, misc: 0 }
        };

        if (!fuelRule) {
            // Default Logic
            result.company.rideShare = costs.rideShare;
            result.company.companyOps = costs.companyOps;
            result.company.misc = costs.misc * 0.5;
            
            result.driver.personal = costs.personal;
            result.driver.misc = costs.misc * 0.5;
        } else if (fuelRule.coverageType === 'Full') {
            result.company.rideShare = costs.rideShare;
            result.company.companyOps = costs.companyOps;
            result.company.misc = costs.misc;
            result.driver.personal = costs.personal;
        } else if (fuelRule.coverageType === 'Percentage') {
             const rideSharePct = (fuelRule.rideShareCoverage ?? fuelRule.coverageValue ?? 100) / 100;
             const companyOpsPct = (fuelRule.companyUsageCoverage ?? 100) / 100;
             const personalPct = (fuelRule.personalCoverage ?? 0) / 100;
             const miscPct = (fuelRule.miscCoverage ?? fuelRule.coverageValue ?? 50) / 100;

             result.company.rideShare = costs.rideShare * rideSharePct;
             result.company.companyOps = costs.companyOps * companyOpsPct;
             result.company.personal = costs.personal * personalPct;
             result.company.misc = costs.misc * miscPct;

             result.driver.rideShare = costs.rideShare * (1 - rideSharePct);
             result.driver.companyOps = costs.companyOps * (1 - companyOpsPct);
             result.driver.personal = costs.personal * (1 - personalPct);
             result.driver.misc = costs.misc * (1 - miscPct);
        } else if (fuelRule.coverageType === 'Fixed_Amount') {
            // Approximation for display
            result.company.companyOps = costs.companyOps;
            
            const allowance = fuelRule.coverageValue || 0;
            const variable = costs.rideShare + costs.misc;
            const coveredVariable = Math.min(allowance, variable);
            
            if (variable > 0) {
                const ratio = coveredVariable / variable;
                result.company.rideShare = costs.rideShare * ratio;
                result.company.misc = costs.misc * ratio;
            }

            result.driver.personal = costs.personal;
            result.driver.rideShare = costs.rideShare - result.company.rideShare;
            result.driver.misc = costs.misc - result.company.misc;
        }

        // Sum Totals
        result.company.total = result.company.rideShare + result.company.companyOps + result.company.personal + result.company.misc;
        result.driver.total = result.driver.rideShare + result.driver.companyOps + result.driver.personal + result.driver.misc;

        return result;
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
            
            let scenarioId = vehicle?.fuelScenarioId;
            let scenario = scenarios.find(s => s.id === scenarioId);

            // Phase 10: Fallback to System Default Scenario
            if (!scenario) {
                scenario = scenarios.find(s => s.isDefault);
                if (scenario) {
                    scenarioId = scenario.id;
                }
            }

            const activeScenarioId = scenarioId || 'legacy';
            const scenarioName = scenario ? scenario.name : 'Default Rule (Legacy)';

            if (!groups[activeScenarioId]) {
                groups[activeScenarioId] = {
                    name: scenarioName,
                    count: 0,
                    totalSpend: 0,
                    breakdown: {
                        company: { total: 0, rideShare: 0, companyOps: 0, personal: 0, misc: 0 },
                        driver: { total: 0, rideShare: 0, companyOps: 0, personal: 0, misc: 0 }
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
            groups[activeScenarioId].breakdown.company.personal += bd.company.personal;
            groups[activeScenarioId].breakdown.company.misc += bd.company.misc;

            groups[activeScenarioId].breakdown.driver.total += bd.driver.total;
            groups[activeScenarioId].breakdown.driver.rideShare += bd.driver.rideShare;
            groups[activeScenarioId].breakdown.driver.companyOps += bd.driver.companyOps;
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

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                        <CategoryTile 
                            title="Ride Share" 
                            icon={Car}
                            companyAmount={group.breakdown.company.rideShare}
                            driverAmount={group.breakdown.driver.rideShare}
                            tooltip="Fuel cost for logged trips."
                        />
                        <CategoryTile 
                            title="Company Ops" 
                            icon={Building2}
                            companyAmount={group.breakdown.company.companyOps}
                            driverAmount={group.breakdown.driver.companyOps}
                            tooltip="Authorized business errands & maintenance."
                        />
                        <CategoryTile 
                            title="Personal" 
                            icon={User}
                            companyAmount={group.breakdown.company.personal}
                            driverAmount={group.breakdown.driver.personal}
                            tooltip="Personal usage calculated from logs + adjustments."
                        />
                        <CategoryTile 
                            title="Misc (Leakage)" 
                            icon={AlertCircle}
                            companyAmount={group.breakdown.company.misc}
                            driverAmount={group.breakdown.driver.misc}
                            tooltip="Unaccounted fuel usage."
                        />
                    </div>
                </div>
            ))}
        </div>
    );
}

interface CategoryTileProps {
    title: string;
    icon: React.ElementType;
    companyAmount: number;
    driverAmount: number;
    tooltip: string;
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
                        <Icon className="h-4 w-4" />
                        <span className="text-sm font-medium">{title}</span>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger>
                                    <Info className="h-3 w-3 text-slate-400" />
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>{tooltip}</p>
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
