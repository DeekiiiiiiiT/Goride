import { describe, it, expect } from 'vitest';
import { enrichTollLogEntries, resolvePaymentMethodDisplay } from './enrichTollLogEntries.ts';

describe('resolvePaymentMethodDisplay', () => {
  it('maps tag balance to E-Tag', () => {
    expect(resolvePaymentMethodDisplay({ paymentMethod: 'Tag Balance' })).toBe('E-Tag');
  });
  it('maps cash', () => {
    expect(resolvePaymentMethodDisplay({ paymentMethod: 'Cash' })).toBe('Cash');
  });
});

describe('enrichTollLogEntries', () => {
  it('attributes plaza by id and marks voided', () => {
    const rows = enrichTollLogEntries({
      transactions: [
        {
          id: 't1',
          date: '2026-08-01',
          amount: -380,
          paymentMethod: 'Tag Balance',
          plazaId: 'p1',
          vehicleId: 'v1',
          driverId: 'd1',
          status: 'voided',
          metadata: { voided: true },
        },
      ],
      vehicles: [{ id: 'v1', licensePlate: '5179KZ' }],
      drivers: [{ id: 'd1', name: 'Kenny' }],
      plazas: [{ id: 'p1', name: 'Spanish Town', highway: 'T1', parish: 'St. Catherine' }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].plazaName).toBe('Spanish Town');
    expect(rows[0].plazaSource).toBe('id');
    expect(rows[0].isVoided).toBe(true);
    expect(rows[0].vehicleName).toBe('5179KZ');
    expect(rows[0].driverDisplayName).toBe('Kenny');
    expect(rows[0].isUsage).toBe(true);
  });
});
