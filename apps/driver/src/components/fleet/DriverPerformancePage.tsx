import React, { useEffect, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@roam/ui';
import { useAuth } from '../../contexts/AuthContext';
import { useCurrentDriver } from '../../hooks/useCurrentDriver';
import { api } from '../../services/api';
import { tierService } from '../../services/tierService';
import { TierCalculations } from '../../utils/tierCalculations';
import { Trip, TierConfig, MonthlyPerformance } from '../../types/data';
import { DriverHistory } from './DriverHistory';

interface DriverPerformancePageProps {
  onBack: () => void;
}

export function DriverPerformancePage({ onBack }: DriverPerformancePageProps) {
  const { user } = useAuth();
  const { driverRecord, loading: driverLoading } = useCurrentDriver();
  const [loading, setLoading] = useState(true);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tiers, setTiers] = useState<TierConfig[]>([]);
  const [history, setHistory] = useState<MonthlyPerformance[]>([]);

  useEffect(() => {
    if (!user || driverLoading) return;

    const run = async () => {
      setLoading(true);
      try {
        const limit = 1000;
        const p1 = api.getTripsFiltered({ driverId: user.id, limit }).then((r) => r.data).catch(() => []);
        const promises: Promise<Trip[]>[] = [p1];
        if (driverRecord?.driverId && driverRecord.driverId !== user.id) {
          promises.push(api.getTripsFiltered({ driverId: driverRecord.driverId, limit }).then((r) => r.data).catch(() => []));
        }
        const results = await Promise.all(promises);
        const combined = Array.from(new Map(results.flat().map((t) => [t.id, t])).values());
        setTrips(combined);

        const tiersData = await tierService.getTiers();
        if (tiersData) setTiers(tiersData);
      } catch (e) {
        console.error('[DriverPerformancePage]', e);
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [user?.id, driverRecord?.driverId, driverLoading]);

  useEffect(() => {
    if (trips.length > 0 && tiers.length > 0) {
      setHistory(TierCalculations.getMonthlyHistory(trips, tiers));
    } else {
      setHistory([]);
    }
  }, [trips, tiers]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onBack} className="gap-1 px-2">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </div>
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        </div>
      ) : (
        <DriverHistory history={history} loading={false} />
      )}
    </div>
  );
}
