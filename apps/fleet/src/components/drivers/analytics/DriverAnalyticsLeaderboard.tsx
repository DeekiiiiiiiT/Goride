import React from 'react';
import { Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Badge } from '../../ui/badge';
import { Avatar, AvatarFallback } from '../../ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table';
import { formatJMD } from '../../vehicles/analytics/AnalyticsKpiGrid';
import { cn } from '../../ui/utils';
import type { DriverRow } from '../../../utils/driverAnalyticsAggregates';

type Props = {
  rows: DriverRow[];
  mode: 'top' | 'bottom' | 'all';
  onMode: (m: 'top' | 'bottom' | 'all') => void;
  search: string;
  onSearch: (v: string) => void;
  onSelectDriver?: (driverId: string) => void;
};

export function DriverAnalyticsLeaderboard({
  rows,
  mode,
  onMode,
  search,
  onSearch,
  onSelectDriver,
}: Props) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="text-lg">Leaderboard</CardTitle>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: 'top', label: 'Top 10' },
                { id: 'bottom', label: 'Bottom 10' },
                { id: 'all', label: 'All' },
              ] as const
            ).map((t) => (
              <Button
                key={t.id}
                type="button"
                size="sm"
                variant={mode === t.id ? 'default' : 'outline'}
                className={cn('min-h-11', mode === t.id && 'bg-indigo-600 hover:bg-indigo-600')}
                onClick={() => onMode(t.id)}
              >
                {t.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            className="min-h-11 pl-9"
            placeholder="Search drivers…"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        {rows.length === 0 ? (
          <p className="text-sm text-slate-400 py-12 text-center px-4">
            No driver trip activity in this period.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Driver</TableHead>
                <TableHead className="text-right">Trips</TableHead>
                <TableHead className="text-right">Earnings</TableHead>
                <TableHead className="text-right hidden md:table-cell">Online</TableHead>
                <TableHead className="text-right hidden lg:table-cell">Util.</TableHead>
                <TableHead className="text-right hidden lg:table-cell">Accept.</TableHead>
                <TableHead className="text-right">Cancel.</TableHead>
                <TableHead className="text-right">Rating</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const initials = r.name
                  .split(/\s+/)
                  .map((p) => p[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase();
                const cancelPct = r.cancellationRate != null ? r.cancellationRate * 100 : null;
                const utilLow = r.utilizationPct != null && r.utilizationPct < 50;
                const ratingLow = r.rating != null && r.rating < 4.0;
                return (
                  <TableRow
                    key={r.driverId}
                    className={onSelectDriver ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50' : undefined}
                    onClick={() => onSelectDriver?.(r.driverId)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3 min-w-[140px]">
                        <Avatar className="h-9 w-9">
                          <AvatarFallback className="bg-indigo-100 text-indigo-700 text-xs font-bold">
                            {initials || '?'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">{r.name}</p>
                          <p className="text-[11px] text-slate-400 truncate">
                            {r.tier ? `${r.tier} · ` : ''}
                            {r.driverId.slice(0, 8)}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{r.trips}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {formatJMD(r.earnings)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums hidden md:table-cell">
                      {r.onlineHours != null ? `${r.onlineHours.toFixed(1)}h` : '—'}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums hidden lg:table-cell',
                        utilLow && 'text-rose-600 font-semibold',
                      )}
                    >
                      {r.utilizationPct != null ? `${r.utilizationPct.toFixed(0)}%` : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums hidden lg:table-cell">
                      {r.acceptanceRate != null ? `${(r.acceptanceRate * 100).toFixed(0)}%` : '—'}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums',
                        cancelPct != null && cancelPct >= 20 && 'text-rose-600 font-semibold',
                      )}
                    >
                      {cancelPct != null ? `${cancelPct.toFixed(0)}%` : '—'}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums',
                        ratingLow && 'text-rose-600 font-semibold',
                      )}
                    >
                      {r.rating != null ? r.rating.toFixed(1) : '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        {rows.length > 0 && (
          <div className="px-4 py-3 border-t border-slate-100 text-xs text-slate-500 flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px]">
              {rows.length} shown
            </Badge>
            Tap a row to open driver profile
          </div>
        )}
      </CardContent>
    </Card>
  );
}
