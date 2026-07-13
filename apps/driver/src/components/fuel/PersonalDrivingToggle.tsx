import React, { useCallback, useEffect, useState } from 'react';
import { Car, User, Moon, Square } from 'lucide-react';
import { FUEL_PERSONAL_SESSIONS_ENABLED } from '../../lib/fuelSessionFlags';
import { fuelService } from '../../services/fuelService';
import type { FuelDrivingSession } from '../../types/fuelBrain';

interface PersonalDrivingToggleProps {
  driverId: string;
  vehicleId: string | null | undefined;
  /** Optional odometer reading when starting/stopping */
  currentOdo?: number | null;
}

/**
 * Driver Personal / Off-duty toggle. Only renders when sessions flag is on.
 * Sessions sync even when Fleet recon still uses legacy residual math.
 */
export function PersonalDrivingToggle({
  driverId,
  vehicleId,
  currentOdo,
}: PersonalDrivingToggleProps) {
  const [active, setActive] = useState<FuelDrivingSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [declareOpen, setDeclareOpen] = useState(false);
  const [vehicleOverride, setVehicleOverride] = useState(vehicleId || '');

  const effectiveVehicleId = (vehicleId || vehicleOverride.trim() || null) as string | null;

  const refresh = useCallback(async () => {
    if (!FUEL_PERSONAL_SESSIONS_ENABLED || !driverId) return;
    try {
      const session = await fuelService.getActiveDrivingSession(
        driverId,
        effectiveVehicleId || undefined,
      );
      setActive(session);
    } catch (e) {
      console.warn('[PersonalDrivingToggle] refresh failed', e);
    }
  }, [driverId, effectiveVehicleId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!FUEL_PERSONAL_SESSIONS_ENABLED) return null;

  if (!effectiveVehicleId) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Driving purpose</h3>
        <p className="text-xs text-slate-500">Enter your assigned vehicle ID to start Personal / Off-duty.</p>
        <input
          className="w-full text-sm rounded-md border border-slate-200 dark:border-slate-600 px-3 py-2 bg-transparent"
          placeholder="Vehicle ID"
          value={vehicleOverride}
          onChange={(e) => setVehicleOverride(e.target.value)}
        />
      </div>
    );
  }

  const startMode = async (mode: 'personal' | 'off_duty') => {
    setBusy(true);
    setError(null);
    try {
      const session = await fuelService.startDrivingSession({
        driverId,
        vehicleId: effectiveVehicleId,
        mode,
        source: 'driver_toggle',
        startOdo: currentOdo ?? null,
      });
      setActive(session);
      setDeclareOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start session');
    } finally {
      setBusy(false);
    }
  };

  const endActive = async () => {
    if (!active) return;
    setBusy(true);
    setError(null);
    try {
      await fuelService.endDrivingSession(active.id, { endOdo: currentOdo ?? null });
      setActive(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not end session');
    } finally {
      setBusy(false);
    }
  };

  const declarePast = async (mode: 'personal' | 'off_duty') => {
    setBusy(true);
    setError(null);
    try {
      const end = new Date();
      const start = new Date(end.getTime() - 2 * 60 * 60 * 1000);
      await fuelService.startDrivingSession({
        driverId,
        vehicleId: effectiveVehicleId,
        mode,
        source: 'driver_declare',
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        startOdo: currentOdo ?? null,
        endOdo: currentOdo ?? null,
      });
      setDeclareOpen(false);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not declare');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Car className="w-4 h-4 text-slate-500" />
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Driving purpose</h3>
      </div>
      <p className="text-xs text-slate-500">
        Mark Personal or Off-duty while using a company vehicle so fuel recon does not guess.
      </p>

      {active && (active.mode === 'personal' || active.mode === 'off_duty') ? (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 px-3 py-2">
          <span className="text-sm font-medium text-amber-900 dark:text-amber-100 capitalize">
            {active.mode === 'off_duty' ? 'Off-duty' : 'Personal'} active
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void endActive()}
            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-md bg-slate-900 text-white disabled:opacity-50"
          >
            <Square className="w-3 h-3" />
            End
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void startMode('personal')}
            className="inline-flex items-center justify-center gap-1.5 text-sm font-medium px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            <User className="w-4 h-4" />
            Personal
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void startMode('off_duty')}
            className="inline-flex items-center justify-center gap-1.5 text-sm font-medium px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            <Moon className="w-4 h-4" />
            Off-duty
          </button>
        </div>
      )}

      <button
        type="button"
        className="text-xs text-slate-500 underline"
        onClick={() => setDeclareOpen((v) => !v)}
      >
        Declare recent personal / off-duty gap
      </button>

      {declareOpen && (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void declarePast('personal')}
            className="flex-1 text-xs py-2 rounded-md bg-slate-100 dark:bg-slate-800"
          >
            Was personal (~2h)
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void declarePast('off_duty')}
            className="flex-1 text-xs py-2 rounded-md bg-slate-100 dark:bg-slate-800"
          >
            Was off-duty (~2h)
          </button>
        </div>
      )}

      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}
