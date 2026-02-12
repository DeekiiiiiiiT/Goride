import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../ui/card";
import { Button } from "../../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";
import { FinancialTransaction } from "../../../types/data";
import { downloadCSV } from "../../../utils/export";
import { FileDown, Printer, FileText, BarChart3, PieChart } from "lucide-react";
import { format, startOfMonth, endOfMonth, isWithinInterval, subMonths, startOfYear, endOfYear } from "date-fns";

interface ReportCenterProps {
  transactions: FinancialTransaction[];
}

export function ReportCenter({ transactions }: ReportCenterProps) {
  const [reportType, setReportType] = useState('pnl');
  const [dateRange, setDateRange] = useState('thisMonth');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // Calculate Date Range
  const { start, end } = useMemo(() => {
    const now = new Date();
    if (dateRange === 'thisMonth') return { start: startOfMonth(now), end: endOfMonth(now) };
    if (dateRange === 'lastMonth') return { start: startOfMonth(subMonths(now, 1)), end: endOfMonth(subMonths(now, 1)) };
    if (dateRange === 'thisYear') return { start: startOfYear(now), end: endOfYear(now) };
    if (dateRange === 'custom') return { start: new Date(customStart), end: new Date(customEnd) };
    return { start: startOfMonth(now), end: endOfMonth(now) };
  }, [dateRange, customStart, customEnd]);

  // Filter Data
  const reportData = useMemo(() => {
    if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) return [];
    
    return transactions.filter(t => 
        isWithinInterval(new Date(t.date), { start, end })
    );
  }, [transactions, start, end]);

  // Generators
  const generatePnL = () => {
    const revenue = reportData.filter(t => t.type === 'Revenue').reduce((acc, t) => acc + Math.abs(t.amount), 0);
    const expenses = reportData.filter(t => t.type === 'Expense' || t.type === 'Payout').reduce((acc, t) => acc + Math.abs(t.amount), 0);
    
    const expenseBreakdown = reportData
        .filter(t => t.type === 'Expense' || t.type === 'Payout')
        .reduce((acc, t) => {
            const cat = t.category || 'Uncategorized';
            acc[cat] = (acc[cat] || 0) + Math.abs(t.amount);
            return acc;
        }, {} as Record<string, number>);

    return { revenue, expenses, netIncome: revenue - expenses, breakdown: expenseBreakdown };
  };

  const generateDriverReport = () => {
    const drivers = new Map<string, { name: string, revenue: number, payouts: number, trips: number }>();
    
    reportData.forEach(t => {
        if (!t.driverId) return;
        const current = drivers.get(t.driverId) || { name: t.driverName || t.driverId, revenue: 0, payouts: 0, trips: 0 };
        
        if (t.type === 'Revenue') {
            current.revenue += Math.abs(t.amount);
            current.trips += 1;
        } else if (t.type === 'Payout') {
            current.payouts += Math.abs(t.amount);
        }
        drivers.set(t.driverId, current);
    });
    
    return Array.from(drivers.values());
  };

  const generateVehicleReport = () => {
    const vehicles = new Map<string, { plate: string, fuel: number, maintenance: number, revenue: number }>();
    
    reportData.forEach(t => {
        if (!t.vehicleId) return;
        const current = vehicles.get(t.vehicleId) || { plate: t.vehicleId, fuel: 0, maintenance: 0, revenue: 0 };
        
        if (t.category === 'Fuel') current.fuel += Math.abs(t.amount);
        if (t.category === 'Maintenance') current.maintenance += Math.abs(t.amount);
        if (t.type === 'Revenue') current.revenue += Math.abs(t.amount);
        
        vehicles.set(t.vehicleId, current);
    });

    return Array.from(vehicles.values());
  };

  const handleDownload = async () => {
    if (reportType === 'pnl') {
        const data = generatePnL();
        const csvData = [
            { Category: 'Revenue', Amount: data.revenue },
            { Category: 'Total Expenses', Amount: data.expenses },
            { Category: 'Net Income', Amount: data.netIncome },
            ...Object.entries(data.breakdown).map(([cat, amt]) => ({ Category: `Exp: ${cat}`, Amount: amt }))
        ];
        await downloadCSV(csvData, `PnL_${format(start, 'yyyyMMdd')}-${format(end, 'yyyyMMdd')}`, { checksum: true });
    } else if (reportType === 'driver') {
        await downloadCSV(generateDriverReport(), `DriverReport_${format(start, 'yyyyMMdd')}`, { checksum: true });
    } else if (reportType === 'vehicle') {
        await downloadCSV(generateVehicleReport(), `VehicleReport_${format(start, 'yyyyMMdd')}`, { checksum: true });
    }
  };

  const renderPreview = () => {
      if (reportType === 'pnl') {
          const data = generatePnL();
          return (
              <div className="space-y-6 p-6 border rounded-lg bg-white shadow-sm print:shadow-none print:border-none">
                  <div className="text-center border-b pb-4">
                      <h2 className="text-2xl font-bold text-slate-900">Profit & Loss Statement</h2>
                      <p className="text-slate-500">{format(start, 'MMM d, yyyy')} - {format(end, 'MMM d, yyyy')}</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-8">
                      <div>
                          <h3 className="font-bold text-emerald-700 mb-2 border-b border-emerald-100 pb-1">Revenue</h3>
                          <div className="flex justify-between items-center py-2">
                              <span>Total Operating Revenue</span>
                              <span className="font-bold">${data.revenue.toFixed(2)}</span>
                          </div>
                      </div>
                      
                      <div>
                          <h3 className="font-bold text-rose-700 mb-2 border-b border-rose-100 pb-1">Expenses</h3>
                          {Object.entries(data.breakdown).map(([cat, amt]) => (
                              <div key={cat} className="flex justify-between items-center py-1 text-sm">
                                  <span>{cat}</span>
                                  <span>${amt.toFixed(2)}</span>
                              </div>
                          ))}
                          <div className="flex justify-between items-center py-2 mt-2 border-t font-bold">
                              <span>Total Expenses</span>
                              <span>${data.expenses.toFixed(2)}</span>
                          </div>
                      </div>
                  </div>
                  
                  <div className="mt-8 pt-4 border-t-2 border-slate-900 flex justify-between items-center">
                      <span className="text-xl font-bold">Net Income</span>
                      <span className={`text-xl font-bold ${data.netIncome >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          ${data.netIncome.toFixed(2)}
                      </span>
                  </div>
              </div>
          );
      }
      
      if (reportType === 'driver') {
          const data = generateDriverReport();
          return (
              <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                          <tr>
                              <th className="p-3 text-left">Driver Name</th>
                              <th className="p-3 text-right">Trips</th>
                              <th className="p-3 text-right">Revenue Generated</th>
                              <th className="p-3 text-right">Payouts Received</th>
                          </tr>
                      </thead>
                      <tbody>
                          {data.map((d, i) => (
                              <tr key={i} className="border-t">
                                  <td className="p-3 font-medium">{d.name}</td>
                                  <td className="p-3 text-right">{d.trips}</td>
                                  <td className="p-3 text-right text-emerald-600">${d.revenue.toFixed(2)}</td>
                                  <td className="p-3 text-right text-slate-600">${d.payouts.toFixed(2)}</td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          );
      }
      
       if (reportType === 'vehicle') {
          const data = generateVehicleReport();
          return (
              <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                          <tr>
                              <th className="p-3 text-left">Vehicle / Plate</th>
                              <th className="p-3 text-right">Revenue</th>
                              <th className="p-3 text-right">Fuel Cost</th>
                              <th className="p-3 text-right">Maintenance</th>
                              <th className="p-3 text-right">Net</th>
                          </tr>
                      </thead>
                      <tbody>
                          {data.map((d, i) => (
                              <tr key={i} className="border-t">
                                  <td className="p-3 font-medium">{d.plate}</td>
                                  <td className="p-3 text-right text-emerald-600">${d.revenue.toFixed(2)}</td>
                                  <td className="p-3 text-right text-rose-600">${d.fuel.toFixed(2)}</td>
                                  <td className="p-3 text-right text-rose-600">${d.maintenance.toFixed(2)}</td>
                                  <td className="p-3 text-right font-bold">${(d.revenue - d.fuel - d.maintenance).toFixed(2)}</td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          );
      }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Report Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label>Report Type</Label>
                        <Select value={reportType} onValueChange={setReportType}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="pnl">Profit & Loss</SelectItem>
                                <SelectItem value="driver">Driver Earnings</SelectItem>
                                <SelectItem value="vehicle">Vehicle Performance</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>Period</Label>
                        <Select value={dateRange} onValueChange={setDateRange}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="thisMonth">This Month</SelectItem>
                                <SelectItem value="lastMonth">Last Month</SelectItem>
                                <SelectItem value="thisYear">This Year</SelectItem>
                                <SelectItem value="custom">Custom Range</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {dateRange === 'custom' && (
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <Label className="text-xs">Start</Label>
                                <Input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} />
                            </div>
                            <div>
                                <Label className="text-xs">End</Label>
                                <Input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
                            </div>
                        </div>
                    )}

                    <Button className="w-full gap-2 mt-4" onClick={handleDownload}>
                        <FileDown className="h-4 w-4" /> Download CSV
                    </Button>
                    
                     <Button variant="outline" className="w-full gap-2" onClick={() => window.print()}>
                        <Printer className="h-4 w-4" /> Print Report
                    </Button>
                </CardContent>
            </Card>
            
            <div className="text-sm text-slate-500">
                <p className="mb-2">Select a report type and date range to view the preview.</p>
                <p>Use the "Download CSV" button to export the raw data for analysis in Excel or Google Sheets.</p>
            </div>
        </div>

        <div className="md:col-span-3">
             <Card className="h-full">
                 <CardHeader className="flex flex-row items-center justify-between">
                     <CardTitle>Report Preview</CardTitle>
                     <div className="text-sm text-slate-500">
                         {start && end ? `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}` : 'Select Date Range'}
                     </div>
                 </CardHeader>
                 <CardContent>
                     {renderPreview()}
                 </CardContent>
             </Card>
        </div>
    </div>
  );
}
