import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Calendar } from "../ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { Calendar as CalendarIcon, FileDown, Loader2, DollarSign, Droplets, TrendingUp, BarChart3 } from "lucide-react";
import { cn } from "../ui/utils";
import { fuelService } from '../../services/fuelService';
import { api } from '../../services/api';
import { FuelEntry } from '../../types/fuel';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Badge } from "../ui/badge";
import { FuelPerformanceAnalytics } from './FuelPerformanceAnalytics';
import { TabLoadingSkeleton } from '../ui/TabLoadingSkeleton';

export function ReportsPage() {
    const [date, setDate] = useState<Date | undefined>(new Date());
    const [reportType, setReportType] = useState('weekly');
    const [isGenerating, setIsGenerating] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [reportData, setReportData] = useState<FuelEntry[] | null>(null);
    const [allEntries, setAllEntries] = useState<FuelEntry[]>([]);
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [vehiclesMap, setVehiclesMap] = useState<Record<string, string>>({});
    const [summary, setSummary] = useState({ totalCost: 0, totalLiters: 0, avgPrice: 0, count: 0 });

    useEffect(() => {
        const loadInitial = async () => {
            setIsLoading(true);
            try {
                const [entries, vData] = await Promise.all([
                    fuelService.getFuelEntries(),
                    api.getVehicles()
                ]);
                setAllEntries(entries);
                setVehicles(vData);
                
                const vMap: Record<string, string> = {};
                if (Array.isArray(vData)) {
                     vData.forEach((v: any) => vMap[v.id] = v.name || v.licensePlate);
                }
                setVehiclesMap(vMap);
            } catch (err) {
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };
        loadInitial();
    }, []);

    const handleGenerate = async () => {
        setIsGenerating(true);
        try {
            // Recalculate based on current state (allEntries)
            let filtered = [...allEntries];
            if (date) {
                if (reportType === 'weekly') {
                    const start = startOfWeek(date, { weekStartsOn: 1 });
                    const end = endOfWeek(date, { weekStartsOn: 1 });
                    filtered = allEntries.filter(e => {
                         const d = new Date(e.date);
                         return d >= start && d <= end;
                    });
                }
            }

            // Calculate summary
            const totalCost = filtered.reduce((sum, e) => sum + e.amount, 0);
            const totalLiters = filtered.reduce((sum, e) => sum + (e.liters || 0), 0);
            const count = filtered.length;
            const avgPrice = totalLiters > 0 ? totalCost / totalLiters : 0;
            
            setSummary({ totalCost, totalLiters, avgPrice, count });
            setReportData(filtered);

        } catch (error) {
            console.error("Failed to generate report:", error);
        } finally {
            setIsGenerating(false);
        }
    };

    if (isLoading) {
        return <TabLoadingSkeleton />;
    }

    return (
        <div className="space-y-6">
            <Tabs defaultValue="standard" className="w-full">
                <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
                    <TabsTrigger value="standard" className="flex items-center gap-2">
                        <FileDown className="w-4 h-4" />
                        Standard Reports
                    </TabsTrigger>
                    <TabsTrigger value="performance" className="flex items-center gap-2">
                        <BarChart3 className="w-4 h-4" />
                        Efficiency Trends
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="standard" className="space-y-6 mt-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Fuel Consumption Reports</CardTitle>
                            <CardDescription>Generate detailed reports for fuel usage, costs, and efficiency.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-col md:flex-row gap-4 items-end">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Report Type</label>
                                    <Tabs value={reportType} onValueChange={setReportType} className="w-[400px]">
                                        <TabsList>
                                            <TabsTrigger value="weekly">Weekly Statement</TabsTrigger>
                                            <TabsTrigger value="custom" disabled>Custom Range</TabsTrigger>
                                            <TabsTrigger value="vehicle" disabled>By Vehicle</TabsTrigger>
                                        </TabsList>
                                    </Tabs>
                                </div>

                                <div className="space-y-2">
                                     <label className="text-sm font-medium">Select Date</label>
                                     <Popover>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant={"outline"}
                                                className={cn(
                                                    "w-[240px] justify-start text-left font-normal",
                                                    !date && "text-muted-foreground"
                                                )}
                                            >
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {date ? format(date, "PPP") : <span>Pick a date</span>}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start">
                                            <Calendar
                                                mode="single"
                                                selected={date}
                                                onSelect={setDate}
                                                initialFocus
                                            />
                                        </PopoverContent>
                                    </Popover>
                                </div>

                                <Button onClick={handleGenerate} disabled={isGenerating}>
                                    {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                                    Generate Report
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {reportData ? (
                        <div className="space-y-6">
                            {/* Summary Cards */}
                            <div className="grid gap-4 md:grid-cols-3">
                                <Card>
                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
                                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold">${summary.totalCost.toFixed(2)}</div>
                                        <p className="text-xs text-muted-foreground">{summary.count} transactions</p>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <CardTitle className="text-sm font-medium">Total Volume</CardTitle>
                                        <Droplets className="h-4 w-4 text-muted-foreground" />
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold">{summary.totalLiters.toFixed(2)} L</div>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <CardTitle className="text-sm font-medium">Avg Price / Liter</CardTitle>
                                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold">${summary.avgPrice.toFixed(2)}</div>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Table */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Detailed Transactions</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Date</TableHead>
                                                <TableHead>Vehicle</TableHead>
                                                <TableHead>Location</TableHead>
                                                <TableHead className="text-right">Volume (L)</TableHead>
                                                <TableHead className="text-right">Amount ($)</TableHead>
                                                <TableHead>Status</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {reportData.map((entry) => (
                                                <TableRow key={entry.id}>
                                                    <TableCell>{new Date(entry.date).toLocaleDateString()}</TableCell>
                                                    <TableCell>{vehiclesMap[entry.vehicleId || ''] || entry.vehicleId || '-'}</TableCell>
                                                    <TableCell className="max-w-[200px] truncate" title={entry.location}>{entry.location || '-'}</TableCell>
                                                    <TableCell className="text-right">{entry.liters?.toFixed(2) || '-'}</TableCell>
                                                    <TableCell className="text-right">${entry.amount.toFixed(2)}</TableCell>
                                                    <TableCell>
                                                        {entry.metadata?.integrityStatus === 'critical' ? (
                                                            <Badge variant="destructive">Critical Anomaly</Badge>
                                                        ) : entry.metadata?.integrityStatus === 'warning' ? (
                                                            <Badge variant="outline" className="border-orange-200 text-orange-700 bg-orange-50">Warning</Badge>
                                                        ) : (
                                                            <Badge variant="outline" className="border-green-200 text-green-700 bg-green-50">Valid</Badge>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            {reportData.length === 0 && (
                                                <TableRow>
                                                    <TableCell colSpan={6} className="h-24 text-center">No transactions found.</TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        </div>
                    ) : (
                        <Card className="min-h-[400px] flex items-center justify-center border-dashed bg-slate-50/50">
                            <div className="text-center text-slate-500">
                                <FileDown className="h-12 w-12 mx-auto mb-2 opacity-20" />
                                <p>Select parameters and click "Generate Report" to view data.</p>
                            </div>
                        </Card>
                    )}
                </TabsContent>

                <TabsContent value="performance" className="mt-6">
                    <FuelPerformanceAnalytics entries={allEntries} vehicles={vehicles} />
                </TabsContent>
            </Tabs>
        </div>
    );
}
