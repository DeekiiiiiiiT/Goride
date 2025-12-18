import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { FinancialTransaction } from "../../types/data";
import { Calculator, Calendar, DollarSign } from "lucide-react";
import { format, startOfWeek, endOfWeek, isWithinInterval } from "date-fns";

interface DriverConfig {
  driverId: string;
  driverName: string;
  type: 'Commission' | 'Salary';
  rate: number;
}

interface PayoutCalculatorProps {
  transactions: FinancialTransaction[];
  configs: DriverConfig[];
  onGenerate: (payouts: any[]) => void;
}

export function PayoutCalculator({ transactions, configs, onGenerate }: PayoutCalculatorProps) {
  const [startDate, setStartDate] = useState(format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'));

  const calculations = useMemo(() => {
    // 1. Filter Revenue Transactions in Date Range
    const periodRevenue = transactions.filter(t => 
        t.type === 'Revenue' && 
        t.driverId &&
        isWithinInterval(new Date(t.date), { 
            start: new Date(startDate), 
            end: new Date(endDate) 
        })
    );

    // 2. Group by Driver
    const driverStats = new Map<string, { revenue: number, trips: number }>();
    periodRevenue.forEach(t => {
        if (!t.driverId) return;
        const current = driverStats.get(t.driverId) || { revenue: 0, trips: 0 };
        driverStats.set(t.driverId, {
            revenue: current.revenue + Math.abs(t.amount),
            trips: current.trips + 1
        });
    });

    // 3. Apply Config
    return configs.map(config => {
        const stats = driverStats.get(config.driverId) || { revenue: 0, trips: 0 };
        let grossPay = 0;
        
        if (config.type === 'Commission') {
            grossPay = stats.revenue * (config.rate / 100);
        } else {
            grossPay = config.rate; // Fixed Salary (assuming pro-rated or full for period)
        }

        return {
            driverId: config.driverId,
            driverName: config.driverName,
            trips: stats.trips,
            totalRevenue: stats.revenue,
            config: config,
            grossPay: grossPay,
            netPay: grossPay // Deductions could go here
        };
    }).filter(c => c.totalRevenue > 0 || c.config.type === 'Salary');

  }, [transactions, configs, startDate, endDate]);

  const totalPayout = calculations.reduce((acc, c) => acc + c.netPay, 0);

  const handleGenerate = () => {
    onGenerate(calculations.map(c => ({
        id: `pay_${Date.now()}_${c.driverId}`,
        driverId: c.driverId,
        driverName: c.driverName,
        amount: c.netPay,
        date: new Date().toISOString().split('T')[0],
        status: 'Pending',
        periodStart: startDate,
        periodEnd: endDate,
        details: `${c.trips} trips, ${c.config.type === 'Commission' ? `${c.config.rate}%` : 'Fixed'}`
    })));
  };

  return (
    <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
             <Card className="md:col-span-2">
                 <CardHeader className="pb-3">
                     <CardTitle>Period Selection</CardTitle>
                 </CardHeader>
                 <CardContent>
                     <div className="flex items-end gap-4">
                         <div className="space-y-2 flex-1">
                             <Label>Start Date</Label>
                             <div className="relative">
                                 <Calendar className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                                 <Input type="date" className="pl-8" value={startDate} onChange={e => setStartDate(e.target.value)} />
                             </div>
                         </div>
                         <div className="space-y-2 flex-1">
                             <Label>End Date</Label>
                             <div className="relative">
                                 <Calendar className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                                 <Input type="date" className="pl-8" value={endDate} onChange={e => setEndDate(e.target.value)} />
                             </div>
                         </div>
                     </div>
                 </CardContent>
             </Card>
             <Card className="bg-slate-900 text-white">
                 <CardHeader className="pb-2">
                     <CardTitle className="text-slate-400 text-sm">Estimated Payout</CardTitle>
                 </CardHeader>
                 <CardContent>
                     <div className="text-3xl font-bold">${totalPayout.toFixed(2)}</div>
                     <p className="text-xs text-slate-400 mt-1">{calculations.length} drivers eligible</p>
                 </CardContent>
             </Card>
        </div>

        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle>Calculation Preview</CardTitle>
                    <Button onClick={handleGenerate} disabled={calculations.length === 0} className="gap-2">
                        <Calculator className="h-4 w-4" /> Generate Payouts
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Driver</TableHead>
                            <TableHead className="text-center">Trips</TableHead>
                            <TableHead className="text-right">Total Revenue</TableHead>
                            <TableHead className="text-center">Rate</TableHead>
                            <TableHead className="text-right">Calculated Pay</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {calculations.length > 0 ? (
                            calculations.map(c => (
                                <TableRow key={c.driverId}>
                                    <TableCell className="font-medium">{c.driverName}</TableCell>
                                    <TableCell className="text-center">{c.trips}</TableCell>
                                    <TableCell className="text-right">${c.totalRevenue.toFixed(2)}</TableCell>
                                    <TableCell className="text-center">
                                        <Badge variant="outline">
                                            {c.config.type === 'Commission' ? `${c.config.rate}%` : 'Salary'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right font-bold text-emerald-600">${c.netPay.toFixed(2)}</TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center text-slate-500">No revenue found for selected period.</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    </div>
  );
}
