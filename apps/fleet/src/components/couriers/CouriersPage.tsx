import React, { useMemo, useState } from 'react';
import type { CourierComplianceBlocker } from '@roam/types/courier';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search, Package, Plus } from 'lucide-react';
import { api } from '../../services/api';
import { Button } from '../ui/button';
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

export interface CourierProfile {
  id: string;
  name: string;
  status: string;
  phone?: string;
  email?: string;
  totalDeliveries?: number;
  complianceBlockers?: CourierComplianceBlocker[];
}

const BLOCKER_LABELS: Partial<Record<CourierComplianceBlocker, string>> = {
  onboarding_incomplete: 'Onboarding',
  background_check_not_approved: 'Background check',
  license_missing: 'License',
  vehicle_missing: 'Vehicle',
  insurance_missing: 'Insurance',
  account_suspended: 'Suspended',
};

function normalizeCourier(row: Record<string, unknown>): CourierProfile {
  return {
    id: String(row.id ?? ''),
    name:
      (typeof row.name === 'string' && row.name.trim()) ||
      (typeof row.driverName === 'string' && row.driverName.trim()) ||
      'Unknown Courier',
    status: (typeof row.status === 'string' && row.status) || 'Active',
    phone: typeof row.phone === 'string' ? row.phone : undefined,
    email: typeof row.email === 'string' ? row.email : undefined,
    totalDeliveries: typeof row.totalTrips === 'number' ? row.totalTrips : undefined,
    complianceBlockers: Array.isArray(row.complianceBlockers)
      ? (row.complianceBlockers as CourierComplianceBlocker[])
      : undefined,
  };
}

export function CouriersPage() {
  const [search, setSearch] = useState('');

  const { data: couriers = [], isLoading, isError } = useQuery({
    queryKey: ['couriers', 'rush'],
    queryFn: async () => {
      const drivers = await api.getDrivers();
      return (Array.isArray(drivers) ? drivers : [])
        .map((d) => normalizeCourier(d as Record<string, unknown>))
        .filter((c) => c.id);
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return couriers;
    return couriers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q),
    );
  }, [couriers, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Couriers
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Rush delivery workforce — roster syncs from fleet drivers with courier service line.
          </p>
        </div>
        <Button className="bg-indigo-600 hover:bg-indigo-700" disabled>
          <Plus className="mr-2 h-4 w-4" />
          Invite courier
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search couriers…"
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
          Could not load couriers. Try refreshing — Rush courier API wiring lands in Phase 5.
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-200 py-16 dark:border-slate-700">
          <Package className="h-10 w-10 text-slate-300" />
          <p className="text-sm text-slate-500">No couriers yet. Invite your first Rush courier.</p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Compliance</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-right">Deliveries</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((courier) => (
                  <TableRow key={courier.id}>
                    <TableCell className="font-medium">{courier.name}</TableCell>
                    <TableCell>
                      <Badge variant={courier.status === 'Active' ? 'default' : 'secondary'}>
                        {courier.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {courier.complianceBlockers?.length ? (
                        <div className="flex flex-wrap gap-1">
                          {courier.complianceBlockers.slice(0, 2).map((b) => (
                            <Badge key={b} variant="outline" className="text-[10px]">
                              {BLOCKER_LABELS[b] ?? b}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-emerald-600">Clear</span>
                      )}
                    </TableCell>
                    <TableCell className="text-slate-500">{courier.phone ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {courier.totalDeliveries ?? '—'}
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
