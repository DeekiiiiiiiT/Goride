import React from 'react';
import { Shield, AlertCircle, CheckCircle, Calendar, Upload, Phone, ChevronRight } from 'lucide-react';

export function InsuranceCenter() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Insurance</h1>
        <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-full">
          Independent
        </span>
      </div>

      <div className="bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-2xl p-4 border border-blue-500/30">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
            <Shield className="w-6 h-6 text-blue-400" />
          </div>
          <div className="flex-1">
            <p className="text-blue-300 font-medium">Insurance Status</p>
            <p className="text-blue-400/70 text-sm">No policy on file</p>
          </div>
          <AlertCircle className="w-6 h-6 text-amber-400" />
        </div>

        <button className="w-full py-2.5 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/50 text-blue-300 font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
          <Upload className="w-4 h-4" />
          Upload Policy
        </button>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider px-1">
          Rideshare Coverage
        </h2>
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 divide-y divide-slate-700/50">
          <CoverageItem
            platform="Uber"
            status="unknown"
            description="Add Uber rideshare endorsement"
          />
          <CoverageItem
            platform="Lyft"
            status="unknown"
            description="Add Lyft rideshare endorsement"
          />
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider px-1">
          Required Documents
        </h2>
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 divide-y divide-slate-700/50">
          <DocumentItem label="Insurance Card" status="missing" />
          <DocumentItem label="Policy Declaration" status="missing" />
          <DocumentItem label="Rideshare Endorsement" status="missing" />
        </div>
      </div>

      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
        <h3 className="text-white font-medium mb-3">Minimum Requirements</h3>
        <ul className="space-y-2 text-sm text-slate-400">
          <li className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Liability: $50,000/$100,000/$25,000
          </li>
          <li className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Comprehensive & Collision recommended
          </li>
          <li className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Rideshare endorsement required
          </li>
        </ul>
      </div>

      <button className="w-full flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 hover:bg-emerald-500/20 transition-colors">
        <Phone className="w-5 h-5 text-emerald-400" />
        <div className="flex-1 text-left">
          <p className="text-emerald-300 font-medium">Get Insurance Quote</p>
          <p className="text-emerald-400/70 text-sm">Compare rideshare-friendly options</p>
        </div>
        <ChevronRight className="w-5 h-5 text-emerald-400" />
      </button>

      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-300 font-medium text-sm">Insurance Requirement</p>
            <p className="text-amber-400/70 text-xs mt-1">
              All rideshare platforms require proof of insurance with rideshare endorsement.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

interface CoverageItemProps {
  platform: string;
  status: 'covered' | 'not_covered' | 'unknown';
  description: string;
}

function CoverageItem({ platform, status, description }: CoverageItemProps) {
  const statusConfig = {
    covered: { icon: CheckCircle, color: 'text-emerald-400' },
    not_covered: { icon: AlertCircle, color: 'text-red-400' },
    unknown: { icon: AlertCircle, color: 'text-amber-400' },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Icon className={`w-5 h-5 ${config.color}`} />
      <div className="flex-1">
        <p className="text-white text-sm">{platform}</p>
        <p className="text-slate-500 text-xs">{description}</p>
      </div>
    </div>
  );
}

interface DocumentItemProps {
  label: string;
  status: 'uploaded' | 'missing' | 'expired';
}

function DocumentItem({ label, status }: DocumentItemProps) {
  const statusConfig = {
    uploaded: { label: 'Uploaded', color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
    missing: { label: 'Missing', color: 'text-amber-400', bg: 'bg-amber-500/20' },
    expired: { label: 'Expired', color: 'text-red-400', bg: 'bg-red-500/20' },
  };

  const config = statusConfig[status];

  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-slate-300 text-sm">{label}</span>
      <span className={`text-xs px-2 py-1 rounded-full ${config.bg} ${config.color}`}>
        {config.label}
      </span>
    </div>
  );
}
