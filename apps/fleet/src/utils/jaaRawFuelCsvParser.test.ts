import { describe, expect, it } from 'vitest';
import { classifyJaaRawRow, isJaaRawFuelCsv, processJaaRawFuelData } from './jaaRawFuelCsvParser';
import type { FuelCard } from '../types/fuel';

const sampleHeaders = [
  'COMPANY_CODE',
  'CARD_CODE',
  'LICENSE_NUMBER',
  'AMOUNT',
  'TRANS_DATE',
  'FUEL_TYPE',
  'DISPLAY_FUEL_AMOUNT',
  'DISPLAY_FUEL_QUANTITY',
  'VENDOR_NAME',
  'DRIVER_REFERENCE_NUMBER',
  'DRIVER_NAME',
  'RESPONSE',
  'RECEIPT_NUMBER',
  'MILEAGE',
];

const card: FuelCard = {
  id: 'card-1',
  cardNumber: '00002920RN2783',
  provider: 'JAA',
  status: 'Active',
  assignedVehicleId: 'veh-1',
};

describe('jaaRawFuelCsvParser', () => {
  it('detects JAA raw headers', () => {
    expect(isJaaRawFuelCsv(sampleHeaders)).toBe(true);
  });

  it('classifies approved / fee / declined rows', () => {
    expect(
      classifyJaaRawRow({
        RESPONSE: 'APPR-NEAR COMPANY CREDIT LIMIT',
        DISPLAY_FUEL_QUANTITY: '19.57',
        DISPLAY_FUEL_AMOUNT: '4500',
        VENDOR_NAME: 'SUPER LUBE',
        FUEL_TYPE: 'E10-87',
      }),
    ).toBe('approved_fuel');

    expect(
      classifyJaaRawRow({
        RESPONSE: 'APPROVAL',
        DISPLAY_FUEL_QUANTITY: '0',
        DISPLAY_FUEL_AMOUNT: '0',
        VENDOR_NAME: 'CARD SERVICE FEE',
        FUEL_TYPE: '(None)',
      }),
    ).toBe('fee');

    expect(
      classifyJaaRawRow({
        RESPONSE: 'INVALID RENTAL',
        DISPLAY_FUEL_QUANTITY: '0',
        AMOUNT: '4500',
        VENDOR_NAME: 'SUPER LUBE',
        FUEL_TYPE: 'E10-87',
      }),
    ).toBe('declined');
  });

  it('maps CARD_CODE to inventory, never trusts JAA identity for driver/odo', () => {
    const { entries } = processJaaRawFuelData(
      [
        {
          CARD_CODE: '00002920RN2783',
          AMOUNT: '4500.0000',
          TRANS_DATE: '08/05/2026 20:24:00',
          FUEL_TYPE: 'E10-87',
          DISPLAY_FUEL_AMOUNT: '4500.0000',
          DISPLAY_FUEL_QUANTITY: '19.57',
          VENDOR_NAME: 'SUPER LUBE SERVICE CENTRE',
          DRIVER_NAME: 'KENNY RATTRAY',
          LICENSE_NUMBER: '5179KZ',
          DRIVER_REFERENCE_NUMBER: '00000259',
          RESPONSE: 'APPR-NEAR COMPANY CREDIT LIMIT',
          RECEIPT_NUMBER: 'ZZ0028966858',
          MILEAGE: '175238',
        },
      ],
      [card],
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].cardId).toBe('card-1');
    expect(entries[0].vehicleId).toBe('veh-1');
    expect(entries[0].driverId).toBeUndefined();
    expect(entries[0].odometer).toBeNull();
    expect(entries[0].amount).toBe(4500);
    expect(entries[0].liters).toBeCloseTo(19.57);
    expect((entries[0].metadata as any).jaaDriverName).toBe('KENNY RATTRAY');
    expect((entries[0].metadata as any).jaaMileage).toBe(175238);
    expect((entries[0].metadata as any).jaaRowKind).toBe('approved_fuel');
  });

  it('dedupes by RECEIPT_NUMBER', () => {
    const row = {
      CARD_CODE: '00002920RN2783',
      AMOUNT: '4500',
      TRANS_DATE: '08/05/2026 20:24:00',
      DISPLAY_FUEL_QUANTITY: '19.57',
      DISPLAY_FUEL_AMOUNT: '4500',
      RESPONSE: 'APPR',
      RECEIPT_NUMBER: 'ZZ1',
      VENDOR_NAME: 'STATION',
      FUEL_TYPE: 'E10',
    };
    const first = processJaaRawFuelData([row], [card]);
    const second = processJaaRawFuelData([row], [card], new Set(['ZZ1']));
    expect(first.entries).toHaveLength(1);
    expect(second.entries).toHaveLength(0);
    expect(second.skippedDuplicates).toBe(1);
  });
});
