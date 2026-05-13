import React from 'react';
import { Car, Plus, Calendar, AlertCircle, CheckCircle, Edit } from 'lucide-react';

export function MyVehicle() {
  const hasVehicle = false;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">My Vehicle</h1>
        <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-full">
          Independent
        </span>
      </div>

      {!hasVehicle ? (
        <div className="bg-slate-800/50 rounded-xl p-8 border border-slate-700/50 text-center">
          <div className="w-16 h-16 rounded-full bg-slate-700 flex items-center justify-center mx-auto mb-4">
            <Car className="w-8 h-8 text-slate-500" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">Add Your Vehicle</h3>
          <p className="text-slate-400 text-sm mb-6 max-w-xs mx-auto">
            Add your vehicle information to track maintenance, expenses, and platform approvals.
          </p>
          <button className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white font-medium rounded-lg transition-colors mx-auto">
            <Plus className="w-4 h-4" />
            Add Vehicle
          </button>
        </div>
      ) : (
        <>
          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                  <Car className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <p className="text-white font-medium">2022 Toyota Camry</p>
                  <p className="text-slate-400 text-sm">ABC-1234</p>
                </div>
              </div>
              <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors">
                <Edit className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-900/50 rounded-lg p-3">
                <p className="text-slate-500 text-xs mb-1">Ownership</p>
                <p className="text-white text-sm">Owned</p>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-3">
                <p className="text-slate-500 text-xs mb-1">Mileage</p>
                <p className="text-white text-sm">45,000 mi</p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider px-1">
              Platform Status
            </h2>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 divide-y divide-slate-700/50">
              <PlatformStatus platform="Uber" status="approved" />
              <PlatformStatus platform="Lyft" status="pending" />
              <PlatformStatus platform="Bolt" status="not_submitted" />
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider px-1">
              Documents
            </h2>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 divide-y divide-slate-700/50">
              <DocumentItem label="Registration" expires="Dec 2026" status="valid" />
              <DocumentItem label="Insurance" expires="Jun 2026" status="expiring" />
              <DocumentItem label="Inspection" expires="Mar 2026" status="expired" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

interface PlatformStatusProps {
  platform: string;
  status: 'approved' | 'pending' | 'not_submitted' | 'rejected';
}

function PlatformStatus({ platform, status }: PlatformStatusProps) {
  const statusConfig = {
    approved: { label: 'Approved', color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
    pending: { label: 'Pending', color: 'text-amber-400', bg: 'bg-amber-500/20' },
    not_submitted: { label: 'Not Submitted', color: 'text-slate-400', bg: 'bg-slate-500/20' },
    rejected: { label: 'Rejected', color: 'text-red-400', bg: 'bg-red-500/20' },
  };

  const config = statusConfig[status];

  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-white text-sm">{platform}</span>
      <span className={`text-xs px-2 py-1 rounded-full ${config.bg} ${config.color}`}>
        {config.label}
      </span>
    </div>
  );
}

interface DocumentItemProps {
  label: string;
  expires: string;
  status: 'valid' | 'expiring' | 'expired';
}

function DocumentItem({ label, expires, status }: DocumentItemProps) {
  const statusConfig = {
    valid: { icon: CheckCircle, color: 'text-emerald-400' },
    expiring: { icon: AlertCircle, color: 'text-amber-400' },
    expired: { icon: AlertCircle, color: 'text-red-400' },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div>
        <p className="text-white text-sm">{label}</p>
        <p className="text-slate-500 text-xs">Expires: {expires}</p>
      </div>
      <Icon className={`w-5 h-5 ${config.color}`} />
    </div>
  );
}
