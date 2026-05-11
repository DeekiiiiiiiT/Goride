import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Calendar } from "../ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { format, startOfWeek, endOfWeek, startOfDay, endOfDay } from "date-fns";
import { Calendar as CalendarIcon, FileDown, Loader2, DollarSign, Droplets, TrendingUp, BarChart3, Download, Users } from "lucide-react";
import { cn } from "../ui/utils";
import { FuelEntry } from '../../types/fuel';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Badge } from "../ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { FuelPerformanceAnalytics } from './FuelPerformanceAnalytics';
import { TabLoadingSkeleton } from '../ui/TabLoadingSkeleton';
import { toast } from "sonner@2.0.3";
import { DateRange } from "react-day-picker";
import { DatePickerWithRange } from "../ui/date-range-picker";

interface ReportsPageProps {
    entries: FuelEntry[];
    vehicles: any[];
    drivers: any[];
    isRefreshing?: boolean;
}

export function ReportsPage({ entries, vehicles, drivers, isRefreshing }: ReportsPageProps) {
    const [date, setDate] = useState<Date | undefined>(new Date());
    const [reportType, setReportType] = useState('weekly');
    const [isGenerating, setIsGenerating] = useState(false);
    const [reportData, setReportData] = useState<FuelEntry[] | null>(null);
    const [summary, setSummary] = useState({ totalCost: 0, totalLiters: 0, avgPrice: 0, count: 0 });
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [selectedVehicleId, setSelectedVehicleId] = useState<string>('all');
    const [selectedDriverId, setSelectedDriverId] = useState<string>('all');

    // Clear generated report when switching report types
    useEffect(() => { setReportData(null); }, [reportType]);

    const vehiclesMap = useMemo(() => {
        const map: Record<string, string> = {};
        if (Array.isArray(vehicles)) {
            vehicles.forEach((v: any) => map[v.id] = v.name || v.licensePlate);
        }
        return map;
    }, [vehicles]);

    const driversMap = useMemo(() => {
        const map: Record<string, string> = {};
        if (Array.isArray(drivers)) {
            drivers.forEach((d: any) => map[d.id] = d.name || `Driver ${d.id.slice(0, 6)}`);
        }
        return map;
    }, [drivers]);

    const escapeCSV = (value: string): string => {
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
    };

    const handleExportCSV = () => {
        if (!reportData || reportData.length === 0) {
            toast.error("No data to export. Generate a report first.");
            return;
        }

        const lines: string[] = [];

        // Header comment block based on report type
        if (reportType === 'weekly') {
            lines.push(`Report Type,Weekly Statement`);
            lines.push(`Date,${date ? format(date, 'PPP') : 'N/A'}`);
        } else if (reportType === 'custom') {
            lines.push(`Report Type,Custom Range`);
            lines.push(`From,${dateRange?.from ? format(dateRange.from, 'PPP') : 'N/A'}`);
            lines.push(`To,${dateRange?.to ? format(dateRange.to, 'PPP') : dateRange?.from ? format(dateRange.from, 'PPP') : 'N/A'}`);
        } else if (reportType === 'vehicle') {
            const vehicleName = selectedVehicleId === 'all' ? 'All Vehicles' : (vehiclesMap[selectedVehicleId] || selectedVehicleId);
            lines.push(`Report Type,By Vehicle`);
            lines.push(`Vehicle,${escapeCSV(vehicleName)}`);
            if (dateRange?.from) {
                lines.push(`From,${format(dateRange.from, 'PPP')}`);
                lines.push(`To,${dateRange.to ? format(dateRange.to, 'PPP') : format(dateRange.from, 'PPP')}`);
            }
        } else if (reportType === 'driver') {
            const driverName = selectedDriverId === 'all' ? 'All Drivers' : (driversMap[selectedDriverId] || selectedDriverId);
            lines.push(`Report Type,By Driver`);
            lines.push(`Driver,${escapeCSV(driverName)}`);
            if (dateRange?.from) {
                lines.push(`From,${format(dateRange.from, 'PPP')}`);
                lines.push(`To,${dateRange.to ? format(dateRange.to, 'PPP') : format(dateRange.from, 'PPP')}`);
            }
        }
        lines.push(`Generated,${format(new Date(), 'PPP p')}`);
        lines.push('');

        // CSV column headers
        lines.push('Date,Vehicle,Driver,Location,Volume (L),Amount ($),Status');

        // Data rows
        reportData.forEach(entry => {
            const d = new Date(entry.date);
            const entryDate = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
            const vehicle = escapeCSV(vehiclesMap[entry.vehicleId || ''] || entry.vehicleId || '-');
            const driver = escapeCSV(driversMap[entry.driverId || ''] || entry.driverId || '-');
            const location = escapeCSV(entry.location || '-');
            const volume = entry.liters?.toFixed(2) || '0';
            const amount = entry.amount.toFixed(2);
            const status = entry.metadata?.integrityStatus === 'critical'
                ? 'Critical Anomaly'
                : entry.metadata?.integrityStatus === 'warning'
                    ? 'Warning'
                    : 'Valid';
            lines.push(`${entryDate},${vehicle},${driver},${location},${volume},${amount},${status}`);
        });

        // Summary footer
        lines.push('');
        lines.push('Summary');
        lines.push(`Total Cost,$${summary.totalCost.toFixed(2)}`);
        lines.push(`Total Volume,${summary.totalLiters.toFixed(2)} L`);
        lines.push(`Avg Price/Liter,$${summary.avgPrice.toFixed(2)}`);
        lines.push(`Transaction Count,${summary.count}`);

        const csvString = lines.join('\n');
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;

        // Build filename based on report type
        let filename = 'fuel-report';
        if (reportType === 'weekly') {
            filename += `-weekly-${date ? format(date, 'yyyy-MM-dd') : 'unknown'}`;
        } else if (reportType === 'custom') {
            const fromStr = dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : 'unknown';
            const toStr = dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : fromStr;
            filename += `-custom-${fromStr}-to-${toStr}`;
        } else if (reportType === 'vehicle') {
            const plate = (vehiclesMap[selectedVehicleId] || 'all').replace(/\s+/g, '-');
            filename += `-vehicle-${plate}-${format(new Date(), 'yyyy-MM-dd')}`;
        } else if (reportType === 'driver') {
            const driverName = (driversMap[selectedDriverId] || 'all').replace(/\s+/g, '-');
            filename += `-driver-${driverName}-${format(new Date(), 'yyyy-MM-dd')}`;
        }
        filename += '.csv';

        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        toast.success("CSV exported successfully");
    };

    const handleGenerate = async () => {
        setIsGenerating(true);
        try {
            // Recalculate based on current entries
            let filtered = [...entries];

            if (reportType === 'weekly') {
                if (date) {
                    const start = startOfWeek(date, { weekStartsOn: 1 });
                    const end = endOfWeek(date, { weekStartsOn: 1 });
                    filtered = entries.filter(e => {
                         const d = new Date(e.date);
                         return d >= start && d <= end;
                    });
                }
            } else if (reportType === 'custom') {
                if (!dateRange?.from) {
                    toast.error("Please select a start date.");
                    setIsGenerating(false);
                    return;
                }
                const start = startOfDay(dateRange.from);
                const end = endOfDay(dateRange.to || dateRange.from);
                filtered = entries.filter(e => {
                    const d = new Date(e.date);
                    return d >= start && d <= end;
                });
            } else if (reportType === 'vehicle') {
                // Start with all entries
                filtered = [...entries];

                // Filter by vehicle if a specific one is selected
                if (selectedVehicleId !== 'all') {
                    filtered = filtered.filter(e => e.vehicleId === selectedVehicleId);
                }

                // Optionally filter by date range if set
                if (dateRange?.from) {
                    const start = startOfDay(dateRange.from);
                    const end = endOfDay(dateRange.to || dateRange.from);
                    filtered = filtered.filter(e => {
                        const d = new Date(e.date);
                        return d >= start && d <= end;
                    });
                }
            } else if (reportType === 'driver') {
                // Start with all entries
                filtered = [...entries];

                // Filter by driver if a specific one is selected
                if (selectedDriverId !== 'all') {
                    filtered = filtered.filter(e => e.driverId === selectedDriverId);
                }

                // Optionally filter by date range if set
                if (dateRange?.from) {
                    const start = startOfDay(dateRange.from);
                    const end = endOfDay(dateRange.to || dateRange.from);
                    filtered = filtered.filter(e => {
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

    if (isRefreshing) {
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
                                    <Tabs value={reportType} onValueChange={setReportType} className="w-[500px]">
                                        <TabsList>
                                            <TabsTrigger value="weekly">Weekly Statement</TabsTrigger>
                                            <TabsTrigger value="custom">Custom Range</TabsTrigger>
                                            <TabsTrigger value="vehicle">By Vehicle</TabsTrigger>
                                            <TabsTrigger value="driver" className="flex items-center gap-1">
                                                <Users className="w-3 h-3" />
                                                By Driver
                                            </TabsTrigger>
                                        </TabsList>
                                    </Tabs>
                                </div>

                                {reportType === 'weekly' && (
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
                                )}

                                {reportType === 'custom' && (
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Select Date Range</label>
                                    <DatePickerWithRange date={dateRange} setDate={setDateRange} />
                                </div>
                                )}

                                {reportType === 'vehicle' && (
                                <>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Vehicle</label>
                                        <Select value={selectedVehicleId} onValueChange={setSelectedVehicleId}>
                                            <SelectTrigger className="w-[240px]">
                                                <SelectValue placeholder="Select a vehicle" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All Vehicles</SelectItem>
                                                {vehicles.map((v: any) => (
                                                    <SelectItem key={v.id} value={v.id}>
                                                        {v.name || v.licensePlate}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Date Range</label>
                                        <DatePickerWithRange date={dateRange} setDate={setDateRange} />
                                    </div>
                                </>
                                )}

                                {reportType === 'driver' && (
                                <>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Driver</label>
                                        <Select value={selectedDriverId} onValueChange={setSelectedDriverId}>
                                            <SelectTrigger className="w-[240px]">
                                                <SelectValue placeholder="Select a driver" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All Drivers</SelectItem>
                                                {drivers.map((d: any) => (
                                                    <SelectItem key={d.id} value={d.id}>
                                                        {d.name || `Driver ${d.id.slice(0, 6)}`}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Date Range</label>
                                        <DatePickerWithRange date={dateRange} setDate={setDateRange} />
                                    </div>
                                </>
                                )}

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
                                    <div className="flex items-center justify-between mb-4">
                                        <p className="text-sm text-muted-foreground">{reportData.length} transaction{reportData.length !== 1 ? 's' : ''}</p>
                                        <Button variant="outline" size="sm" onClick={handleExportCSV}>
                                            <Download className="h-4 w-4 mr-2" />
                                            Export CSV
                                        </Button>
                                    </div>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Date</TableHead>
                                                <TableHead>Vehicle</TableHead>
                                                <TableHead>Driver</TableHead>
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
                                                    <TableCell>{driversMap[entry.driverId || ''] || entry.driverId || '-'}</TableCell>
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
                                                    <TableCell colSpan={7} className="h-24 text-center">No transactions found.</TableCell>
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
                    <FuelPerformanceAnalytics entries={entries} vehicles={vehicles} drivers={drivers} />
                </TabsContent>
            </Tabs>
        </div>
    );
}