import React from 'react';
import { Receipt, Plus, Clock, CheckCircle, XCircle } from 'lucide-react';

export function FleetReimbursements() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Reimbursements</h1>
        <button className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-medium rounded-lg transition-colors">
          <Plus className="w-4 h-4" />
          New Claim
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="Pending"
          value="0"
          icon={<Clock className="w-4 h-4" />}
          color="text-amber-400"
          bg="bg-amber-500/20"
        />
        <StatCard
          label="Approved"
          value="$0"
          icon={<CheckCircle className="w-4 h-4" />}
          color="text-emerald-400"
          bg="bg-emerald-500/20"
        />
        <StatCard
          label="Rejected"
          value="0"
          icon={<XCircle className="w-4 h-4" />}
          color="text-red-400"
          bg="bg-red-500/20"
        />
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider px-1">
          Recent Claims
        </h2>
        <div className="bg-slate-800/50 rounded-xl p-8 border border-slate-700/50 text-center">
          <Receipt className="w-8 h-8 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">No reimbursement claims yet</p>
          <p className="text-slate-500 text-xs mt-1">
            Submit claims for work-related expenses
          </p>
        </div>
      </div>

      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
        <h3 className="text-white font-medium mb-3">Eligible Expenses</h3>
        <ul className="space-y-2 text-sm text-slate-400">
          <li className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Tolls (with receipt)
          </li>
          <li className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Car wash expenses
          </li>
          <li className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Parking fees (work-related)
          </li>
          <li className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Emergency supplies
          </li>
        </ul>
      </div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
}

function StatCard({ label, value, icon, color, bg }: StatCardProps) {
  return (
    <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50">
      <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center ${color} mb-2`}>
        {icon}
      </div>
      <p className="text-lg font-bold text-white">{value}</p>
      <p className="text-[10px] text-slate-400">{label}</p>
    </div>
  );
}
