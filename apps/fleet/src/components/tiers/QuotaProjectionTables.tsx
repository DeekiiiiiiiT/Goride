import React, { useMemo } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";
import { Table, TableHeader, TableBody, TableRow, TableCell, TableHead } from "../ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { formatCurrency, generateDailyProjection, generateWeeklyProjection, generateMonthlyProjection } from './quota-utils';
import { ScrollArea } from "../ui/scroll-area";

interface QuotaProjectionTablesProps {
  weeklyAmount: number;
  workingDaysCount: number;
  activeTab: string;
  onTabChange: (value: string) => void;
}

export function QuotaProjectionTables({
  weeklyAmount,
  workingDaysCount,
  activeTab,
  onTabChange
}: QuotaProjectionTablesProps) {

  const dailyData = useMemo(() => generateDailyProjection(weeklyAmount, workingDaysCount), [weeklyAmount, workingDaysCount]);
  const weeklyData = useMemo(() => generateWeeklyProjection(weeklyAmount), [weeklyAmount]);
  const monthlyData = useMemo(() => generateMonthlyProjection(weeklyAmount, workingDaysCount), [weeklyAmount, workingDaysCount]);

  return (
    <Card className="mt-8 border-t bg-slate-50/50">
      <CardHeader>
        <CardTitle>Earnings Projection</CardTitle>
        <CardDescription>
          Visualize how these quotas translate into actual earnings over time.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={onTabChange} className="w-full">
          <TabsList className="grid w-full grid-cols-3 max-w-[400px]">
            <TabsTrigger value="daily">Daily Projection</TabsTrigger>
            <TabsTrigger value="weekly">Weekly Projection</TabsTrigger>
            <TabsTrigger value="monthly">Monthly Projection</TabsTrigger>
          </TabsList>

          <TabsContent value="daily" className="mt-6 border rounded-md bg-white overflow-hidden">
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Day</TableHead>
                    <TableHead className="text-right">Daily Target</TableHead>
                    <TableHead className="text-right">Month-to-Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dailyData.map((row) => (
                    <TableRow key={row.date}>
                      <TableCell className="font-medium">{row.date}</TableCell>
                      <TableCell>{row.dayOfWeek}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.target)}</TableCell>
                      <TableCell className="text-right text-slate-500">{formatCurrency(row.cumulative)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
             <div className="bg-slate-50 border-t p-4 flex justify-between items-center text-sm font-semibold">
                <span>Total for Month</span>
                <span>{formatCurrency(dailyData[dailyData.length - 1]?.cumulative || 0)}</span>
             </div>
          </TabsContent>

          <TabsContent value="weekly" className="mt-6 border rounded-md bg-white overflow-hidden">
             <ScrollArea className="h-[400px]">
               <Table>
                 <TableHeader>
                   <TableRow>
                     <TableHead className="w-[100px]">Week</TableHead>
                     <TableHead>Date Range</TableHead>
                     <TableHead className="text-right">Weekly Target</TableHead>
                     <TableHead className="text-right">Year-to-Date</TableHead>
                   </TableRow>
                 </TableHeader>
                 <TableBody>
                   {weeklyData.map((row) => (
                     <TableRow key={row.weekNumber}>
                       <TableCell className="font-medium">Week {row.weekNumber}</TableCell>
                       <TableCell>{row.dateRange}</TableCell>
                       <TableCell className="text-right">{formatCurrency(row.target)}</TableCell>
                       <TableCell className="text-right text-slate-500">{formatCurrency(row.cumulative)}</TableCell>
                     </TableRow>
                   ))}
                 </TableBody>
               </Table>
             </ScrollArea>
             <div className="bg-slate-50 border-t p-4 flex justify-between items-center text-sm font-semibold">
                <span>Total for Year</span>
                <span>{formatCurrency(weeklyData[weeklyData.length - 1]?.cumulative || 0)}</span>
             </div>
          </TabsContent>

          <TabsContent value="monthly" className="mt-6 border rounded-md bg-white overflow-hidden">
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Monthly Target</TableHead>
                    <TableHead className="text-right">Year-to-Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyData.map((row) => (
                    <TableRow key={row.monthName}>
                      <TableCell className="font-medium">{row.monthName}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.target)}</TableCell>
                      <TableCell className="text-right text-slate-500">{formatCurrency(row.cumulative)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
             </ScrollArea>
             <div className="bg-slate-50 border-t p-4 flex justify-between items-center text-sm font-semibold">
                <span>Total for Year</span>
                <span>{formatCurrency(monthlyData[monthlyData.length - 1]?.cumulative || 0)}</span>
             </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
