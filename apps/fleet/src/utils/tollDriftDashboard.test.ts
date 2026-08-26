import { describe, it, expect } from 'vitest';
import { buildTollDriftDashboard } from './tollDriftDashboard';
import type { TollRateScheduleStore } from '../types/tollRateSchedule';

const store: TollRateScheduleStore = {
  current: {
    id: 'v1',
    effectiveFrom: '2026-01-01',
    effectiveDate: '01/01/2026',
    operator: 'JRC',
    currency: 'JMD',
    publishedAt: '2026-01-01T00:00:00Z',
    plazas: [
      {
        plazaId: 'p1',
        plazaName: 'Spanish Town',
        rates: { class1: { withTag: 275, withoutTag: 300 } },
      },
    ],
    vehicleClasses: [],
    routeRateGroups: [],
    createdAt: '2026-01-01T00:00:00Z',
  } as any,
  versions: [],
};

describe('buildTollDriftDashboard', () => {
  it('flags tag vs official drift and groups by plaza', () => {
    const dash = buildTollDriftDashboard(
      [
        {
          id: 'a',
          date: '2026-02-01',
          absAmount: 300,
          plazaId: 'p1',
          plazaName: 'Spanish Town',
          isUsage: true,
        },
        {
          id: 'b',
          date: '2026-02-02',
          absAmount: 275,
          plazaId: 'p1',
          plazaName: 'Spanish Town',
          isUsage: true,
        },
      ],
      store,
    );
    expect(dash.drifting).toHaveLength(1);
    expect(dash.drifting[0].id).toBe('a');
    expect(dash.byPlaza[0].plazaName).toBe('Spanish Town');
    expect(dash.byPlaza[0].count).toBe(1);
    expect(dash.totalDelta).toBe(25);
  });

  it('ignores voided and non-usage rows', () => {
    const dash = buildTollDriftDashboard(
      [
        {
          id: 'v',
          date: '2026-02-01',
          absAmount: 500,
          plazaName: 'Spanish Town',
          plazaId: 'p1',
          isUsage: true,
          isVoided: true,
        },
        {
          id: 't',
          date: '2026-02-01',
          absAmount: 1000,
          isUsage: false,
        },
      ],
      store,
    );
    expect(dash.drifting).toHaveLength(0);
    expect(dash.totalTagSpend).toBe(0);
  });
});
