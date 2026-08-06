import React, { useEffect, useMemo, useState } from 'react';
import { Eye, Loader2 } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '../ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { Badge } from '../ui/badge';
import { FuelCard, FuelEntry } from '../../types/fuel';
import { fuelService } from '../../services/fuelService';

interface FuelCardTransactionsSheetProps {
  card: FuelCard | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  getDriverName: (id?: string) => string;
  getVehicleName: (id?: string) => string;
}

function rowKindBadge(entry: FuelEntry) {
  const kind = String((entry.metadata as any)?.jaaRowKind || '');
  if (kind === 'fee') return <Badge variant="outline" className="bg-slate-50 text-slate-600">Fee</Badge>;
  if (kind === 'declined') return <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200">Declined</Badge>;
  if ((entry.metadata as any)?.awaitingCardStatement) {
    return <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">Awaiting statement</Badge>;
  }
  if ((entry.metadata as any)?.jaaMatchedDriverEntryId || (entry.metadata as any)?.jaaMatchedStatementId) {
    return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Matched</Badge>;
  }
  if (entry.type === 'Card_Transaction') {
    return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Statement</Badge>;
  }
  return <Badge variant="outline">Roam log</Badge>;
}

export function FuelCardTransactionsSheet({
  card,
  open,
  onOpenChange,
  getDriverName,
  getVehicleName,
}: FuelCardTransactionsSheetProps) {
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<FuelEntry[]>([]);

  useEffect(() => {
    if (!open || !card) return;
    let cancelled = false;
    setLoading(true);
    fuelService
      .getFuelEntries({ limit: 3000 })
      .then((all) => {
        if (cancelled) return;
        const mine = all
          .filter((e) => e.cardId === card.id)
          .sort((a, b) => {
            const ad = new Date(a.date.includes('T') ? a.date : `${a.date}T12:00:00`).getTime();
            const bd = new Date(b.date.includes('T') ? b.date : `${b.date}T12:00:00`).getTime();
            return bd - ad;
          });
        setEntries(mine);
      })
      .catch((err) => {
        console.error('[FuelCardTransactionsSheet] load failed', err);
        if (!cancelled) setEntries([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, card?.id]);

  const totals = useMemo(() => {
    const approved = entries.filter((e) => {
      const kind = (e.metadata as any)?.jaaRowKind;
      if (kind === 'fee' || kind === 'declined') return false;
      if ((e.metadata as any)?.awaitingCardStatement) return false;
      if ((e.metadata as any)?.countsInFuelSpend === false) return false;
      return (Number(e.amount) || 0) > 0;
    });
    return {
      spend: approved.reduce((s, e) => s + (Number(e.amount) || 0), 0),
      liters: approved.reduce((s, e) => s + (Number(e.liters) || 0), 0),
      count: entries.length,
    };
  }, [entries]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Card transactions
          </SheetTitle>
          <SheetDescription>
            {card ? (
              <span className="font-mono text-slate-800">{card.cardNumber}</span>
            ) : null}
            {card ? ` · ${card.provider}` : ''}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg border bg-slate-50 p-2">
            <p className="text-[10px] uppercase text-slate-400 font-bold">Rows</p>
            <p className="text-lg font-bold text-slate-800">{totals.count}</p>
          </div>
          <div className="rounded-lg border bg-slate-50 p-2">
            <p className="text-[10px] uppercase text-slate-400 font-bold">Fuel spend</p>
            <p className="text-lg font-bold text-slate-800">${totals.spend.toFixed(0)}</p>
          </div>
          <div className="rounded-lg border bg-slate-50 p-2">
            <p className="text-[10px] uppercase text-slate-400 font-bold">Liters</p>
            <p className="text-lg font-bold text-slate-800">{totals.liters.toFixed(1)}</p>
          </div>
        </div>

        <div className="mt-4 rounded-md border">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
            </div>
          ) : entries.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-500">
              No transactions linked to this card yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Station</TableHead>
                  <TableHead className="text-right">$</TableHead>
                  <TableHead className="text-right">L</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {entry.date}
                      {entry.time ? (
                        <div className="text-[10px] text-slate-400">{entry.time}</div>
                      ) : null}
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {getDriverName(entry.driverId) !== 'Unknown'
                          ? getDriverName(entry.driverId)
                          : '—'}
                        {' · '}
                        {getVehicleName(entry.vehicleId) !== 'Unknown'
                          ? getVehicleName(entry.vehicleId)
                          : '—'}
                      </div>
                      {(entry.metadata as any)?.jaaResponse ? (
                        <div className="text-[10px] text-slate-400 truncate max-w-[140px]" title={String((entry.metadata as any).jaaResponse)}>
                          {String((entry.metadata as any).jaaResponse)}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>{rowKindBadge(entry)}</TableCell>
                    <TableCell className="text-xs max-w-[120px] truncate" title={entry.location || ''}>
                      {entry.location || '—'}
                    </TableCell>
                    <TableCell className="text-right text-xs font-medium">
                      {(entry.metadata as any)?.awaitingCardStatement
                        ? '—'
                        : `$${(Number(entry.amount) || 0).toFixed(2)}`}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {entry.liters != null ? Number(entry.liters).toFixed(2) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
