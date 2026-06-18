import React from 'react';
import { VehicleTypesManager } from './VehicleTypesManager';
import type { ServiceCategory } from '@/types/vehicleTypes';

type Props = {
  category: ServiceCategory;
};

export function ServiceCategoryPage({ category }: Props) {
  return <VehicleTypesManager kind="service" serviceCategory={category} />;
}
