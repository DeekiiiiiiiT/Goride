import React from 'react';
import { Fuel, CreditCard, MapPin, AlertCircle } from 'lucide-react';
import { useDriver } from '../../contexts/DriverContext';

export function FleetFuelCard() {
  const { fleet } = useDriver();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Fuel Card</h1>
        <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-1 rounded-full">
          Fleet Only
        </span>
      </div>

      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 border border-slate-700/50 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl" />
        
        <div className="relative">
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="w-5 h-5 text-emerald-400" />
            <span className="text-emerald-400 text-sm font-medium">Fleet Fuel Card</span>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-slate-500 text-xs mb-1">Card Number</p>
              <p className="text-white font-mono text-lg">•••• •••• •••• ••••</p>
            </div>

            <div className="flex gap-8">
              <div>
                <p className="text-slate-500 text-xs mb-1">Cardholder</p>
                <p className="text-white text-sm">Not Assigned</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs mb-1">Fleet</p>
                <p className="text-white text-sm">{fleet?.name || 'Your Fleet'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
          <div className="flex items-center gap-2 text-slate-400 text-xs mb-2">
            <Fuel className="w-3 h-3" />
            <span>This Week</span>
          </div>
          <p className="text-xl font-bold text-white">$0.00</p>
          <p className="text-xs text-slate-500 mt-1">0 transactions</p>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
          <div className="flex items-center gap-2 text-slate-400 text-xs mb-2">
            <Fuel className="w-3 h-3" />
            <span>This Month</span>
          </div>
          <p className="text-xl font-bold text-white">$0.00</p>
          <p className="text-xs text-slate-500 mt-1">0 transactions</p>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider px-1">
          Recent Transactions
        </h2>
        <div className="bg-slate-800/50 rounded-xl p-8 border border-slate-700/50 text-center">
          <Fuel className="w-8 h-8 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">No fuel transactions yet</p>
          <p className="text-slate-500 text-xs mt-1">
            Transactions will appear here once you use your fuel card
          </p>
        </div>
      </div>

      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-300 font-medium text-sm">Fuel Card Policy</p>
            <p className="text-amber-400/70 text-xs mt-1">
              Use your fuel card only at approved stations. Personal use is prohibited.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
