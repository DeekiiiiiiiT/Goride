import React from 'react';
import { FileText, Download, Calendar, DollarSign, TrendingUp, AlertCircle } from 'lucide-react';

export function TaxCenter() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Tax Center</h1>
        <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-full">
          Independent
        </span>
      </div>

      <div className="bg-gradient-to-br from-indigo-500/20 to-purple-500/20 rounded-2xl p-4 border border-indigo-500/30">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center">
            <FileText className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <p className="text-indigo-300 font-medium">2026 Tax Summary</p>
            <p className="text-indigo-400/70 text-sm">Year to Date</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-indigo-400/70 text-xs mb-1">Total Income</p>
            <p className="text-xl font-bold text-white">$0.00</p>
          </div>
          <div>
            <p className="text-indigo-400/70 text-xs mb-1">Total Deductions</p>
            <p className="text-xl font-bold text-white">$0.00</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
          <div className="flex items-center gap-2 text-slate-400 text-xs mb-2">
            <TrendingUp className="w-3 h-3" />
            <span>Est. Tax Liability</span>
          </div>
          <p className="text-xl font-bold text-white">$0.00</p>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
          <div className="flex items-center gap-2 text-slate-400 text-xs mb-2">
            <Calendar className="w-3 h-3" />
            <span>Quarters Filed</span>
          </div>
          <p className="text-xl font-bold text-white">0/4</p>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider px-1">
          Deduction Categories
        </h2>
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 divide-y divide-slate-700/50">
          <DeductionRow label="Mileage Deduction" amount="$0.00" rate="$0.67/mi" />
          <DeductionRow label="Gas Expenses" amount="$0.00" />
          <DeductionRow label="Car Wash" amount="$0.00" />
          <DeductionRow label="Phone/Data" amount="$0.00" />
          <DeductionRow label="Tolls" amount="$0.00" />
          <DeductionRow label="Maintenance" amount="$0.00" />
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider px-1">
          Tax Documents
        </h2>
        <div className="space-y-2">
          <button className="w-full flex items-center gap-3 bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 hover:bg-slate-700/30 transition-colors">
            <Download className="w-5 h-5 text-emerald-400" />
            <div className="flex-1 text-left">
              <p className="text-white text-sm">Export Annual Summary</p>
              <p className="text-slate-500 text-xs">PDF report for tax filing</p>
            </div>
          </button>
          <button className="w-full flex items-center gap-3 bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 hover:bg-slate-700/30 transition-colors">
            <Download className="w-5 h-5 text-emerald-400" />
            <div className="flex-1 text-left">
              <p className="text-white text-sm">Export Expense Report</p>
              <p className="text-slate-500 text-xs">CSV for your accountant</p>
            </div>
          </button>
        </div>
      </div>

      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-300 font-medium text-sm">Tax Reminder</p>
            <p className="text-amber-400/70 text-xs mt-1">
              Consult a tax professional for personalized advice. This is for tracking purposes only.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

interface DeductionRowProps {
  label: string;
  amount: string;
  rate?: string;
}

function DeductionRow({ label, amount, rate }: DeductionRowProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div>
        <p className="text-slate-300 text-sm">{label}</p>
        {rate && <p className="text-slate-500 text-xs">{rate}</p>}
      </div>
      <span className="text-white font-medium">{amount}</span>
    </div>
  );
}
