import React from 'react';
import { Wrench, Car, AlertCircle, CheckCircle, Calendar } from 'lucide-react';
import { useDriver } from '../../contexts/DriverContext';

export function FleetEquipment() {
  const { fleet } = useDriver();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Equipment</h1>
        <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-1 rounded-full">
          Fleet Only
        </span>
      </div>

      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
            <Car className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <p className="text-white font-medium">Assigned Vehicle</p>
            <p className="text-slate-400 text-sm">{fleet?.name || 'Your Fleet'}</p>
          </div>
        </div>

        <div className="bg-slate-900/50 rounded-lg p-4 text-center">
          <p className="text-slate-400 text-sm">
            No vehicle currently assigned. Contact your fleet manager for vehicle assignment.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider px-1">
          Equipment Checklist
        </h2>
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 divide-y divide-slate-700/50">
          <EquipmentItem
            label="Phone Mount"
            status="pending"
          />
          <EquipmentItem
            label="Charger Cable"
            status="pending"
          />
          <EquipmentItem
            label="First Aid Kit"
            status="pending"
          />
          <EquipmentItem
            label="Emergency Triangle"
            status="pending"
          />
        </div>
      </div>

      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-emerald-300 font-medium text-sm">Equipment Support</p>
            <p className="text-emerald-400/70 text-xs mt-1">
              Contact your fleet manager if you need equipment repairs or replacements.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

interface EquipmentItemProps {
  label: string;
  status: 'assigned' | 'pending' | 'maintenance';
}

function EquipmentItem({ label, status }: EquipmentItemProps) {
  const statusConfig = {
    assigned: { icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
    pending: { icon: AlertCircle, color: 'text-amber-400', bg: 'bg-amber-500/20' },
    maintenance: { icon: Wrench, color: 'text-red-400', bg: 'bg-red-500/20' },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-slate-300 text-sm">{label}</span>
      <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full ${config.bg}`}>
        <Icon className={`w-3 h-3 ${config.color}`} />
        <span className={`text-xs capitalize ${config.color}`}>{status}</span>
      </div>
    </div>
  );
}
