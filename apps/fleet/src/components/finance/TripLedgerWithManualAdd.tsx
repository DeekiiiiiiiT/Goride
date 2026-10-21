import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { TripLedgerPage } from '../database/TripLedgerPage';
import { ManualTripForm } from '../trips/ManualTripForm';
import { api } from '../../services/api';
import { createManualTrip, type ManualTripInput } from '../../utils/tripFactory';

type ColumnConfig = {
  key: string;
  label: string;
  visible: boolean;
  custom?: boolean;
};

/** Trip Ledger plus the same Log Manual Trip form used on Trip Logs. */
export function TripLedgerWithManualAdd({ columnConfig }: { columnConfig?: ColumnConfig[] }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers', 'options'],
    queryFn: async () => {
      const rows = await api.getDrivers();
      return rows.map((d: { id: string; name?: string; driverName?: string }) => ({
        id: d.id,
        name: d.name || d.driverName || 'Unknown',
      }));
    },
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ['vehicles', 'options'],
    queryFn: async () => {
      const rows = await api.getVehicles();
      return rows.map((v: { id: string; plateNumber?: string; licensePlate?: string }) => ({
        id: v.id,
        plate: v.plateNumber || v.licensePlate || v.id,
      }));
    },
  });

  const handleSubmit = async (data: ManualTripInput, driverId?: string) => {
    if (!driverId) {
      toast.error('Driver must be selected');
      throw new Error('Driver must be selected');
    }
    const driverName = drivers.find((d) => d.id === driverId)?.name || 'Unknown';
    const trip = createManualTrip(data, driverId, driverName);
    await api.saveTrips([trip]);
    toast.success('Manual trip logged');
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['ledger', 'trips'] }),
      queryClient.invalidateQueries({ queryKey: ['tripLedgerStats'] }),
      queryClient.invalidateQueries({ queryKey: ['trips'] }),
      queryClient.invalidateQueries({ queryKey: ['tripStats'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    ]);
  };

  return (
    <>
      <TripLedgerPage
        columnConfig={columnConfig}
        headerActions={
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
            title="Fleet books only — not Roam driver wallet"
          >
            <Plus className="h-4 w-4" />
            Log Manual Trip
          </button>
        }
      />
      <ManualTripForm
        open={open}
        onOpenChange={setOpen}
        onSubmit={handleSubmit}
        isAdmin
        drivers={drivers}
        vehicles={vehicles}
      />
    </>
  );
}
