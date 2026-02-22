import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Download } from "lucide-react";
import { FinancialTransaction, TierConfig } from "../../types/data";
import { startOfWeek, endOfWeek, format, eachWeekOfInterval, startOfYear, endOfYear, isSameWeek } from "date-fns";
import { TierCalculations } from "../../utils/tierCalculations";
import { tierService } from "../../services/tierService";
import { exportToCSV } from "../../utils/csvHelpers";
import { toast } from "sonner@2.0.3";

interface DriverEarningsHistoryProps {
  driverId: string;
  transactions: FinancialTransaction[];
}

export function DriverEarningsHistory({ driverId, transactions = [] }: DriverEarningsHistoryProps) {
  const [tiers, setTiers] = React.useState<TierConfig[]>([]);

  React.useEffect(() => {
    tierService.getTiers().then(setTiers);
  }, []);

  const weeklyData = useMemo(() => {
    if (!transactions || transactions.length === 0 || tiers.length === 0) return [];

    // 1. Find date range
    const dates = transactions.map(t => new Date(t.date));
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));

    // 2. Generate weeks
    const weeks = eachWeekOfInterval({
        start: startOfWeek(minDate),
        end: endOfWeek(maxDate)
    }, { weekStartsOn: 1 }); // Monday start

    // 3. Aggregate per week
    // We need to calculate cumulative earnings progressively to determine Tier for each week.
    // However, Tiers are usually based on "Lifetime" or "Monthly" or "Rolling".
    // The current system uses "Lifetime Cumulative".
    
    // Sort transactions by date asc for cumulative calc
    const sortedTx = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    let runningCumulative = 0;
    const weeklyRows: any[] = [];

    // We can't just iterate weeks, we must iterate transactions to build cumulative correctly, 
    // then snapshot at week boundaries.
    
    // Better approach:
    // Iterate weeks in descending order (newest first) for display.
    // For each week, calculate:
    // - Gross Revenue in that week
    // - Expenses in that week
    // - Tier (based on cumulative earnings UP TO that week's end)
    
    // To do this efficiently:
    // 1. Calculate total cumulative map by week end?
    // Let's just iterate weeks, filter tx, and calc cumulative up to that point.
    
    const rows = weeks.map(weekStart => {
        const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
        
        // Filter tx in this week
        const weekTx = transactions.filter(t => {
            const d = new Date(t.date);
            return d >= weekStart && d <= weekEnd;
        });

        // Filter tx BEFORE this week end (for cumulative tier)
        const pastTx = transactions.filter(t => {
             const d = new Date(t.date);
             return d <= weekEnd;
        });
        
        const cumulative = pastTx
            .filter(t => (t.type === 'Revenue' || (t.type === 'Adjustment' && t.amount > 0)) && t.paymentMethod !== 'Tag Balance')
            .reduce((sum, t) => sum + (t.amount > 0 ? t.amount : 0), 0);
            
        const currentTier = TierCalculations.getTierForEarnings(cumulative, tiers);

        // Week Stats
        const grossRevenue = weekTx
            .filter(t => (t.type === 'Revenue' || (t.type === 'Adjustment' && t.amount > 0)) && t.paymentMethod !== 'Tag Balance')
            .reduce((sum, t) => sum + t.amount, 0);
            
        const expenses = weekTx
            .filter(t => t.type === 'Expense' || (t.type === 'Adjustment' && t.amount < 0))
            .reduce((sum, t) => sum + Math.abs(t.amount), 0); // Display as positive deduction
            
        const payouts = weekTx
            .filter(t => t.type === 'Payout')
            .reduce((sum, t) => sum + Math.abs(t.amount), 0);

        // Net Earnings (Calculated)
        // Formula: (Gross * TierShare) - Expenses? 
        // Or did we already apply the share in the transaction? 
        // In this system, "Revenue" tx are usually Gross Fares.
        // So we apply the share here.
        
        const driverShareAmount = grossRevenue * (currentTier.sharePercentage / 100);
        const netEarnings = driverShareAmount - expenses; 
        
        return {
            weekStart,
            weekEnd,
            grossRevenue,
            expenses,
            tier: currentTier,
            netEarnings,
            payouts,
            transactionCount: weekTx.length
        };
    });

    // Sort Descending (Newest Week First)
    return rows.reverse().filter(r => r.transactionCount > 0);

  }, [transactions, tiers]);

  const handleExport = () => {
      const data = weeklyData.map(row => ({
          Week: `${format(row.weekStart, 'dd/MM/yyyy')} to ${format(row.weekEnd, 'dd/MM/yyyy')}`,
          'Gross Revenue': row.grossRevenue.toFixed(2),
          'Expenses': row.expenses.toFixed(2),
          'Tier Name': row.tier.name,
          'Tier Share %': row.tier.sharePercentage + '%',
          'Net Earnings (Calc)': row.netEarnings.toFixed(2),
          'Actual Payouts': row.payouts.toFixed(2)
      }));
      
      exportToCSV(data, `driver_earnings_history_${driverId}`);
      toast.success("History Exported");
  };

  if (weeklyData.length === 0) {
      return (
          <div className="text-center p-8 border border-dashed rounded-lg text-slate-500">
              No financial history available.
          </div>
      );
  }

  return (
    <Card>
        <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Earnings History</CardTitle>
            <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                Export History
            </Button>
        </CardHeader>
        <CardContent>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Week</TableHead>
                        <TableHead className="text-right">Gross Revenue</TableHead>
                        <TableHead className="text-center">Tier Applied</TableHead>
                        <TableHead className="text-right">Expenses</TableHead>
                        <TableHead className="text-right">Net Earnings</TableHead>
                        <TableHead className="text-right">Payouts</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {weeklyData.map((row, idx) => (
                        <TableRow key={idx}>
                            <TableCell className="font-medium text-xs">
                                {format(row.weekStart, 'MMM d')} - {format(row.weekEnd, 'MMM d, yyyy')}
                            </TableCell>
                            <TableCell className="text-right text-slate-600">
                                ${row.grossRevenue.toLocaleString(undefined, {minimumFractionDigits: 2})}
                            </TableCell>
                            <TableCell className="text-center">
                                <Badge variant="outline" className="text-xs bg-slate-50">
                                    {row.tier.name} ({row.tier.sharePercentage}%)
                                </Badge>
                            </TableCell>
                            <TableCell className="text-right text-rose-600">
                                {row.expenses > 0 ? `-$${row.expenses.toLocaleString(undefined, {minimumFractionDigits: 2})}` : '-'}
                            </TableCell>
                            <TableCell className="text-right font-bold text-emerald-600">
                                ${row.netEarnings.toLocaleString(undefined, {minimumFractionDigits: 2})}
                            </TableCell>
                            <TableCell className="text-right text-slate-500">
                                {row.payouts > 0 ? `$${row.payouts.toLocaleString(undefined, {minimumFractionDigits: 2})}` : '-'}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </CardContent>
    </Card>
  );
}
