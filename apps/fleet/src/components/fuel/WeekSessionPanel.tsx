/**
 * Fleet admin: week session list + override for Personal / Off-duty evidence.
 * Visible when VITE_FUEL_PERSONAL_SESSIONS_ENABLED=1.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { FUEL_PERSONAL_SESSIONS_ENABLED } from '../../utils/fuelBrainFlags';
import { fuelService } from '../../services/fuelService';
import type { FuelDrivingSession } from '@roam/types/fuelBrain';

interface WeekSessionPanelProps {
  driverId: string;
  vehicleId: string;
  weekStart: string;
  weekEnd: string;
}

export function WeekSessionPanel({
  driverId,
  vehicleId,
  weekStart,
  weekEnd,
}: WeekSessionPanelProps) {
  const [sessions, setSessions] = useState<FuelDrivingSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'personal' | 'off_duty'>('personal');
  const [startOdo, setStartOdo] = useState('');
  const [endOdo, setEndOdo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!FUEL_PERSONAL_SESSIONS_ENABLED || !driverId) return;
    setLoading(true);
    try {
      const rows = await fuelService.listDrivingSessions({
        driverId,
        vehicleId,
        weekStart,
        weekEnd,
      });
      setSessions(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, [driverId, vehicleId, weekStart, weekEnd]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!FUEL_PERSONAL_SESSIONS_ENABLED) return null;

  const addOverride = async () => {
    setError(null);
    const sOdo = startOdo ? Number(startOdo) : null;
    const eOdo = endOdo ? Number(endOdo) : null;
    try {
      await fuelService.startDrivingSession({
        driverId,
        vehicleId,
        mode,
        source: 'admin_override',
        startAt: `${weekStart}T08:00:00`,
        endAt: `${weekEnd}T20:00:00`,
        startOdo: sOdo,
        endOdo: eOdo,
        notes: 'Admin override',
      });
      setStartOdo('');
      setEndOdo('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Override failed');
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-3 text-sm">
      <div className="font-medium text-slate-800">Personal / Off-duty sessions</div>
      {loading ? (
        <p className="text-xs text-slate-500">Loading…</p>
      ) : sessions.length === 0 ? (
        <p className="text-xs text-slate-500">No sessions this week.</p>
      ) : (
        <ul className="space-y-1 max-h-40 overflow-y-auto">
          {sessions.map((s) => (
            <li key={s.id} className="text-xs flex justify-between gap-2 border-b border-slate-100 py-1">
              <span className="capitalize">{s.mode.replace('_', ' ')}</span>
              <span className="text-slate-500">{s.source}</span>
              <span>
                {s.startOdo != null && s.endOdo != null
                  ? `${s.startOdo}→${s.endOdo} km`
                  : new Date(s.startAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-2 gap-2 pt-2 border-t">
        <div>
          <Label className="text-xs">Admin override mode</Label>
          <Select value={mode} onValueChange={(v) => setMode(v as 'personal' | 'off_duty')}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="personal">Personal</SelectItem>
              <SelectItem value="off_duty">Off-duty</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-1">
          <div>
            <Label className="text-xs">Start odo</Label>
            <Input className="h-8" value={startOdo} onChange={(e) => setStartOdo(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">End odo</Label>
            <Input className="h-8" value={endOdo} onChange={(e) => setEndOdo(e.target.value)} />
          </div>
        </div>
      </div>
      <Button type="button" size="sm" variant="outline" onClick={() => void addOverride()}>
        Add admin override session
      </Button>
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}
