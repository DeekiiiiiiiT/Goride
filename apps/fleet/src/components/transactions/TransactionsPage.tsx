import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { Trip } from '../../types/data';
import { Loader2 } from 'lucide-react';
import { TransactionsTab } from '../finance/TransactionsTab';
import { TabbedTransactionList } from '../finance/TabbedTransactionList';
import { toast } from "sonner@2.0.3";

export function TransactionsPage({ mode = 'analytics' }: { mode?: 'analytics' | 'list' }) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (mode === 'list') {
      // TabbedTransactionList handles its own data fetching — no trips needed
      setLoading(false);
      return;
    }
    const fetchTrips = async () => {
      try {
        setLoading(true);
        const data = await api.getTrips();
        setTrips(data);
      } catch (err) {
        console.error("Failed to fetch trips", err);
        toast.error("Failed to load data for transactions");
      } finally {
        setLoading(false);
      }
    };
    fetchTrips();
  }, [mode]);

  // ── List mode: render the tabbed transaction list ──
  if (mode === 'list') {
    return <TabbedTransactionList />;
  }

  // ── Analytics mode: keep existing TransactionsTab ──
  if (loading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">Financial Analytics</h2>
        <p className="text-slate-500">Manage cash flow, expenses, payroll, and generate financial reports.</p>
      </div>
      <TransactionsTab trips={trips} mode={mode} />
    </div>
  );
}