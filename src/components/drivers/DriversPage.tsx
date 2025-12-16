import React, { useEffect, useState } from 'react';
import { DriverPerformanceView } from '../dashboard/DriverPerformanceView';
import { api } from '../../services/api';
import { Trip } from '../../types/data';
import { Loader2 } from 'lucide-react';

export function DriversPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const tripsData = await api.getTrips();
        setTrips(tripsData);
      } catch (err) {
        console.error("Failed to fetch trips for drivers page", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Drivers</h2>
          <p className="text-slate-500 dark:text-slate-400">
            Performance metrics and fleet driver management.
          </p>
        </div>
      </div>
      <DriverPerformanceView trips={trips} />
    </div>
  );
}
