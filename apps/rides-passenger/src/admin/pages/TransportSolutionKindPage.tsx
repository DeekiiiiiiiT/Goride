import React from 'react';
import { VehicleTypesManager } from './VehicleTypesManager';
import type { TransportSolutionKind } from '@/types/vehicleTypes';

type Props = {
  kind: TransportSolutionKind;
};

export function TransportSolutionKindPage({ kind }: Props) {
  return <VehicleTypesManager kind={kind} />;
}
