/**
 * Haulage moves goods — generally standard-rated (not passenger exempt).
 * Passenger transport exemption applies to Rides only (see rides/fare/gctExempt.ts).
 * When a haul job includes a passenger leg, classify that leg separately.
 */
import type { GctSupplyClass } from '../../_shared/gctCore.ts';
import { isPassengerTransportExempt } from '../../_shared/gctCore.ts';

export function classifyHaulageGoodsSupply(): {
  supplyClass: GctSupplyClass;
  ratePercent: null;
  note: string;
} {
  return {
    supplyClass: 'standard',
    ratePercent: null, // resolve from accounting.gct_rates at tax point
    note: 'Goods haulage — standard-rated; use GCT engine rate',
  };
}

export function classifyHaulPassengerLegIfAny(): {
  supplyClass: GctSupplyClass;
  ratePercent: number;
} {
  return {
    supplyClass: isPassengerTransportExempt(),
    ratePercent: 0,
  };
}
