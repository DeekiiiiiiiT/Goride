import { describe, expect, it } from 'vitest';
import {
  buildCanonicalMaintenanceEvent,
  isMaintenanceLedgerEligible,
} from '../canonicalMaintenanceLedger';

const base = {
  id: 'maint-1',
  vehicleId: 'veh-1',
  performed_at_date: '2026-07-01',
  cost: 500,
  status: 'Completed',
  service_type: 'Tires',
  provider: 'QuickFit',
};

describe('canonicalMaintenanceLedger', () => {
  it('builds eligible Completed + cost event shape', () => {
    const ev = buildCanonicalMaintenanceEvent(base);
    expect(ev).not.toBeNull();
    expect(ev!.idempotencyKey).toBe('maintenance_record:maint-1|maintenance');
    expect(ev!.eventType).toBe('maintenance');
    expect(ev!.direction).toBe('outflow');
    expect(ev!.netAmount).toBe(500);
    expect(ev!.grossAmount).toBe(500);
    expect(ev!.currency).toBe('JMD');
    expect(ev!.sourceType).toBe('financial_event');
    expect(ev!.sourceId).toBe('maint-1');
    expect(ev!.vehicleId).toBe('veh-1');
    expect(ev!.driverId).toBe('fleet');
    expect(ev!.date).toBe('2026-07-01');
    expect(ev!.description).toBe('Tires — QuickFit');
    expect((ev!.metadata as { maintenanceRecordId: string }).maintenanceRecordId).toBe('maint-1');
  });

  it('defaults currency to JMD', () => {
    const ev = buildCanonicalMaintenanceEvent({ ...base, currency: '' });
    expect(ev!.currency).toBe('JMD');
  });

  it('respects explicit currency', () => {
    const ev = buildCanonicalMaintenanceEvent({ ...base, currency: 'usd' });
    expect(ev!.currency).toBe('USD');
  });

  it('returns null for Requested status', () => {
    expect(buildCanonicalMaintenanceEvent({ ...base, status: 'Requested' })).toBeNull();
    expect(isMaintenanceLedgerEligible({ ...base, status: 'Requested' })).toBe(false);
  });

  it('returns null for cost 0', () => {
    expect(buildCanonicalMaintenanceEvent({ ...base, cost: 0 })).toBeNull();
  });

  it('returns null for missing date', () => {
    expect(
      buildCanonicalMaintenanceEvent({ ...base, performed_at_date: undefined, date: undefined }),
    ).toBeNull();
  });

  it('returns null for missing id', () => {
    expect(buildCanonicalMaintenanceEvent({ ...base, id: '' })).toBeNull();
  });

  it('accepts date alias and Completed casing', () => {
    const ev = buildCanonicalMaintenanceEvent({
      ...base,
      performed_at_date: undefined,
      date: '2026-06-15T12:00:00Z',
      status: 'completed',
    });
    expect(ev!.date).toBe('2026-06-15');
  });

  it('keeps idempotency key stable', () => {
    const a = buildCanonicalMaintenanceEvent(base);
    const b = buildCanonicalMaintenanceEvent({ ...base, cost: 999 });
    expect(a!.idempotencyKey).toBe(b!.idempotencyKey);
  });
});
