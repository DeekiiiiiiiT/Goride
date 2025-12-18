import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Checkbox } from "../ui/checkbox";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "../ui/dropdown-menu";
import { Search, MoreHorizontal, Download, CheckCircle2, FileText, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { Trip, FinancialTransaction, TransactionCategory } from "../../types/data";
import { generateMockTransactions } from "../../services/financialService";
import { TransactionFilters, TransactionFilterState } from "./TransactionFilters";
import { CashFlowDashboard } from "./CashFlowDashboard";
import { ExpensesTab } from "./ExpensesTab";
import { PayrollTab } from "./PayrollTab";
import { ReportCenter } from "./reports/ReportCenter";
import { format, isSameDay, subDays, startOfMonth, isBefore, isAfter, startOfDay, endOfDay } from "date-fns";
import { cn } from "../ui/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";

interface TransactionsTabProps {
  trips: Trip[];
  mode?: 'analytics' | 'list';
}

export function TransactionsTab({ trips, mode = 'analytics' }: TransactionsTabProps) {
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTxns, setSelectedTxns] = useState<Set<string>>(new Set());

  // Filters
  const [filters, setFilters] = useState<TransactionFilterState>({
    dateRange: 'all',
    type: 'all',
    status: 'all',
    driverId: 'all',
    minAmount: '',
    maxAmount: '',
    category: 'all',
    reconciled: 'all'
  });
  
  const [searchTerm, setSearchTerm] = useState('');

  // Initial Data Generation
  useEffect(() => {
    if (trips.length > 0) {
      setLoading(true);
      // Simulate async loading
      setTimeout(() => {
        const txns = generateMockTransactions(trips);
        setTransactions(txns);
        setLoading(false);
      }, 500);
    }
  }, [trips]);

  const handleAddTransaction = (newTxn: FinancialTransaction) => {
    setTransactions(prev => [newTxn, ...prev]);
  };

  // Derived Lists
  const drivers = useMemo(() => {
    const map = new Map();
    transactions.forEach(t => {
      if (t.driverId && !map.has(t.driverId)) {
        map.set(t.driverId, t.driverName || 'Unknown');
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [transactions]);

  const vehicles = useMemo(() => {
    const map = new Map();
    transactions.forEach(t => {
      if (t.vehicleId && !map.has(t.vehicleId)) {
        map.set(t.vehicleId, { id: t.vehicleId, plate: t.vehiclePlate || t.vehicleId || 'Unknown' });
      }
    });
    // Ensure we return unique vehicles
    return Array.from(map.values());
  }, [transactions]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach(t => set.add(t.category));
    return Array.from(set).sort();
  }, [transactions]);

  // Filter Logic
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      // Search
      const term = searchTerm.toLowerCase();
      if (term && !t.description.toLowerCase().includes(term) && !t.id.toLowerCase().includes(term)) {
        return false;
      }

      // Type
      if (filters.type !== 'all' && t.type !== filters.type) return false;

      // Status
      if (filters.status !== 'all' && t.status !== filters.status) return false;

      // Driver
      if (filters.driverId !== 'all' && t.driverId !== filters.driverId) return false;

      // Category
      if (filters.category !== 'all' && t.category !== filters.category) return false;

      // Reconciled
      if (filters.reconciled !== 'all') {
        const isRec = t.isReconciled;
        if (filters.reconciled === 'yes' && !isRec) return false;
        if (filters.reconciled === 'no' && isRec) return false;
      }

      // Amount
      if (filters.minAmount && Math.abs(t.amount) < parseFloat(filters.minAmount)) return false;
      if (filters.maxAmount && Math.abs(t.amount) > parseFloat(filters.maxAmount)) return false;

      // Date
      const tDate = new Date(t.date);
      const today = new Date();

      if (filters.dateRange === 'today') {
        if (!isSameDay(tDate, today)) return false;
      } else if (filters.dateRange === 'yesterday') {
        if (!isSameDay(tDate, subDays(today, 1))) return false;
      } else if (filters.dateRange === 'week') {
        if (isBefore(tDate, subDays(today, 7))) return false;
      } else if (filters.dateRange === 'month') {
        if (isBefore(tDate, startOfMonth(today))) return false;
      } else if (filters.dateRange === 'custom' && filters.dateStart) {
        const start = startOfDay(new Date(filters.dateStart));
        const end = filters.dateEnd ? endOfDay(new Date(filters.dateEnd)) : endOfDay(start);
        if (isBefore(tDate, start) || isAfter(tDate, end)) return false;
      }

      return true;
    });
  }, [transactions, filters, searchTerm]);

  // Selection Logic
  const toggleSelectAll = () => {
    if (selectedTxns.size === filteredTransactions.length) {
      setSelectedTxns(new Set());
    } else {
      setSelectedTxns(new Set(filteredTransactions.map(t => t.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedTxns);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedTxns(newSet);
  };

  // Quick Views
  const applyQuickView = (view: string) => {
    const today = new Date();
    switch (view) {
      case 'today':
        setFilters(prev => ({ ...prev, dateRange: 'today', type: 'all', status: 'all', reconciled: 'all' }));
        break;
      case 'unreconciled':
        setFilters(prev => ({ ...prev, reconciled: 'no' }));
        break;
      case 'large':
        setFilters(prev => ({ ...prev, minAmount: '1000' }));
        break;
      case 'cash':
        // Not implemented in filters yet, but logic is conceptual
        break;
      case 'expenses':
        setFilters(prev => ({ ...prev, type: 'Expense' }));
        break;
    }
  };

  // Helper for formatting currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const listViewContent = (
     <div className="space-y-4">
            {/* Quick Analysis Views */}
            <div className="flex gap-2 overflow-x-auto pb-2">
                <Button variant="outline" size="sm" className="whitespace-nowrap" onClick={() => applyQuickView('today')}>
                Today's Transactions
                </Button>
                <Button variant="outline" size="sm" className="whitespace-nowrap" onClick={() => applyQuickView('unreconciled')}>
                Unreconciled Only
                </Button>
                <Button variant="outline" size="sm" className="whitespace-nowrap" onClick={() => applyQuickView('large')}>
                Large Transactions {'>'}$1k
                </Button>
                <Button variant="outline" size="sm" className="whitespace-nowrap" onClick={() => applyQuickView('expenses')}>
                Expense Claims
                </Button>
            </div>

            <div className="flex flex-col gap-4 md:flex-row md:items-start justify-between bg-slate-50/50 p-4 rounded-lg border border-slate-100">
                <TransactionFilters 
                filters={filters} 
                onFilterChange={setFilters} 
                drivers={drivers}
                categories={categories}
                />
                
                <div className="relative w-full md:w-[300px]">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                <Input 
                    placeholder="Search transactions..." 
                    className="pl-8 bg-white"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
                </div>
            </div>

            {/* Batch Actions Bar */}
            {selectedTxns.size > 0 && (
                <div className="flex items-center gap-2 bg-indigo-50 p-2 rounded-md border border-indigo-100 text-indigo-700 animate-in fade-in slide-in-from-top-2">
                <span className="text-sm font-medium px-2">{selectedTxns.size} selected</span>
                <div className="h-4 w-px bg-indigo-200 mx-2" />
                <Button size="sm" variant="ghost" className="hover:bg-indigo-100 hover:text-indigo-800 h-8 gap-1">
                    <CheckCircle2 className="h-4 w-4" /> Mark Reconciled
                </Button>
                <Button size="sm" variant="ghost" className="hover:bg-indigo-100 hover:text-indigo-800 h-8 gap-1">
                    <FileText className="h-4 w-4" /> Categorize
                </Button>
                <Button size="sm" variant="ghost" className="hover:bg-indigo-100 hover:text-indigo-800 h-8 gap-1">
                    <Download className="h-4 w-4" /> Export
                </Button>
                </div>
            )}

            <Card>
                <CardHeader className="pb-3 border-b">
                <div className="flex items-center justify-between">
                    <CardTitle>Transaction History</CardTitle>
                    <Badge variant="outline" className="font-mono">
                    {filteredTransactions.length} records
                    </Badge>
                </div>
                </CardHeader>
                <CardContent className="p-0">
                <Table>
                    <TableHeader>
                    <TableRow className="bg-slate-50">
                        <TableHead className="w-[40px]">
                        <Checkbox 
                            checked={filteredTransactions.length > 0 && selectedTxns.size === filteredTransactions.length}
                            onCheckedChange={toggleSelectAll}
                        />
                        </TableHead>
                        <TableHead>Date / Time</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                    </TableHeader>
                    <TableBody>
                    {loading ? (
                        <TableRow>
                        <TableCell colSpan={8} className="h-32 text-center text-slate-500">
                            Loading transactions...
                        </TableCell>
                        </TableRow>
                    ) : filteredTransactions.length === 0 ? (
                        <TableRow>
                        <TableCell colSpan={8} className="h-64 text-center text-slate-500">
                            No transactions found matching your filters.
                        </TableCell>
                        </TableRow>
                    ) : (
                        filteredTransactions.slice(0, 50).map((txn) => (
                        <TableRow key={txn.id} className="hover:bg-slate-50/50">
                            <TableCell>
                            <Checkbox 
                                checked={selectedTxns.has(txn.id)}
                                onCheckedChange={() => toggleSelect(txn.id)}
                            />
                            </TableCell>
                            <TableCell className="align-top">
                            <div className="flex flex-col">
                                <span className="font-medium text-slate-900">{format(new Date(txn.date), 'MMM d, yyyy')}</span>
                                <span className="text-xs text-slate-500">{txn.time}</span>
                            </div>
                            </TableCell>
                            <TableCell className="align-top">
                                <div className="flex items-center gap-1.5">
                                    {txn.amount >= 0 ? (
                                        <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-500" />
                                    ) : (
                                        <ArrowUpRight className="h-3.5 w-3.5 text-rose-500" />
                                    )}
                                    <span className={cn(
                                        "text-xs font-medium px-1.5 py-0.5 rounded-full border",
                                        txn.type === 'Revenue' ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                                        txn.type === 'Expense' ? "bg-rose-50 text-rose-700 border-rose-100" :
                                        txn.type === 'Payout' ? "bg-amber-50 text-amber-700 border-amber-100" :
                                        "bg-blue-50 text-blue-700 border-blue-100"
                                    )}>
                                        {txn.type}
                                    </span>
                                </div>
                            </TableCell>
                            <TableCell className="align-top">
                            <div className="flex flex-col max-w-[250px]">
                                <span className="text-sm font-medium text-slate-700 truncate" title={txn.description}>
                                    {txn.description}
                                </span>
                                {txn.driverName && (
                                    <span className="text-xs text-slate-500">Driver: {txn.driverName}</span>
                                )}
                            </div>
                            </TableCell>
                            <TableCell className="align-top">
                                <Badge variant="secondary" className="font-normal text-xs text-slate-600 bg-slate-100">
                                    {txn.category}
                                </Badge>
                            </TableCell>
                            <TableCell className="align-top text-right">
                                <span className={cn(
                                    "font-bold font-mono",
                                    txn.amount >= 0 ? "text-emerald-600" : "text-rose-600"
                                )}>
                                    {txn.amount >= 0 ? '+' : ''}{formatCurrency(txn.amount)}
                                </span>
                            </TableCell>
                            <TableCell className="align-top text-center">
                                {txn.isReconciled ? (
                                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] gap-1">
                                        <CheckCircle2 className="h-3 w-3" /> Reconciled
                                    </Badge>
                                ) : (
                                    <Badge variant="outline" className="text-slate-500 border-slate-200 text-[10px]">
                                        {txn.status}
                                    </Badge>
                                )}
                            </TableCell>
                            <TableCell>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0">
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuItem>View Details</DropdownMenuItem>
                                <DropdownMenuItem>Edit Transaction</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem>Mark as {txn.isReconciled ? 'Unreconciled' : 'Reconciled'}</DropdownMenuItem>
                                <DropdownMenuItem className="text-rose-600">Delete</DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                            </TableCell>
                        </TableRow>
                        ))
                    )}
                    </TableBody>
                </Table>
                </CardContent>
            </Card>
      </div>
  );

  if (mode === 'list') {
      return listViewContent;
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="dashboard" className="w-full">
        <div className="flex items-center justify-between mb-4">
             <TabsList>
                <TabsTrigger value="dashboard">Cash Flow Analysis</TabsTrigger>
                <TabsTrigger value="expenses">Expense Management</TabsTrigger>
                <TabsTrigger value="payroll">Payroll System</TabsTrigger>
                <TabsTrigger value="reports">Report Center</TabsTrigger>
             </TabsList>
             
             {/* Global Actions could go here */}
        </div>

        <TabsContent value="dashboard">
             <CashFlowDashboard transactions={transactions} />
        </TabsContent>
        
        <TabsContent value="expenses">
            <ExpensesTab transactions={transactions} onAddTransaction={handleAddTransaction} vehicles={vehicles} />
        </TabsContent>

        <TabsContent value="payroll">
            <PayrollTab transactions={transactions} onAddTransaction={handleAddTransaction} drivers={drivers} />
        </TabsContent>

        <TabsContent value="reports">
            <ReportCenter transactions={transactions} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

