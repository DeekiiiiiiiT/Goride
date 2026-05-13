import React, { useState } from 'react';
import { DollarSign, Calendar, TrendingUp, TrendingDown, ChevronDown } from 'lucide-react';
import { useDriver } from '../../contexts/DriverContext';

export function DriverEarnings() {
  const { isFleetDriver } = useDriver();
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('week');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Earnings</h1>
        <div className="relative">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as any)}
            className="appearance-none bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 pr-8 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          >
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
      </div>

      <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-6 text-white">
        <p className="text-emerald-100 text-sm mb-1">Total Earnings</p>
        <p className="text-4xl font-bold">$0.00</p>
        <div className="flex items-center gap-2 mt-3 text-sm">
          <div className="flex items-center gap-1 bg-white/20 rounded-full px-2 py-0.5">
            <TrendingUp className="w-3 h-3" />
            <span>+0%</span>
          </div>
          <span className="text-emerald-100">vs last {period === 'today' ? 'day' : period}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
          <div className="flex items-center gap-2 text-slate-400 text-xs mb-2">
            <Calendar className="w-3 h-3" />
            <span>Trips</span>
          </div>
          <p className="text-xl font-bold text-white">0</p>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
          <div className="flex items-center gap-2 text-slate-400 text-xs mb-2">
            <DollarSign className="w-3 h-3" />
            <span>Avg per Trip</span>
          </div>
          <p className="text-xl font-bold text-white">$0.00</p>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider px-1">
          Breakdown
        </h2>
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 divide-y divide-slate-700/50">
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

      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
        <p className="text-slate-400 text-sm text-center">
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
      <span className="text-slate-300 text-sm">{label}</span>
      <span className={`font-medium ${isNegative ? 'text-red-400' : 'text-white'}`}>
        {amount}
      </span>
    </div>
  );
}
