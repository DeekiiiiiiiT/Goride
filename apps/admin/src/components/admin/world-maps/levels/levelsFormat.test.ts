import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { sortBoundaryVersions } from '../boundaryVersions';
import { PublishDialog } from './PublishDialog';
import { canConfirmPublish, sampleNames, uploadRefusal } from './levelsFormat';

describe('level browser rules', () => {
  it('U1 shows places moving and the sample names', () => {
    const html = renderToStaticMarkup(createElement(PublishDialog, {
      name: 'Half Way Tree',
      version: 2,
      checks: { area_change_pct: 3.1, overlap_pct: 1.6, overlap_with: 'Cross Roads', outside_parent_pct: 0.4 },
      impact: { places_moving: 2, places_sample: ['Texaco Half Way Tree', 'Total Hope Road'], live_markets: 1, merchants_moving: 0, merchants_checked: 14 },
      impactLoaded: true,
      onCancel: () => undefined,
      onConfirm: () => undefined,
    }));
    expect(html).toContain('Dominion places moving');
    expect(html).toContain('Texaco Half Way Tree, Total Hope Road');
    expect(html).toContain('>2<');
    expect(sampleNames(['Texaco Half Way Tree', { name: 'Total Hope Road' }])).toBe('Texaco Half Way Tree, Total Hope Road');
  });

  it('U5 keeps the live version first after a reload', () => {
    const reloaded = sortBoundaryVersions([
      { id: 'old', version: 4, status: 'retired', created_at: '2026-08-27T00:00:00Z', notes: 'Retired parish template' },
      { id: 'live', version: 1, status: 'published', created_at: '2026-10-24T12:00:00Z' },
    ]);
    expect(reloaded[0].status).toBe('published');
    expect(reloaded[0].id).toBe('live');
  });

  it('U6 refuses a file with two areas', () => {
    expect(uploadRefusal(2, 'Polygon')).toBe('This file has 2 areas. Use Imports for more than one.');
    expect(uploadRefusal(1, 'Point')).toBe('This file has no area shape.');
    expect(uploadRefusal(1, 'Polygon')).toBeNull();
  });

  it('does not confirm publish before the preview and the ticks', () => {
    expect(canConfirmPublish({ impactLoaded: false, warnings: ['a'], ticked: 1, needsName: false, typed: '', expectedName: 'A' })).toBe(false);
    expect(canConfirmPublish({ impactLoaded: true, warnings: ['a'], ticked: 0, needsName: false, typed: '', expectedName: 'A' })).toBe(false);
    expect(canConfirmPublish({ impactLoaded: true, warnings: [], ticked: 0, needsName: true, typed: 'half way tree', expectedName: 'Half Way Tree' })).toBe(true);
  });
});
