import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../ui/dialog";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { DateRange } from "react-day-picker";
import { Calendar } from "../ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { format, startOfDay, endOfDay, isWithinInterval } from "date-fns";
import { Calendar as CalendarIcon, Download, Loader2, FileText } from "lucide-react";
import { cn } from "../ui/utils";
import { api } from "../../services/api";
import { exportToCSV } from "../../utils/csvHelpers";
import { toast } from "sonner@2.0.3";
import { Trip, FinancialTransaction } from "../../types/data";

interface ReportGeneratorModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function ReportGeneratorModal({ open, onOpenChange }: ReportGeneratorModalProps) {
    const [reportType, setReportType] = useState<string>("payouts");
    const [date, setDate] = useState<DateRange | undefined>({
        from: new Date(),
        to: new Date()
    });
    const [generating, setGenerating] = useState(false);

    const handleGenerate = async () => {
        if (!date?.from) {
            toast.error("Please select a date range");
            return;
        }

        setGenerating(true);
        try {
            const startDate = startOfDay(date.from);
            const endDate = date.to ? endOfDay(date.to) : endOfDay(date.from);

            // Fetch necessary data
            // In a real app, we might optimize this to only fetch what's needed
            const [trips, transactions, drivers] = await Promise.all([
                api.getTrips(),
                api.getTransactions(),
                api.getDrivers()
            ]);

            let data: any[] = [];
            let filename = `report_${reportType}_${format(startDate, 'yyyyMMdd')}`;

            if (reportType === 'payouts') {
                // Driver Payouts Report
                // Group earnings by driver for the period
                const driverMap = new Map<string, {
                    name: string, 
                    trips: number, 
                    grossFares: number, 
                    expenses: number, 
                    reimbursements: number,
                    netEarnings: number
                }>();

                // Process Trips (Gross Fares)
                trips.forEach((t: Trip) => {
                    const d = new Date(t.date);
                    if (isWithinInterval(d, { start: startDate, end: endDate })) {
                        const driverId = t.driverId;
                        if (!driverId) return;
                        
                        const current = driverMap.get(driverId) || {
                            name: t.driverName || 'Unknown',
                            trips: 0,
                            grossFares: 0,
                            expenses: 0,
                            reimbursements: 0,
                            netEarnings: 0
                        };
                        
                        current.trips += 1;
                        current.grossFares += (t.amount || 0);
                        // Net Earnings initialized with Gross, adjusted later
                        current.netEarnings += (t.amount || 0);
                        
                        driverMap.set(driverId, current);
                    }
                });

                // Process Transactions (Adjustments/Expenses)
                transactions.forEach((tx: FinancialTransaction) => {
                     const d = new Date(tx.date);
                     if (isWithinInterval(d, { start: startDate, end: endDate })) {
                         const driverId = tx.driverId;
                         if (!driverId) return;

                         const current = driverMap.get(driverId) || {
                             name: tx.driverName || 'Unknown',
                             trips: 0,
                             grossFares: 0,
                             expenses: 0,
                             reimbursements: 0,
                             netEarnings: 0
                         };

                         if (tx.type === 'Expense') {
                             current.expenses += Math.abs(tx.amount);
                             // Usually expenses are paid by driver cash or deducted. 
                             // If it's a deduction (negative amount), it reduces Net Earnings.
                             if (tx.amount < 0) current.netEarnings += tx.amount; 
                         } else if (tx.type === 'Adjustment' || tx.type === 'Revenue') {
                             if (tx.amount > 0) {
                                 current.reimbursements += tx.amount;
                                 current.netEarnings += tx.amount;
                             } else {
                                 current.expenses += Math.abs(tx.amount);
                                 current.netEarnings += tx.amount;
                             }
                         } else if (tx.category === 'Fuel Reimbursement') {
                              current.reimbursements += tx.amount;
                              current.netEarnings += tx.amount;
                         }
                         
                         driverMap.set(driverId, current);
                     }
                });

                data = Array.from(driverMap.values()).map(d => ({
                    'Driver Name': d.name,
                    'Trip Count': d.trips,
                    'Gross Fares': d.grossFares.toFixed(2),
                    'Expenses/Deductions': d.expenses.toFixed(2),
                    'Reimbursements/Credits': d.reimbursements.toFixed(2),
                    'Net Earnings': d.netEarnings.toFixed(2)
                }));
                
            } else if (reportType === 'pl') {
                // Profit & Loss (Simple View)
                // Listing all revenue and expense items
                const relevantTx = transactions.filter((tx: FinancialTransaction) => {
                    const d = new Date(tx.date);
                    return isWithinInterval(d, { start: startDate, end: endDate });
                });
                
                data = relevantTx.map((tx: FinancialTransaction) => ({
                    Date: format(new Date(tx.date), 'yyyy-MM-dd'),
                    Type: tx.type,
                    Category: tx.category,
                    Description: tx.description,
                    Driver: tx.driverName,
                    Amount: tx.amount.toFixed(2),
                    Status: tx.status
                }));
            } else if (reportType === 'trips') {
                // Detailed Trip Log
                const relevantTrips = trips.filter((t: Trip) => {
                    const d = new Date(t.date);
                    return isWithinInterval(d, { start: startDate, end: endDate });
                });
                
                data = relevantTrips.map((t: Trip) => ({
                    Date: format(new Date(t.date), 'yyyy-MM-dd HH:mm'),
                    Platform: t.platform,
                    Driver: t.driverName,
                    Pickup: t.pickupLocation,
                    Dropoff: t.dropoffLocation,
                    Amount: t.amount,
                    Status: t.status
                }));
            }

            if (data.length === 0) {
                toast.warning("No data found for the selected period.");
            } else {
                exportToCSV(data, filename);
                toast.success("Report Generated", {
                    description: `${data.length} records exported.`
                });
                onOpenChange(false);
            }

        } catch (e) {
            console.error(e);
            toast.error("Failed to generate report");
        } finally {
            setGenerating(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Generate Report</DialogTitle>
                    <DialogDescription>
                        Select a report type and date range to export data.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label>Report Type</Label>
                        <Select value={reportType} onValueChange={setReportType}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select report type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="payouts">Driver Payouts (Summary)</SelectItem>
                                <SelectItem value="pl">Profit & Loss (Detailed)</SelectItem>
                                <SelectItem value="trips">Trip Log (Raw)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid gap-2">
                        <Label>Date Range</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant={"outline"}
                                    className={cn(
                                        "w-full justify-start text-left font-normal",
                                        !date && "text-muted-foreground"
                                    )}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {date?.from ? (
                                        date.to ? (
                                            <>
                                                {format(date.from, "LLL dd, y")} -{" "}
                                                {format(date.to, "LLL dd, y")}
                                            </>
                                        ) : (
                                            format(date.from, "LLL dd, y")
                                        )
                                    ) : (
                                        <span>Pick a date</span>
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                    initialFocus
                                    mode="range"
                                    defaultMonth={date?.from}
                                    selected={date}
                                    onSelect={setDate}
                                    numberOfMonths={2}
                                />
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleGenerate} disabled={generating} className="gap-2">
                        {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        Download CSV
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
