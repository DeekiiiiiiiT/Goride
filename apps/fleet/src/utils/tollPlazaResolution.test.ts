import { describe, expect, it } from 'vitest';
import { resolveTollPlaza } from './tollPlazaResolution';
import type { TollPlaza } from '../types/toll';

const plazas = [
  {
    id: 'plz-spanish',
    name: 'Spanish Town',
    highway: 'Highway 2000',
    direction: 'Eastbound',
    parish: 'St. Catherine',
    location: { lat: 17.99, lng: -76.95 },
    geofenceRadius: 500,
  },
  {
    id: 'plz-portmore',
    name: 'Portmore',
    highway: 'Highway 2000',
    direction: 'Westbound',
    parish: 'St. Catherine',
    location: { lat: 17.95, lng: -76.88 },
    geofenceRadius: 500,
  },
] as unknown as TollPlaza[];

describe('resolveTollPlaza', () => {
  it('uses the ledger plazaId even when the free text says something else', () => {
    const match = resolveTollPlaza(
      { plazaId: 'plz-spanish', vendor: 'PORTMORE TOLL BOOTH' },
      plazas,
    );
    expect(match.plaza?.id).toBe('plz-spanish');
    expect(match.source).toBe('id');
  });

  it('falls back to the plaza name for rows imported before attribution existed', () => {
    const match = resolveTollPlaza({ vendor: 'TJH SPANISH TOWN PLAZA' }, plazas);
    expect(match.plaza?.id).toBe('plz-spanish');
    expect(match.source).toBe('name');
  });

  it('reads plazaId out of metadata when the top-level field is missing', () => {
    const match = resolveTollPlaza({ metadata: { plazaId: 'plz-portmore' } }, plazas);
    expect(match.plaza?.id).toBe('plz-portmore');
    expect(match.source).toBe('id');
  });

  it('ignores a plazaId that points at a plaza we do not have', () => {
    const match = resolveTollPlaza({ plazaId: 'plz-deleted', vendor: 'PORTMORE' }, plazas);
    expect(match.plaza?.id).toBe('plz-portmore');
    expect(match.source).toBe('name');
  });

  it('matches on GPS when there is no id and no recognisable name', () => {
    const match = resolveTollPlaza(
      { vendor: 'TOLL 0044', metadata: { lat: 17.9902, lng: -76.9503 } },
      plazas,
    );
    expect(match.plaza?.id).toBe('plz-spanish');
    expect(match.source).toBe('gps');
  });

  it('reports no attribution rather than guessing', () => {
    const match = resolveTollPlaza({ vendor: 'MISC HIGHWAY CHARGE' }, plazas);
    expect(match.plaza).toBeNull();
    expect(match.source).toBe('none');
  });
});
