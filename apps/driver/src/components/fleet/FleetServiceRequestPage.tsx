import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@roam/ui';
import { toast } from 'sonner';
import { useCurrentDriver } from '../../hooks/useCurrentDriver';
import { ServiceRequestForm } from './ServiceRequestForm';
import { ServiceRequest } from '../../types/data';
import { api } from '../../services/api';

interface FleetServiceRequestPageProps {
  onBack: () => void;
}

/** Standalone host for the fleet service/maintenance request form (was embedded in the legacy dashboard). */
export function FleetServiceRequestPage({ onBack }: FleetServiceRequestPageProps) {
  const { driverRecord } = useCurrentDriver();
  const [open, setOpen] = useState(true);

  const handleServiceSubmit = async (data: Partial<ServiceRequest>) => {
    try {
      await api.createMaintenanceRequest({
        date: data.date || new Date().toISOString().slice(0, 10),
        type: data.type,
        priority: data.priority,
        description: data.description,
        odometer: data.odometer,
        vehicleId: driverRecord?.assignedVehicleId || driverRecord?.vehicleId || driverRecord?.vehicle,
      });
      toast.success('Service request submitted!', {
        description: 'Your fleet manager will see this in Maintenance.',
      });
      setOpen(false);
      onBack();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Failed to submit request');
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
      <ServiceRequestForm
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) onBack();
        }}
        onSubmit={handleServiceSubmit}
      />
    </div>
  );
}
