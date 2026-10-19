/**
 * Dominion "Move pin" — applies pin-calibration suggestions explicitly (never auto).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../services/stationOpsApi';
import { Button } from '@roam/ui';
import { Badge } from '@roam/ui';
import { Loader2, MapPin, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

type Suggestion = {
  stationId: string;
  stationName: string;
  currentLat: number;
  currentLng: number;
  suggestedLat: number;
  suggestedLng: number;
  medianDistanceM: number;
  sampleSize: number;
  geofenceRadiusM: number;
  p90DistanceM: number;
};

export function PinCalibrationPanel() {
  const [loading, setLoading] = useState(true);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.getPinCalibrationSuggestions();
      setSuggestions(Array.isArray(res.suggestions) ? (res.suggestions as Suggestion[]) : []);
    } catch (e) {
      console.error('[PinCalibration]', e);
      toast.error('Could not load pin calibration suggestions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const applyMove = async (s: Suggestion) => {
    try {
      setApplyingId(s.stationId);
      await api.syncMasterPin(s.stationId, {
        lat: s.suggestedLat,
        lng: s.suggestedLng,
        transactionId: `pin-calibration:${s.stationId}:${Date.now()}`,
      });
      toast.success(`Moved pin for ${s.stationName}`);
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Move pin failed');
    } finally {
      setApplyingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 gap-2 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading pin suggestions…
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Move pin</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-xl">
            Suggestions from GPS-verified fills (median offset &gt; 40 m, ≥10 samples). Applying moves
            the master pin and keeps the old pin as a GPS alias. Never automatic.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {suggestions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">
          No pin moves suggested right now.
        </div>
      ) : (
        <div className="space-y-3">
          {suggestions.map((s) => (
            <div
              key={s.stationId}
              className="rounded-lg border border-slate-200 bg-white p-4 flex flex-col sm:flex-row sm:items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <MapPin className="h-4 w-4 text-indigo-600 shrink-0" />
                  <span className="font-semibold text-sm text-slate-900">{s.stationName}</span>
                  <Badge variant="outline" className="text-[10px]">
                    median {Math.round(s.medianDistanceM)} m
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    n={s.sampleSize}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    p90 {Math.round(s.p90DistanceM)} m / R {s.geofenceRadiusM} m
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 mt-1 font-mono">
                  {s.currentLat.toFixed(6)}, {s.currentLng.toFixed(6)} → {s.suggestedLat.toFixed(6)},{' '}
                  {s.suggestedLng.toFixed(6)}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-700 shrink-0"
                disabled={applyingId === s.stationId}
                onClick={() => void applyMove(s)}
              >
                {applyingId === s.stationId ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                Move pin
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
