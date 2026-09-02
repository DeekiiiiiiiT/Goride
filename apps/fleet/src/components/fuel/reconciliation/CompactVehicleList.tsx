import React from 'react';
import { Check } from 'lucide-react';
import { Badge } from '../../ui/badge';

export type CompactVehicleRow = {
  id: string;
  title: string;
  subtitle?: string;
  right?: string;
  badge?: string;
  warn?: boolean;
};

export function CompactVehicleList({ rows }: { rows: CompactVehicleRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-6 text-center text-sm text-emerald-800">
        <Check className="mx-auto mb-2 h-5 w-5" />
        Nothing left on this step.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="font-medium text-slate-900">{r.title}</div>
            {r.subtitle && <div className="text-xs text-slate-500">{r.subtitle}</div>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {r.badge && (
              <Badge
                variant="outline"
                className={`text-[10px] ${
                  r.warn ? 'border-[#684000]/30 bg-[#ffddb8] text-[#684000]' : ''
                }`}
              >
                {r.badge}
              </Badge>
            )}
            {r.right && (
              <span
                className={`text-sm font-semibold ${r.warn ? 'text-[#684000]' : 'text-slate-800'}`}
              >
                {r.right}
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
