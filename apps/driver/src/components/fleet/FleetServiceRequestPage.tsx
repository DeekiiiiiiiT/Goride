import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@roam/ui';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { useCurrentDriver } from '../../hooks/useCurrentDriver';
import { ServiceRequestForm } from './ServiceRequestForm';
import { ServiceRequest, FinancialTransaction } from '../../types/data';
import { api } from '../../services/api';

interface FleetServiceRequestPageProps {
  onBack: () => void;
}

/** Standalone host for the fleet service/maintenance request form (was embedded in the legacy dashboard). */
export function FleetServiceRequestPage({ onBack }: FleetServiceRequestPageProps) {
  const { user } = useAuth();
  const { driverRecord } = useCurrentDriver();
  const [open, setOpen] = useState(true);

  const handleServiceSubmit = async (data: Partial<ServiceRequest>) => {
    try {
      const newTx: Partial<FinancialTransaction> = {
        id: crypto.randomUUID(),
        driverId: user?.id,
        driverName: driverRecord?.name || user?.email,
        date: data.date || new Date().toISOString(),
        time: undefined,
        type: 'Expense',
        category: 'Maintenance',
        amount: 0, // Placeholder — fleet manager prices it on review
        description: `${data.type}: ${data.description}`,
        status: 'Pending',
        paymentMethod: 'Cash',
        notes: `Priority: ${data.priority}`,
        odometer: data.odometer,
        source: 'Service Request',
        isVerified: true,
      } as Partial<FinancialTransaction>;

      await api.saveTransaction(newTx);
      toast.success('Service request submitted!', {
        description: 'A fleet manager will review your request shortly.',
      });
      setOpen(false);
      onBack();
    } catch (e) {
      console.error(e);
      toast.error('Failed to submit request');
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
