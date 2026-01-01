import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../ui/card";
import { Button } from "../../ui/button";
import { Plus, Loader2, Pencil, Trash2, Calendar, Repeat, Table as TableIcon, List, ChevronLeft, ChevronRight, LayoutList, Layers, HelpCircle } from "lucide-react";
import { expenseService } from '../../../services/expenseService';
import { FixedExpenseConfig } from '../../../types/expenses';
import { toast } from "sonner@2.0.3";
import { AddFixedExpenseDialog } from './AddFixedExpenseDialog';
import { Badge } from "../../ui/badge";
import { calculateAnnualProjection, aggregateProjections, ProjectionViewBasis, calculateAmortizedProjection } from '../../../utils/expenseProjection';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "../../ui/table";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from "../../ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../ui/tooltip";
  
interface FixedExpensesManagerProps {
    vehicleId: string;
}

export const FixedExpensesManager: React.FC<FixedExpensesManagerProps> = ({ vehicleId }) => {
    const [expenses, setExpenses] = useState<FixedExpenseConfig[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
    const [editingExpense, setEditingExpense] = useState<FixedExpenseConfig | null>(null);
    
    const [viewMode, setViewMode] = useState<'list' | 'matrix'>('matrix');
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [groupBy, setGroupBy] = useState<'category' | 'item'>('category');
    const [viewBasis, setViewBasis] = useState<ProjectionViewBasis>('cash_flow');

    const loadExpenses = async () => {
        setIsLoading(true);
        try {
            const data = await expenseService.getFixedExpenses(vehicleId);
            setExpenses(data);
        } catch (error) {
            console.error("Failed to load expenses:", error);
            toast.error("Failed to load fixed expenses.");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (vehicleId) {
            loadExpenses();
        }
    }, [vehicleId]);

    const handleEdit = (expense: FixedExpenseConfig) => {
        setEditingExpense(expense);
        setIsAddExpenseOpen(true);
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm("Are you sure you want to delete this expense rule?")) return;
        try {
            await expenseService.deleteFixedExpense(vehicleId, id);
            toast.success("Expense deleted");
            loadExpenses();
        } catch (error) {
            console.error("Failed to delete expense:", error);
            toast.error("Failed to delete expense");
        }
    };

    const handleDialogClose = () => {
        setIsAddExpenseOpen(false);
        setEditingExpense(null);
    };

    // Matrix Calculation
    const matrixData = useMemo(() => {
        const projections = expenses.map(e => calculateAmortizedProjection(e, selectedYear, viewBasis));
        const aggregation = aggregateProjections(projections);
        const categories = Object.keys(aggregation.categoryTotals).sort();
        
        // For Item view
        const items = expenses.map(e => ({
            id: e.id,
            name: e.name,
            monthlyValues: projections.find(p => p.configName === e.name)?.monthlyAmounts || Array(12).fill(0),
            total: projections.find(p => p.configName === e.name)?.total || 0
        })).sort((a, b) => b.total - a.total);

        return { projections, aggregation, categories, items };
    }, [expenses, selectedYear, viewBasis]);

    // Sorted expenses for List View (by Amount Descending)
    const sortedExpenses = useMemo(() => {
        return [...expenses].sort((a, b) => b.amount - a.amount);
    }, [expenses]);

    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    const formatCurrency = (val: number) => {
        const decimals = (viewBasis === 'daily_rate' || viewBasis === 'weekly_rate') ? 2 : 0;
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(val);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h3 className="text-lg font-medium">Fixed Expenses</h3>
                    <p className="text-sm text-muted-foreground">
                        Manage recurring vehicle costs and view monthly projections.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                     <div className="flex items-center bg-secondary/50 rounded-lg p-1 border">
                        <Button 
                            variant={viewMode === 'matrix' ? 'secondary' : 'ghost'} 
                            size="sm" 
                            className="h-8 px-3 text-xs"
                            onClick={() => setViewMode('matrix')}
                        >
                            <TableIcon className="h-3.5 w-3.5 mr-2" />
                            Projection
                        </Button>
                        <Button 
                            variant={viewMode === 'list' ? 'secondary' : 'ghost'} 
                            size="sm" 
                            className="h-8 px-3 text-xs"
                            onClick={() => setViewMode('list')}
                        >
                            <List className="h-3.5 w-3.5 mr-2" />
                            Rules
                        </Button>
                    </div>
                    <Button size="sm" onClick={() => setIsAddExpenseOpen(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Rule
                    </Button>
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center items-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : expenses.length === 0 ? (
                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="h-12 w-12 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                            <Plus className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <h4 className="font-medium mb-1">No fixed expenses yet</h4>
                        <p className="text-sm text-muted-foreground max-w-sm mb-4">
                            Set up recurring costs to automatically project your vehicle's monthly overhead.
                        </p>
                        <Button variant="outline" onClick={() => setIsAddExpenseOpen(true)}>
                            Add First Expense
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <>
                    {viewMode === 'list' && (
                        <div className="grid gap-4">
                           {sortedExpenses.map((expense) => (
                               <Card key={expense.id} className="overflow-hidden">
                                   <CardContent className="p-0">
                                       <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-4">
                                           <div className="flex items-start gap-4">
                                               <div className="p-2 bg-secondary rounded-lg text-secondary-foreground mt-1">
                                                   <Repeat className="h-5 w-5" />
                                               </div>
                                               <div>
                                                   <div className="flex items-center gap-2 flex-wrap">
                                                       <h4 className="font-semibold text-foreground">{expense.name}</h4>
                                                       <Badge variant="secondary" className="text-xs font-normal">
                                                           {expense.category}
                                                       </Badge>
                                                       {expense.vendor && (
                                                            <span className="text-xs text-muted-foreground border px-1.5 py-0.5 rounded">
                                                                {expense.vendor}
                                                            </span>
                                                       )}
                                                   </div>
                                                   <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1 flex-wrap">
                                                       <span className="flex items-center gap-1">
                                                           <Calendar className="h-3 w-3" />
                                                           Start: {new Date(expense.startDate).toLocaleDateString()}
                                                       </span>
                                                       <span className="hidden sm:inline">•</span>
                                                       <span className="capitalize">{expense.frequency}</span>
                                                       {expense.autoRenew && (
                                                           <>
                                                               <span className="hidden sm:inline">•</span>
                                                               <span className="text-emerald-600 dark:text-emerald-400 text-xs bg-emerald-50 dark:bg-emerald-950/30 px-1.5 py-0.5 rounded">Auto-renews</span>
                                                           </>
                                                       )}
                                                   </div>
                                               </div>
                                           </div>
                                           
                                           <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto">
                                               <div className="text-left sm:text-right">
                                                   <p className="font-bold text-lg text-foreground">
                                                       {formatCurrency(expense.amount)}
                                                   </p>
                                                   <p className="text-xs text-muted-foreground">per {expense.frequency.toLowerCase().replace('ly', '')}</p>
                                               </div>
                                               <div className="flex items-center gap-1">
                                                   <Button variant="ghost" size="icon" onClick={() => handleEdit(expense)}>
                                                       <Pencil className="h-4 w-4 text-muted-foreground" />
                                                   </Button>
                                                   <Button variant="ghost" size="icon" onClick={() => handleDelete(expense.id!)}>
                                                       <Trash2 className="h-4 w-4 text-rose-500" />
                                                   </Button>
                                               </div>
                                           </div>
                                       </div>
                                   </CardContent>
                               </Card>
                           ))}
                        </div>
                    )}

                    {viewMode === 'matrix' && (
                        <Card>
                            <CardHeader className="pb-2">
                                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                                    <div className="space-y-1 w-full sm:w-auto">
                                        <CardTitle className="text-base">Monthly Projections</CardTitle>
                                        <CardDescription>
                                            Projected expenses for {selectedYear}
                                        </CardDescription>
                                    </div>
                                    <div className="flex items-center gap-4 w-full sm:w-auto justify-end flex-wrap">
                                         <div className="flex items-center gap-2">
                                            <div className="flex items-center gap-1">
                                                <span className="text-xs text-muted-foreground hidden lg:inline-block">View:</span>
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <p className="max-w-xs text-xs">
                                                                Switch between <strong>Cash Flow</strong> (actual payment dates) and <strong>Amortized Rates</strong> (cost spread daily/weekly).
                                                            </p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            </div>
                                            <Select value={viewBasis} onValueChange={(val) => setViewBasis(val as ProjectionViewBasis)}>
                                                <SelectTrigger className="h-8 w-[140px] text-xs">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="cash_flow">Actual (Cash Flow)</SelectItem>
                                                    <SelectItem value="daily_rate">Daily Rate</SelectItem>
                                                    <SelectItem value="weekly_rate">Weekly Rate</SelectItem>
                                                    <SelectItem value="monthly_average">Monthly Average</SelectItem>
                                                </SelectContent>
                                            </Select>
                                         </div>
                                         <div className="flex items-center gap-2">
                                            <span className="text-xs text-muted-foreground hidden sm:inline-block">Group by:</span>
                                            <div className="flex items-center bg-secondary/30 p-0.5 rounded-lg border h-8">
                                                <Button 
                                                    variant={groupBy === 'category' ? 'secondary' : 'ghost'} 
                                                    size="sm" 
                                                    className="h-7 px-2 text-xs"
                                                    onClick={() => setGroupBy('category')}
                                                >
                                                    <Layers className="h-3 w-3 mr-1.5" />
                                                    Category
                                                </Button>
                                                <Button 
                                                    variant={groupBy === 'item' ? 'secondary' : 'ghost'} 
                                                    size="sm" 
                                                    className="h-7 px-2 text-xs"
                                                    onClick={() => setGroupBy('item')}
                                                >
                                                    <LayoutList className="h-3 w-3 mr-1.5" />
                                                    Item
                                                </Button>
                                            </div>
                                         </div>
                                        <div className="flex items-center gap-1 bg-secondary/30 p-0.5 rounded-lg border">
                                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedYear(y => y - 1)}>
                                                <ChevronLeft className="h-4 w-4" />
                                            </Button>
                                            <span className="font-medium text-sm w-12 text-center tabular-nums">{selectedYear}</span>
                                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedYear(y => y + 1)}>
                                                <ChevronRight className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="rounded-md border border-x-0 border-b-0 overflow-hidden">
                                    <div className="overflow-x-auto">
                                        <Table>
                                            <TableHeader>
                                                <TableRow className="bg-muted/40">
                                                    <TableHead className="w-[100px] font-semibold">Month</TableHead>
                                                    {groupBy === 'category' ? (
                                                        matrixData.categories.map(cat => (
                                                            <TableHead key={cat} className="text-right font-semibold">{cat}</TableHead>
                                                        ))
                                                    ) : (
                                                        matrixData.items.map(item => (
                                                            <TableHead key={item.id} className="text-right font-semibold min-w-[120px]">
                                                                <div className="flex flex-col items-end">
                                                                    <span>{item.name}</span>
                                                                    {/* Optional: Add category badge below name if space permits, 
                                                                        but for now keeping it clean */}
                                                                </div>
                                                            </TableHead>
                                                        ))
                                                    )}
                                                    <TableHead className="text-right font-bold bg-muted/30 w-[120px]">
                                                        {viewBasis === 'cash_flow' ? 'Annual Total' : 'Total Rate'}
                                                    </TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {months.map((month, index) => (
                                                    <TableRow key={month} className="hover:bg-muted/10">
                                                        <TableCell className="font-medium text-muted-foreground">{month}</TableCell>
                                                        
                                                        {groupBy === 'category' ? (
                                                            matrixData.categories.map(cat => (
                                                                <TableCell key={cat} className="text-right tabular-nums">
                                                                    {matrixData.aggregation.categoryTotals[cat][index] > 0 
                                                                        ? formatCurrency(matrixData.aggregation.categoryTotals[cat][index])
                                                                        : <span className="text-muted-foreground/20">-</span>
                                                                    }
                                                                </TableCell>
                                                            ))
                                                        ) : (
                                                            matrixData.items.map(item => (
                                                                <TableCell key={item.id} className="text-right tabular-nums">
                                                                    {item.monthlyValues[index] > 0
                                                                        ? formatCurrency(item.monthlyValues[index])
                                                                        : <span className="text-muted-foreground/20">-</span>
                                                                    }
                                                                </TableCell>
                                                            ))
                                                        )}

                                                        <TableCell className="text-right font-bold bg-muted/30 tabular-nums text-foreground">
                                                            {matrixData.aggregation.monthlyTotals[index] > 0
                                                                ? formatCurrency(matrixData.aggregation.monthlyTotals[index])
                                                                : <span className="text-muted-foreground/20">-</span>
                                                            }
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                            <TableFooter className="bg-muted/60 border-t-2 border-muted">
                                                <TableRow>
                                                    <TableCell className="font-bold">
                                                        {viewBasis === 'cash_flow' ? 'Grand Total' : 'Total Rate'}
                                                    </TableCell>
                                                    
                                                    {groupBy === 'category' ? (
                                                        matrixData.categories.map(cat => (
                                                            <TableCell key={cat} className="text-right font-bold tabular-nums">
                                                                {formatCurrency(matrixData.aggregation.categoryTotals[cat].reduce((a, b) => a + b, 0))}
                                                            </TableCell>
                                                        ))
                                                    ) : (
                                                        matrixData.items.map(item => (
                                                            <TableCell key={item.id} className="text-right font-bold tabular-nums">
                                                                {formatCurrency(item.total)}
                                                            </TableCell>
                                                        ))
                                                    )}

                                                    <TableCell className="text-right font-bold bg-muted/40 text-base tabular-nums">
                                                        {formatCurrency(matrixData.aggregation.grandTotal)}
                                                    </TableCell>
                                                </TableRow>
                                            </TableFooter>
                                        </Table>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </>
            )}

            <AddFixedExpenseDialog 
                isOpen={isAddExpenseOpen}
                onClose={handleDialogClose}
                onSaved={loadExpenses}
                vehicleId={vehicleId}
                expenseToEdit={editingExpense}
            />
        </div>
    );
};
