import React from 'react';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import type { FuelMatchPair } from '../../utils/jaaFuelStatementMatcher';

interface Props {
  pairs: FuelMatchPair[];
}

const statusTone: Record<string, string> = {
  matched: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  unmatched_statement: 'bg-amber-100 text-amber-800 border-amber-200',
  unmatched_driver: 'bg-slate-100 text-slate-700 border-slate-200',
  ambiguous: 'bg-orange-100 text-orange-800 border-orange-200',
  amount_mismatch: 'bg-rose-100 text-rose-800 border-rose-200',
};

export function JaaFuelMatchReview({ pairs }: Props) {
  if (!pairs.length) return null;

  const counts = pairs.reduce(
    (acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <Card className="border-rose-100">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">JAA Statement Match Review</CardTitle>
        <CardDescription>
          Matched {counts.matched || 0} · Unmatched statement {counts.unmatched_statement || 0} ·
          Unmatched driver {counts.unmatched_driver || 0} · Ambiguous {counts.ambiguous || 0} ·
          Amount flags {counts.amount_mismatch || 0}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 max-h-80 overflow-y-auto">
        {pairs.map((p, i) => {
          const stmt = p.statementEntry;
          const drv = p.driverEntry;
          return (
            <div
              key={stmt?.id || drv?.id || i}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium text-slate-900 truncate">
                  {stmt
                    ? `${stmt.date} · $${Math.abs(stmt.amount).toFixed(2)} · ${stmt.liters ?? '—'}L · ${stmt.location || 'Station'}`
                    : `Driver log ${drv?.date} · $${Math.abs(drv?.amount || 0).toFixed(2)}`}
                </div>
                <div className="text-xs text-slate-500 truncate">
                  {drv
                    ? `Driver entry ${drv.id.slice(0, 8)}…${p.notes ? ` · ${p.notes}` : ''}`
                    : p.notes || 'No driver pair'}
                </div>
              </div>
              <Badge variant="outline" className={statusTone[p.status] || ''}>
                {p.status.replace(/_/g, ' ')}
                {p.score != null ? ` (${p.score})` : ''}
              </Badge>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
