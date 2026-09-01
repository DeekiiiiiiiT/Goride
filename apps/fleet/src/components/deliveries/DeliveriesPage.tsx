import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search, Truck } from 'lucide-react';
import { api } from '../../services/api';
import { Trip } from '../../types/data';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { Card, CardContent } from '../ui/card';
import { format } from 'date-fns';

const RUSH_PLATFORM = 'Roam Rush';

export function DeliveriesPage() {
  const [search, setSearch] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['deliveries', 'roam-rush'],
    queryFn: async () => {
      const res = await api.getTripsFiltered({
        platform: RUSH_PLATFORM,
        limit: 100,
        offset: 0,
      });
      return (res.data ?? []) as Trip[];
    },
  });

  const trips = data ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return trips;
    return trips.filter(
      (t) =>
        t.driverName?.toLowerCase().includes(q) ||
        t.pickupLocation?.toLowerCase().includes(q) ||
        t.dropoffLocation?.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q),
    );
  }, [trips, search]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
          Deliveries
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Rush trips from {RUSH_PLATFORM} — live delivery log for your fleet.
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search deliveries…"
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex min-h-[280px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          Could not load Rush deliveries. Confirm Rush bridge sync is enabled for your org.
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-200 py-16 dark:border-slate-700">
          <Truck className="h-10 w-10 text-slate-300" />
          <p className="text-sm text-slate-500">No Rush deliveries yet.</p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Courier</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((trip) => (
                  <TableRow key={trip.id}>
                    <TableCell className="whitespace-nowrap text-slate-600">
                      {trip.date
                        ? format(new Date(trip.date), 'MMM d, yyyy')
                        : '—'}
                    </TableCell>
                    <TableCell>{trip.driverName ?? '—'}</TableCell>
                    <TableCell className="max-w-[240px] truncate text-slate-500">
                      {[trip.pickupLocation, trip.dropoffLocation].filter(Boolean).join(' → ') ||
                        '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{trip.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      ${Number(trip.amount ?? 0).toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
