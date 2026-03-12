import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Label as RechartsLabel
} from 'recharts';
import { SafeResponsiveContainer as ResponsiveContainer } from '../ui/SafeResponsiveContainer';
import { Trip, FinancialTransaction, QuotaConfig } from '../../types/data';
import { DriverEarningsHistory } from './DriverEarningsHistory';
import { DriverExpensesHistory } from './DriverExpensesHistory';
import { DriverPayoutHistory } from './DriverPayoutHistory';

// ────────────────────────────────────────────────────────────
// Props
// ────────────────────────────────────────────────────────────

interface FinancialSubTabsProps {
  driverId: string;
  transactions: FinancialTransaction[];
  allTrips: Trip[];
  quotaConfig: QuotaConfig | null;
  platformBreakdownData: Array<{ name: string; value: number; color: string }>;
  platformTotalEarnings: number;
}

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────

export function FinancialSubTabs({
  driverId,
  transactions,
  allTrips,
  quotaConfig,
  platformBreakdownData,
  platformTotalEarnings,
}: FinancialSubTabsProps) {
  return (
    <Tabs defaultValue="earnings" className="space-y-4">
      <TabsList className="grid w-full grid-cols-3 max-w-[450px]">
        <TabsTrigger value="earnings">Earnings</TabsTrigger>
        <TabsTrigger value="expenses">Expenses</TabsTrigger>
        <TabsTrigger value="payout">Payout</TabsTrigger>
      </TabsList>

      {/* ── Earnings Sub-Tab ── */}
      <TabsContent value="earnings" className="space-y-6">
        <div className="grid grid-cols-1 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Earnings Breakdown by Platform</CardTitle>
              <CardDescription className="text-xs text-slate-500">
                All-time completed trip earnings across platforms
              </CardDescription>
            </CardHeader>
            <CardContent>
              {platformBreakdownData.length > 0 ? (
                <div className="flex flex-col md:flex-row items-center gap-6">
                  <div className="w-full md:w-1/2">
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie
                          data={platformBreakdownData}
                          cx="50%"
                          cy="50%"
                          innerRadius={65}
                          outerRadius={90}
                          paddingAngle={4}
                          dataKey="value"
                        >
                          {platformBreakdownData.map((entry, index) => (
                            <Cell key={`plat-${index}`} fill={entry.color} />
                          ))}
                          <RechartsLabel
                            position="center"
                            content={({ viewBox }: any) => {
                              const { cx, cy } = viewBox || { cx: 130, cy: 130 };
                              return (
                                <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central">
                                  <tspan x={cx} dy="-8" fontSize="18" fontWeight="bold" fill="#1e293b">
                                    {`$${platformTotalEarnings.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                                  </tspan>
                                  <tspan x={cx} dy="22" fontSize="11" fill="#94a3b8">
                                    Total Earnings
                                  </tspan>
                                </text>
                              );
                            }}
                          />
                        </Pie>
                        <Tooltip
                          formatter={(value: number) => [
                            `$${value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
                            'Earnings',
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="w-full md:w-1/2 space-y-2">
                    {platformBreakdownData.map((d) => {
                      const pct =
                        platformTotalEarnings > 0
                          ? (d.value / platformTotalEarnings) * 100
                          : 0;
                      return (
                        <div key={d.name} className="flex items-center gap-3">
                          <div
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: d.color }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-slate-700">
                                {d.name}
                              </span>
                              <span className="text-sm text-slate-600 font-medium">
                                {`$${d.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                              </span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-100 rounded-full mt-1">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${pct}%`, backgroundColor: d.color }}
                              />
                            </div>
                          </div>
                          <span className="text-xs text-slate-400 w-10 text-right">
                            {pct.toFixed(0)}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-[200px] text-slate-400 text-sm">
                  No completed trips found for earnings breakdown.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <DriverEarningsHistory
          driverId={driverId}
          quotaConfig={quotaConfig || undefined}
        />
      </TabsContent>

      {/* ── Expenses Sub-Tab ── */}
      <TabsContent value="expenses" className="space-y-6">
        <DriverExpensesHistory
          driverId={driverId}
          transactions={transactions}
          trips={allTrips}
        />
      </TabsContent>

      {/* ── Payout Sub-Tab ── */}
      <TabsContent value="payout" className="space-y-6">
        <DriverPayoutHistory
          driverId={driverId}
          transactions={transactions}
        />
      </TabsContent>
    </Tabs>
  );
}