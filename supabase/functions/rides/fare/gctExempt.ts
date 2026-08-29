/**
 * Passenger transport within Jamaica is GCT-exempt (3rd Sch. Pt II ¶2).
 * Rides fare quotes must not charge GCT — return exempt classification.
 */
import {
  isPassengerTransportExempt,
  type GctSupplyClass,
} from '../../_shared/gctCore.ts';

export type RideGctClassification = {
  supplyClass: GctSupplyClass;
  ratePercent: number;
  taxable: false;
  reason: string;
};

export function classifyRideFareGct(): RideGctClassification {
  return {
    supplyClass: isPassengerTransportExempt(),
    ratePercent: 0,
    taxable: false,
    reason: '3rd Sch. Pt II ¶2 — transportation of passengers within Jamaica',
  };
}
