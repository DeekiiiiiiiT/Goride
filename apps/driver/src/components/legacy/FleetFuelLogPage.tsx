import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@roam/ui';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { useCurrentDriver } from '../../hooks/useCurrentDriver';
import { FuelLogForm } from './FuelLogForm';
import { FuelLog } from '../../types/data';
import { FuelEntry } from '../../types/fuel';
import { fuelService } from '../../services/fuelService';
import { settlementService } from '../../services/settlementService';
import { showCatalogGateToastIfApplicable } from '../../utils/catalogGateErrors';

interface FleetFuelLogPageProps {
  onBack: () => void;
}

export function FleetFuelLogPage({ onBack }: FleetFuelLogPageProps) {
  const { user } = useAuth();
  const { driverRecord } = useCurrentDriver();
  const [open, setOpen] = useState(true);

  const handleFuelSubmit = async (data: Partial<FuelLog> & { paymentMethod?: string; geofenceMetadata?: unknown; deviationReason?: string }) => {
    try {
      const method = data.paymentMethod || 'reimbursement';
      const entryMode: 'Anchor' | 'Floating' = data.odometer ? 'Anchor' : 'Floating';
      let paymentSource: FuelEntry['paymentSource'] = 'Personal';
      if (method === 'reimbursement') paymentSource = 'RideShare_Cash';
      else if (method === 'card') paymentSource = 'Gas_Card';
      else if (method === 'personal') paymentSource = 'Personal';

      const fuelEntry: Partial<FuelEntry> = {
        id: crypto.randomUUID(),
        date: data.date || new Date().toISOString(),
        driverId: user?.id,
        vehicleId: driverRecord?.assignedVehicleId || driverRecord?.vehicleId || driverRecord?.vehicle || data.vehicleId,
        amount: data.totalCost || 0,
        liters: data.liters || 0,
        pricePerLiter: data.totalCost && data.liters ? data.totalCost / data.liters : 0,
        odometer: data.odometer || null,
        location: data.notes || 'Fuel Refill',
        type: method === 'card' ? 'Card_Transaction' : 'Manual_Entry',
        entryMode,
        paymentSource,
        source: 'Driver Portal',
        geofenceMetadata: data.geofenceMetadata as FuelEntry['geofenceMetadata'],
        deviationReason: data.deviationReason,
      } as FuelEntry;

      const savedEntry = await fuelService.saveFuelEntry(fuelEntry as FuelEntry);
      const scenarios = await fuelService.getFuelScenarios();
      await settlementService.processFuelSettlement(savedEntry, scenarios);

      toast.success(
        paymentSource === 'RideShare_Cash' ? 'Fuel logged and cash liability reduced!' : 'Fuel log saved successfully!',
        { description: `Logged ${data.liters}L at ${data.odometer || '—'} km.` },
      );
      setOpen(false);
      onBack();
    } catch (e: unknown) {
      console.error('Failed to save fuel log', e);
      showCatalogGateToastIfApplicable(e);
      throw e;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onBack} className="gap-1 px-2">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </div>
      <FuelLogForm open={open} onOpenChange={setOpen} onSubmit={handleFuelSubmit} vehicleId={driverRecord?.assignedVehicleId || driverRecord?.vehicleId || driverRecord?.vehicle} />
    </div>
  );
}
