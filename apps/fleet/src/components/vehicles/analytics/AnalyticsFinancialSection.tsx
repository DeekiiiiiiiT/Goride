import React from 'react';
import {
  Area, Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, Scatter, ScatterChart,
  Tooltip, XAxis, YAxis, Cell,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table';
import { SafeResponsiveContainer as ResponsiveContainer } from '../../ui/SafeResponsiveContainer';
import { formatJMD } from './AnalyticsKpiGrid';
import type {
  LeaderboardRow,
  CostByVehicleRow,
  CommissionRow,
  VehicleProfitRow,
  DailyCostPoint,
} from '../../../hooks/useVehicleAnalytics';

type Props = {
  leaderboard: LeaderboardRow[];
  leaderboardSort: 'revenue' | 'profit' | 'utilization';
  onSort: (s: 'revenue' | 'profit' | 'utilization') => void;
  costByVehicle: CostByVehicleRow[];
  profitScatter: VehicleProfitRow[];
  dailyCostBreakdown: DailyCostPoint[];
  commissionRows: CommissionRow[];
  onSelectVehicle?: (id: string) => void;
};

export function AnalyticsFinancialSection({
  leaderboard,
  leaderboardSort,
  onSort,
  costByVehicle,
  profitScatter,
  dailyCostBreakdown,
  commissionRows,
  onSelectVehicle,
}: Props) {
  const stackedData = costByVehicle.slice(0, 10).map((r) => ({
    name: r.label,
    fuel: r.costs.fuel,
    maintenance: r.costs.maintenance,
    insurance: r.costs.insurance + r.costs.fixedOther,
    operating: r.costs.operating + r.costs.cleaning,
    tolls: r.costs.tolls,
    fees: r.costs.platformFees,
  }));

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <Card className="overflow-hidden">
          <CardHeader className="space-y-3">
            <div>
              <CardTitle className="text-lg">Vehicle Revenue Leaderboard</CardTitle>
              <CardDescription>Sortable by revenue, attributed profit, or utilization.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {(['revenue', 'profit', 'utilization'] as const).map((s) => (
                <Button
                  key={s}
                  type="button"
                  size="sm"
                  variant={leaderboardSort === s ? 'default' : 'outline'}
                  className="min-h-11 capitalize"
                  onClick={() => onSort(s)}
                >
                  {s}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {leaderboard.length === 0 ? (
              <div className="flex items-center justify-center h-[200px] text-sm text-slate-400 px-6 text-center">
                No vehicle revenue in this period.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs pl-4">Vehicle</TableHead>
                      <TableHead className="text-xs">Driver</TableHead>
                      <TableHead className="text-xs text-right">Revenue</TableHead>
                      <TableHead className="text-xs text-right">Profit</TableHead>
                      <TableHead className="text-xs text-right pr-4">Util.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leaderboard.slice(0, 12).map((row, i) => (
                      <TableRow
                        key={row.vehicleId}
                        className={`cursor-pointer ${i === 0 ? 'bg-indigo-50 dark:bg-indigo-900/10' : ''}`}
                        onClick={() => onSelectVehicle?.(row.vehicleId)}
                      >
                        <TableCell className="text-sm font-semibold pl-4">{row.label}</TableCell>
                        <TableCell className="text-sm">{row.driverName}</TableCell>
                        <TableCell className="text-sm text-right tabular-nums">{formatJMD(row.revenue)}</TableCell>
                        <TableCell className="text-sm text-right tabular-nums">
                          {row.profit != null ? formatJMD(row.profit) : '—'}
                        </TableCell>
                        <TableCell className="text-right pr-4">
                          {row.utilizationPct != null ? (
                            <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[11px] font-bold">
                              {row.utilizationPct.toFixed(0)}%
                            </Badge>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Cost per Vehicle</CardTitle>
            <CardDescription>Attributed ledger categories only (top 10).</CardDescription>
          </CardHeader>
          <CardContent className="min-h-[300px]">
            {stackedData.length === 0 ? (
              <div className="flex items-center justify-center h-[280px] text-sm text-slate-400 text-center px-4">
                No vehicle-assigned costs in this period.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={stackedData} layout="vertical" margin={{ left: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" hide />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={90}
                    tick={{ fontSize: 10, fontWeight: 'bold' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    formatter={(value) => formatJMD(Number(value))}
                  />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="fuel" stackId="a" fill="#f59e0b" name="Fuel" />
                  <Bar dataKey="maintenance" stackId="a" fill="#8b5cf6" name="Maintenance" />
                  <Bar dataKey="insurance" stackId="a" fill="#6366f1" name="Insurance/Fixed" />
                  <Bar dataKey="operating" stackId="a" fill="#94a3b8" name="Operating" />
                  <Bar dataKey="tolls" stackId="a" fill="#06b6d4" name="Tolls" />
                  <Bar dataKey="fees" stackId="a" fill="#ef4444" name="Platform fees" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Profit Margin vs Revenue</CardTitle>
            <CardDescription>Only vehicles with attributed costs — outliers stand out.</CardDescription>
          </CardHeader>
          <CardContent className="min-h-[300px]">
            {profitScatter.length === 0 ? (
              <div className="flex items-center justify-center h-[280px] text-sm text-slate-400 text-center px-4">
                Need vehicles with both revenue and assigned ledger costs.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <ScatterChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    type="number"
                    dataKey="revenue"
                    name="Revenue"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  />
                  <YAxis
                    type="number"
                    dataKey="marginPct"
                    name="Margin %"
                    unit="%"
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    formatter={(value, name) =>
                      String(name).toLowerCase().includes('revenue')
                        ? [formatJMD(Number(value)), 'Revenue']
                        : [`${Number(value).toFixed(1)}%`, 'Margin']
                    }
                    labelFormatter={(_, payload) => (payload?.[0]?.payload as VehicleProfitRow)?.label || ''}
                  />
                  <Scatter data={profitScatter} fill="#6366f1">
                    {profitScatter.map((p) => (
                      <Cell key={p.vehicleId} fill={p.marginPct >= 0 ? '#10b981' : '#ef4444'} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Daily Revenue & Costs</CardTitle>
            <CardDescription>Trip revenue over dated ledger cost categories.</CardDescription>
          </CardHeader>
          <CardContent className="min-h-[300px]">
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={dailyCostBreakdown}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(value) => formatJMD(Number(value))}
                />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="revenue" stroke="#6366f1" fill="#6366f1" fillOpacity={0.15} name="Revenue" />
                <Line type="monotone" dataKey="totalCost" stroke="#ef4444" strokeDasharray="4 4" dot={false} name="Total cost" />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-lg">Platform Fees by Vehicle</CardTitle>
          <CardDescription>
            Recognized commission from ledger events assigned to a vehicle. Fee rate is actual fees ÷ gross — not labelled leakage without a configured expected rate.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {commissionRows.length === 0 ? (
            <div className="flex items-center justify-center h-[160px] text-sm text-slate-400 px-6 text-center">
              No vehicle-assigned platform fee events in this period.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[320px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs pl-4">Vehicle</TableHead>
                    <TableHead className="text-xs text-right">Gross</TableHead>
                    <TableHead className="text-xs text-right">Fees</TableHead>
                    <TableHead className="text-xs text-right pr-4">Fee rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {commissionRows.map((row) => (
                    <TableRow key={row.vehicleId} className="cursor-pointer" onClick={() => onSelectVehicle?.(row.vehicleId)}>
                      <TableCell className="text-sm font-semibold pl-4">{row.label}</TableCell>
                      <TableCell className="text-sm text-right tabular-nums">{formatJMD(row.gross)}</TableCell>
                      <TableCell className="text-sm text-right tabular-nums">{formatJMD(row.fees)}</TableCell>
                      <TableCell className="text-sm text-right pr-4 tabular-nums">
                        {row.feeRatePct != null ? `${row.feeRatePct.toFixed(1)}%` : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
