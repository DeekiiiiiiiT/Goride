import type { GctSupplyClass } from './types.ts';

export type SupplyClassMeta = {
  code: GctSupplyClass;
  label: string;
  taxable: boolean;
  creditAllowed: boolean;
  statuteRef: string;
};

export const SUPPLY_CLASS_META: Record<GctSupplyClass, SupplyClassMeta> = {
  standard: {
    code: 'standard',
    label: 'Standard-rated',
    taxable: true,
    creditAllowed: true,
    statuteRef: 's.4(1)(a)',
  },
  tourism: {
    code: 'tourism',
    label: 'Tourism',
    taxable: true,
    creditAllowed: true,
    statuteRef: '1st Sch Pt V',
  },
  telephone: {
    code: 'telephone',
    label: 'Telephone',
    taxable: true,
    creditAllowed: true,
    statuteRef: 'telephone schedule',
  },
  zero_rated: {
    code: 'zero_rated',
    label: 'Zero-rated',
    taxable: true,
    creditAllowed: true,
    statuteRef: '1st Sch Pt II',
  },
  exempt: {
    code: 'exempt',
    label: 'Exempt',
    taxable: false,
    creditAllowed: false,
    statuteRef: '3rd Sch Pt II',
  },
  out_of_scope: {
    code: 'out_of_scope',
    label: 'Out of scope',
    taxable: false,
    creditAllowed: false,
    statuteRef: 'n/a',
  },
};

/** Passenger transport within Jamaica — 3rd Sch. Pt II ¶2. */
export function isPassengerTransportExempt(): GctSupplyClass {
  return 'exempt';
}

export function isTaxableClass(code: GctSupplyClass): boolean {
  return SUPPLY_CLASS_META[code].taxable;
}
