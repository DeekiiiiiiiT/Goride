/**
 * Rev6 break-glass: operator recovers SNAPSHOT_MISMATCH without curl.
 * Refuse is protective — force requires a typed reason (≥8 chars). Admin-only.
 */
import React, { useCallback, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
} from '../../ui/alert-dialog';
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import { cn } from '../../ui/utils';
import { useAuth } from '../../auth/AuthContext';

export type FuelMismatchRow = {
  driverId?: string;
  deltas?: Array<{ field?: string; delta?: number }>;
};

function summarizeMismatches(mismatches: FuelMismatchRow[]): string {
  const lines: string[] = [];
  for (const row of mismatches.slice(0, 8)) {
    const did = String(row.driverId || 'driver').slice(0, 8);
    const fields = (row.deltas || [])
      .slice(0, 4)
      .map((d) => `${d.field}:${Number(d.delta || 0).toFixed(2)}`)
      .join(', ');
    lines.push(`${did}… ${fields || 'delta'}`);
  }
  if (mismatches.length > 8) lines.push(`…and ${mismatches.length - 8} more`);
  return lines.join('\n') || 'Server shares/categories disagree with the reviewed snapshot.';
}

function canForceClientMoney(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'superadmin';
}

export function useFuelForceClientMoneyDialog() {
  const { role } = useAuth();
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState('');
  const [reason, setReason] = useState('');
  const [resolver, setResolver] = useState<((v: string | null) => void) | null>(null);

  const confirmIfMismatch = useCallback((mismatches: FuelMismatchRow[]) => {
    return new Promise<string | null>((resolve) => {
      if (!canForceClientMoney(role)) {
        resolve(null);
        return;
      }
      setSummary(summarizeMismatches(mismatches));
      setReason('');
      setResolver(() => resolve);
      setOpen(true);
    });
  }, [role]);

  const finish = (value: string | null) => {
    resolver?.(value);
    setResolver(null);
    setOpen(false);
  };

  const canForce = reason.trim().length >= 8;

  const dialog = (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) finish(null);
      }}
    >
      <AlertDialogPortal>
        <AlertDialogOverlay className="z-[250]" />
        <AlertDialogPrimitive.Content
          data-slot="alert-dialog-content"
          className={cn(
            'bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-[250] grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg',
          )}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Server refused this fuel close</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-slate-600">
                <p>
                  The server money check found a mismatch. That protects the ledger — it is not a
                  random error. Force only if you have reviewed the numbers and accept the
                  client-reviewed amounts.
                </p>
                <pre className="max-h-36 overflow-auto rounded-md border border-rose-200 bg-rose-50/70 p-3 text-[11px] text-slate-800 whitespace-pre-wrap">
                  {summary}
                </pre>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-slate-700">
                    Force reason (8+ characters)
                  </span>
                  <textarea
                    className="min-h-[72px] w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Why the reviewed amounts must win…"
                  />
                </label>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => finish(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!canForce}
              onClick={(e) => {
                e.preventDefault();
                if (!canForce) return;
                finish(reason.trim());
              }}
            >
              Force close with client money
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogPrimitive.Content>
      </AlertDialogPortal>
    </AlertDialog>
  );

  return { confirmIfMismatch, dialog };
}
