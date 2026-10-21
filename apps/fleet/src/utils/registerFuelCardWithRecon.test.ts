import { describe, expect, it } from 'vitest';
import { buildFuelReconRegisterPayload } from './registerFuelCardWithRecon';

describe('buildFuelReconRegisterPayload', () => {
  it('includes sourceId and coverage fields for fuel_card_self', () => {
    const body = buildFuelReconRegisterPayload({
      batchId: 'batch-1',
      sourceId: 'fuel_card_self',
      organizationId: 'org-9',
      dataPeriodStart: '2026-10-05T00:00:00Z',
      dataPeriodEnd: '2026-10-11',
      rowsCommitted: 12,
      weekKeys: ['2026-10-05'],
    });
    expect(body.sourceId).toBe('fuel_card_self');
    expect(body.batchId).toBe('batch-1');
    expect(body.coverageStart).toBe('2026-10-05');
    expect(body.coverageEnd).toBe('2026-10-11');
    expect(body.dataStart).toBe('2026-10-05');
    expect(body.dataEnd).toBe('2026-10-11');
    expect(body.rowsCommitted).toBe(12);
    expect(body.weekKeys).toEqual(['2026-10-05']);
    expect(body.semanticKey).toBe('fuel:fuel_card_self:org-9:2026-10-05:2026-10-11');
  });

  it('keeps the transaction span when the operator declares the whole week', () => {
    const body = buildFuelReconRegisterPayload({
      batchId: 'batch-2',
      sourceId: 'fuel_card_roam',
      organizationId: 'org-9',
      dataPeriodStart: '2026-10-14',
      dataPeriodEnd: '2026-10-16',
      coverageStart: '2026-10-12',
      coverageEnd: '2026-10-18',
    });
    expect(body.coverageStart).toBe('2026-10-12');
    expect(body.coverageEnd).toBe('2026-10-18');
    expect(body.dataStart).toBe('2026-10-14');
    expect(body.dataEnd).toBe('2026-10-16');
    expect(body.semanticKey).toBe('fuel:fuel_card_roam:org-9:2026-10-12:2026-10-18');
  });
});
