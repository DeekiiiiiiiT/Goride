import React from 'react';
import { Receipt, Plus, Fuel, Car, Wrench, DollarSign, ChevronRight } from 'lucide-react';

export function IndependentExpenses() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Expenses</h1>
        <button className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-medium rounded-lg transition-colors">
          <Plus className="w-4 h-4" />
          Add Expense
        </button>
      </div>

      <div className="bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-2xl p-4 border border-purple-500/30">
        <p className="text-purple-300 text-sm mb-1">This Month's Expenses</p>
        <p className="text-3xl font-bold text-white">$0.00</p>
        <p className="text-purple-400/70 text-sm mt-2">0 expenses recorded</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ExpenseCategory
          icon={<Fuel className="w-5 h-5" />}
          label="Gas"
          amount="$0.00"
          color="text-amber-400"
          bg="bg-amber-500/20"
        />
        <ExpenseCategory
          icon={<Car className="w-5 h-5" />}
          label="Car Wash"
          amount="$0.00"
          color="text-blue-400"
          bg="bg-blue-500/20"
        />
        <ExpenseCategory
          icon={<Wrench className="w-5 h-5" />}
          label="Maintenance"
          amount="$0.00"
          color="text-emerald-400"
          bg="bg-emerald-500/20"
        />
        <ExpenseCategory
          icon={<DollarSign className="w-5 h-5" />}
          label="Other"
          amount="$0.00"
          color="text-purple-400"
          bg="bg-purple-500/20"
        />
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider px-1">
          Recent Expenses
        </h2>
        <div className="bg-slate-800/50 rounded-xl p-8 border border-slate-700/50 text-center">
          <Receipt className="w-8 h-8 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">No expenses recorded yet</p>
          <p className="text-slate-500 text-xs mt-1">
            Track your driving expenses for tax deductions
          </p>
        </div>
      </div>

      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white font-medium">Export for Taxes</p>
            <p className="text-slate-400 text-sm">Download expense report</p>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-500" />
        </div>
      </div>
    </div>
  );
}

interface ExpenseCategoryProps {
  icon: React.ReactNode;
  label: string;
  amount: string;
  color: string;
  bg: string;
}

function ExpenseCategory({ icon, label, amount, color, bg }: ExpenseCategoryProps) {
  return (
    <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
      <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center ${color} mb-2`}>
        {icon}
      </div>
      <p className="text-lg font-bold text-white">{amount}</p>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  );
}
