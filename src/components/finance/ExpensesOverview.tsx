import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { FinancialTransaction } from "../../types/data";
import { PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { SafeResponsiveContainer } from "../ui/SafeResponsiveContainer";
import { startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';

interface ExpensesOverviewProps {
  transactions: FinancialTransaction[];
}

const COLORS = ['#f43f5e', '#f59e0b', '#8b5cf6', '#3b82f6', '#10b981', '#64748b'];

export function ExpensesOverview({ transactions }: ExpensesOverviewProps) {
  
  const currentMonthExpenses = useMemo(() => {
    const now = new Date();
    const start = startOfMonth(now);
    const end = endOfMonth(now);
    
    return transactions.filter(t => 
        t.type === 'Expense' && 
        isWithinInterval(new Date(t.date), { start, end })
    );
  }, [transactions]);

  const totalExpense = useMemo(() => 
    currentMonthExpenses.reduce((acc, t) => acc + Math.abs(t.amount), 0)
  , [currentMonthExpenses]);

  const categoryData = useMemo(() => {
    const map = new Map<string, number>();
    currentMonthExpenses.forEach(t => {
        const val = map.get(t.category) || 0;
        map.set(t.category, val + Math.abs(t.amount));
    });
    
    return Array.from(map.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);
  }, [currentMonthExpenses]);

  // Mock revenue for ratio
  const revenue = 30000; 
  const ratio = (totalExpense / revenue) * 100;

  return (
    <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
                <CardHeader>
                    <CardTitle>Monthly Expenses</CardTitle>
                    <CardDescription>Current month to date</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="text-3xl font-bold text-rose-600">${totalExpense.toFixed(2)}</div>
                    <div className="mt-2 text-sm text-slate-500">
                        Expense to Revenue Ratio: <span className="font-bold text-slate-900">{ratio.toFixed(1)}%</span>
                        <span className="ml-2 text-emerald-600 text-xs">(Excellent)</span>
                    </div>
                </CardContent>
            </Card>
            
            <Card>
                <CardHeader>
                    <CardTitle>Expense Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                     <div className="h-[200px] w-full">
                         <SafeResponsiveContainer width="100%" height="100%">
                             <PieChart>
                                 <Pie
                                    data={categoryData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                 >
                                     {categoryData.map((entry, index) => (
                                         <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                     ))}
                                 </Pie>
                                 <Tooltip formatter={(val: number) => `$${val.toFixed(2)}`} />
                                 <Legend verticalAlign="middle" align="right" layout="vertical" iconType="circle" />
                             </PieChart>
                         </SafeResponsiveContainer>
                     </div>
                </CardContent>
            </Card>
        </div>

        <Card>
            <CardHeader>
                <CardTitle>Top Expense Categories</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {categoryData.map((cat, i) => (
                        <div key={cat.name} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                                <span className="text-sm font-medium">{cat.name}</span>
                            </div>
                            <div className="flex items-center gap-4">
                                <span className="text-sm font-bold">${cat.value.toFixed(2)}</span>
                                <span className="text-xs text-slate-500 w-[40px] text-right">
                                    {((cat.value / totalExpense) * 100).toFixed(1)}%
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    </div>
  );
}
