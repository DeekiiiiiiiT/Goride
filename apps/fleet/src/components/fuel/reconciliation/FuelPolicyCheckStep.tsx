/**
 * Policy-check step — extracted from FuelPeriodWizard.
 */
import React from 'react';
import { Card, CardContent } from '../../ui/card';
import { FuelCoverageMatrix } from '../FuelCoverageMatrix';
import { CompactVehicleList } from './CompactVehicleList';
import type { Vehicle } from '../../../types/vehicle';
import type { FuelScenario } from '../../../types/fuel';

export type FuelPolicyRow = {
  vehicle: Vehicle;
  scenario?: FuelScenario | null;
  fuelRule: unknown;
  effectiveFrom?: string | null;
};

export type FuelPolicyCheckStepProps = {
  policyRows: FuelPolicyRow[];
};

export function FuelPolicyCheckStep({ policyRows }: FuelPolicyCheckStepProps) {
  if (policyRows.length === 0) {
    return (
      <div className="space-y-2">
        <CompactVehicleList rows={[]} />
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {policyRows.map(({ vehicle, scenario, fuelRule, effectiveFrom }) => (
        <Card key={vehicle.id} className="rounded border border-slate-200">
          <CardContent className="space-y-2 p-4">
            <div className="font-semibold text-slate-900">
              {vehicle.licensePlate || vehicle.id}
            </div>
            <div className="text-sm text-slate-600">
              {scenario?.name || 'No policy'}
              {effectiveFrom && effectiveFrom > '2000-01-03' && (
                <span className="ml-2 text-xs text-slate-400">· from {effectiveFrom}</span>
              )}
            </div>
            <FuelCoverageMatrix rule={fuelRule as any} compact />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
