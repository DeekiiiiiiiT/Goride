import React, { useState } from 'react';
import { DollarSign, Calendar, TrendingUp, ChevronDown } from 'lucide-react';
import { useDriver } from '../../contexts/DriverContext';

export function DriverEarnings() {
  const { isFleetDriver } = useDriver();
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('week');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Earnings</h1>
        <div className="relative">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as 'today' | 'week' | 'month')}
            className="appearance-none bg-white border border-slate-300 rounded-lg px-3 py-2 pr-8 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 dark:bg-slate-800 dark:border-slate-600 dark:text-white"
          >
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400 pointer-events-none" />
        </div>
      </div>

      <div className="bg-gradient-to-br from-emerald-600 to-teal-600 rounded-2xl p-6 text-white shadow-lg">
        <p className="text-emerald-50 text-sm font-semibold mb-1">Total Earnings</p>
        <p className="text-4xl font-bold tracking-tight">$0.00</p>
        <div className="flex items-center gap-2 mt-3 text-sm font-medium">
          <div className="flex items-center gap-1 bg-white/20 rounded-full px-2 py-0.5">
            <TrendingUp className="w-3 h-3" />
            <span>+0%</span>
          </div>
          <span className="text-emerald-50">vs last {period === 'today' ? 'day' : period}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white/90 rounded-xl p-4 border border-slate-200 shadow-sm dark:bg-slate-800/50 dark:border-slate-700/50">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300 text-xs font-bold mb-2 uppercase tracking-wide">
            <Calendar className="w-3 h-3" />
            <span>Trips</span>
          </div>
          <p className="text-xl font-bold text-slate-900 dark:text-white">0</p>
        </div>
        <div className="bg-white/90 rounded-xl p-4 border border-slate-200 shadow-sm dark:bg-slate-800/50 dark:border-slate-700/50">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300 text-xs font-bold mb-2 uppercase tracking-wide">
            <DollarSign className="w-3 h-3" />
            <span>Avg per Trip</span>
          </div>
          <p className="text-xl font-bold text-slate-900 dark:text-white">$0.00</p>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider px-1">
          Breakdown
        </h2>
        <div className="bg-white/90 rounded-xl border border-slate-200 divide-y divide-slate-200 shadow-sm dark:bg-slate-800/50 dark:border-slate-700/50 dark:divide-slate-700/50">
          <EarningsRow label="Base Fare" amount="$0.00" />
          <EarningsRow label="Tips" amount="$0.00" />
          <EarningsRow label="Bonuses" amount="$0.00" />
          {isFleetDriver && (
            <>
              <EarningsRow label="Fleet Bonus" amount="$0.00" />
              <EarningsRow label="Fleet Deductions" amount="-$0.00" isNegative />
            </>
          )}
        </div>
      </div>

      <div className="bg-white/90 rounded-xl p-4 border border-slate-200 shadow-sm dark:bg-slate-800/50 dark:border-slate-700/50">
        <p className="text-slate-600 dark:text-slate-300 text-sm text-center font-medium leading-relaxed">
          Connect your rideshare platforms to start tracking earnings automatically.
        </p>
      </div>
    </div>
  );
}

interface EarningsRowProps {
  label: string;
  amount: string;
  isNegative?: boolean;
}

function EarningsRow({ label, amount, isNegative }: EarningsRowProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-slate-700 dark:text-slate-200 text-sm font-semibold">{label}</span>
      <span className={`font-bold tabular-nums ${isNegative ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'}`}>
        {amount}
      </span>
    </div>
  );
}
