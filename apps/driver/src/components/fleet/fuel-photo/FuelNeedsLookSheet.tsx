/**
 * One fill — Needs a look (Stitch driver screen 10; docs/fuel-log-offline-first-audit.md S10).
 * The driver can add the total and litres, or retake the pump photo. Nothing here deletes the
 * fill (FO-18); the fleet approves or rejects it.
 */
import React, { useState } from 'react';
import { Camera, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetTitle } from '@roam/ui';
import { api } from '../../../services/api';
import { uploadEvidenceFile } from '../../../services/uploadEvidence';
import { captureNativePhoto } from '../../../utils/nativePhotoCapture';

export interface NeedsLookFill {
  id: string;
  date: Date;
  odometer?: number;
  reason?: string;
  captureId?: string;
  paidWith: string;
}

function parseNumber(v: string): number | undefined {
  const n = Number(v.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function FuelNeedsLookSheet({
  fill,
  isOnline,
  onClose,
  onSaved,
}: {
  fill: NeedsLookFill | null;
  isOnline: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [total, setTotal] = useState('');
  const [liters, setLiters] = useState('');
  const [busy, setBusy] = useState(false);

  if (!fill) return null;
  const t = parseNumber(total);
  const l = parseNumber(liters);

  const addNumbers = async () => {
    if (!t || !l) return;
    if (!isOnline) {
      toast.message('This needs signal. Try again when you have signal.');
      return;
    }
    setBusy(true);
    try {
      await api.addFuelFillNumbers(fill.id, { total: t, liters: l });
      toast.success('Numbers added. Your fleet will check them.');
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the numbers');
    } finally {
      setBusy(false);
    }
  };

  const retake = async () => {
    if (!isOnline) {
      toast.message('This needs signal. Try again when you have signal.');
      return;
    }
    const file = await captureNativePhoto('fuel', { maxSize: 1600 });
    if (!file) return;
    setBusy(true);
    try {
      const res = await uploadEvidenceFile(file, {
        evidenceType: 'fuel_receipt',
        sourceType: 'transaction',
        sourceId: fill.id,
        retentionClass: 'ephemeral',
        parentStatus: 'Pending',
        ...(fill.captureId ? { captureId: fill.captureId, photoKind: 'pump' as const } : {}),
      });
      await api.addFuelFillNumbers(fill.id, { pumpPhotoUrl: res.url });
      toast.success("New photo sent. We'll read it again.");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not send the photo');
    } finally {
      setBusy(false);
    }
  };

  const dayLabel = fill.date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <Sheet open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <SheetContent side="bottom" className="rounded-t-2xl p-0">
        <div className="p-5">
          <div className="mb-3 pr-10">
            <SheetTitle className="text-lg font-bold">Fuel · {dayLabel}</SheetTitle>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 dark:bg-red-950/40 dark:text-red-300">
            <Eye className="h-3.5 w-3.5" /> Needs a look
          </span>
          <p className="mt-3 text-sm text-slate-700 dark:text-slate-200">
            {fill.reason || "We couldn't read the total from the pump photo."} Your fleet will check it.
          </p>

          <div className="mt-4 divide-y rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {fill.odometer ? (
              <div className="flex justify-between px-4 py-3 text-sm">
                <span className="text-slate-500">Odometer</span>
                <span className="font-semibold tabular-nums">{fill.odometer.toLocaleString('en-US')} km</span>
              </div>
            ) : null}
            <div className="flex justify-between px-4 py-3 text-sm">
              <span className="text-slate-500">Paid with</span>
              <span className="font-semibold">{fill.paidWith}</span>
            </div>
          </div>

          <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">Know the numbers? Add them here.</p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <label className="block text-sm font-semibold">
              Total (J$)
              <input
                inputMode="decimal"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                placeholder="1,000.00"
                className="mt-1 h-[52px] w-full rounded-xl border border-slate-300 bg-white px-3 text-lg font-semibold tabular-nums dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
            <label className="block text-sm font-semibold">
              Litres
              <input
                inputMode="decimal"
                value={liters}
                onChange={(e) => setLiters(e.target.value)}
                placeholder="4.59"
                className="mt-1 h-[52px] w-full rounded-xl border border-slate-300 bg-white px-3 text-lg font-semibold tabular-nums dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={() => void addNumbers()}
            disabled={busy || !t || !l}
            className="mt-5 flex h-[52px] w-full items-center justify-center rounded-xl bg-emerald-600 text-base font-bold text-white disabled:opacity-50"
          >
            {busy ? 'Sending…' : 'Add numbers'}
          </button>
          <button
            type="button"
            onClick={() => void retake()}
            disabled={busy}
            className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white text-base font-semibold text-slate-800 disabled:opacity-50 dark:border-slate-700 dark:bg-transparent dark:text-slate-100"
          >
            <Camera className="h-4 w-4" /> Retake pump photo
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
