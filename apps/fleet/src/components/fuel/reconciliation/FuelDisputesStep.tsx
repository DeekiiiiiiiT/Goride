/**
 * Disputes / adjustments step — extracted from FuelPeriodWizard.
 */
import React from 'react';
import { Button } from '../../ui/button';
import { Card, CardContent } from '../../ui/card';
import { CompactVehicleList } from './CompactVehicleList';

export type FuelDisputeRow = {
  id: string;
  reason?: string | null;
  vehicleId?: string | null;
};

export type FuelDisputesStepProps = {
  openDisputes: FuelDisputeRow[];
  periodLocked: boolean;
  onResolveDispute: (d: FuelDisputeRow) => void;
  onAddAdjustment: () => void;
};

export function FuelDisputesStep({
  openDisputes,
  periodLocked,
  onResolveDispute,
  onAddAdjustment,
}: FuelDisputesStepProps) {
  return (
    <div className="space-y-3">
      {openDisputes.length === 0 ? (
        <CompactVehicleList rows={[]} />
      ) : (
        <ul className="space-y-2">
          {openDisputes.map((d) => (
            <Card key={d.id} className="rounded border border-slate-200">
              <CardContent className="flex items-center justify-between gap-3 p-3">
                <div>
                  <div className="font-medium text-slate-900">{String(d.reason || 'Dispute')}</div>
                  <div className="text-xs text-slate-500">Vehicle {d.vehicleId}</div>
                </div>
                {!periodLocked && (
                  <Button
                    type="button"
                    size="sm"
                    className="min-h-11 bg-[#3525cd] text-white hover:bg-[#2a1ea4]"
                    onClick={() => onResolveDispute(d)}
                  >
                    Resolve
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </ul>
      )}
      {!periodLocked && openDisputes.length === 0 && (
        <Button type="button" variant="outline" className="min-h-11" onClick={onAddAdjustment}>
          Add Adjustment
        </Button>
      )}
    </div>
  );
}
