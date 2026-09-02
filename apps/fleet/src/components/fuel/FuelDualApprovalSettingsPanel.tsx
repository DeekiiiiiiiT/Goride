/**
 * Org preference: dual-approval spend threshold + auto-close / UI modes (this organization).
 */
import React, { useEffect, useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { api } from '../../services/api';
import { toast } from 'sonner';
import {
  FUEL_SECOND_APPROVER_THRESHOLD,
  resolveFuelAutoCloseDualApprovalMode,
  resolveFuelDualApprovalUiMode,
  resolveFuelSecondApproverThreshold,
  type FuelAutoCloseDualApprovalMode,
  type FuelDualApprovalUiMode,
} from '../../utils/fuelDualApproval';
import { formatFuelMoney } from '../../utils/formatFuelMoney';

export function FuelDualApprovalSettingsPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [threshold, setThreshold] = useState(String(FUEL_SECOND_APPROVER_THRESHOLD));
  const [autoCloseMode, setAutoCloseMode] = useState<FuelAutoCloseDualApprovalMode>('skip');
  const [uiMode, setUiMode] = useState<FuelDualApprovalUiMode>('human');
  const [prefs, setPrefs] = useState<Record<string, unknown>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const p = (await api.getPreferences().catch(() => ({}))) as Record<string, unknown>;
        if (cancelled) return;
        setPrefs(p || {});
        setThreshold(
          String(resolveFuelSecondApproverThreshold(p?.fuelSecondApproverThreshold as number)),
        );
        setAutoCloseMode(
          resolveFuelAutoCloseDualApprovalMode(
            p?.fuelAutoCloseDualApprovalMode as string | null,
          ),
        );
        setUiMode(
          resolveFuelDualApprovalUiMode(p?.fuelDualApprovalUiMode as string | null),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const n = Number(threshold);
      if (!Number.isFinite(n) || n < 0) {
        throw new Error('Enter a non-negative amount (0 turns dual approval off)');
      }
      const next = {
        ...prefs,
        fuelSecondApproverThreshold: n,
        fuelAutoCloseDualApprovalMode: autoCloseMode,
        fuelDualApprovalUiMode: uiMode,
      };
      await api.savePreferences(next);
      setPrefs(next);
      toast.success(
        n === 0
          ? 'Dual approval turned off for this organization'
          : `Second approval settings saved for this organization (threshold ${formatFuelMoney(n)})`,
      );
    } catch (e: any) {
      toast.error(e?.message || 'Could not save dual-approval settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Loading dual-approval settings…</p>;
  }

  const thrOn = Number(threshold) > 0;

  return (
    <div className="rounded-lg border border-slate-200 p-4 space-y-4">
      <div>
        <h4 className="text-sm font-semibold text-slate-900">Dual approval (this organization)</h4>
        <p className="text-xs text-slate-500 mt-0.5">
          Weeks with total spend above this amount need a second identity before Finalize can lock.
          Set to 0 to disable. Settings apply only to your organization.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <label className="text-xs text-slate-600" htmlFor="fuel-second-threshold">
            Threshold (JMD)
          </label>
          <Input
            id="fuel-second-threshold"
            className="min-h-11 w-40"
            inputMode="decimal"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
          />
        </div>
      </div>

      {thrOn && (
        <>
          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-slate-700">Scheduled auto-close</legend>
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="radio"
                className="mt-1"
                checked={autoCloseMode === 'skip'}
                onChange={() => setAutoCloseMode('skip')}
              />
              <span>
                <strong>Skip</strong> high-spend weeks (default — needs a human second approver in
                the app first).
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="radio"
                className="mt-1"
                checked={autoCloseMode === 'service_approve'}
                onChange={() => setAutoCloseMode('service_approve')}
              />
              <span>
                <strong>System approve</strong> then auto-lock (system approver ≠ system finalizer).
              </span>
            </label>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-slate-700">In-app Finalize</legend>
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="radio"
                className="mt-1"
                checked={uiMode === 'human'}
                onChange={() => setUiMode('human')}
              />
              <span>
                <strong>Human</strong> second admin must record approval (default).
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="radio"
                className="mt-1"
                checked={uiMode === 'service_only'}
                onChange={() => setUiMode('service_only')}
              />
              <span>
                <strong>System-only</strong> second approval on Finalize (you remain the finalizer;
                SoD is system approver ≠ you).
              </span>
            </label>
          </fieldset>
        </>
      )}

      <Button type="button" className="min-h-11" disabled={saving} onClick={() => void save()}>
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </div>
  );
}
