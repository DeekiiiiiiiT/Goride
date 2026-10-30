import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { PinTable } from './PinTable';
import { kindLabel, pointInJamaica } from './pinsApi';

describe('map pins', () => {
  it('U9 shows Town centre in the Kind column, not the status', () => {
    const html = renderToStaticMarkup(createElement(PinTable, {
      rows: [{ id: '1', name: 'Spanish Town', kind: 'town_centre', lat: 17.99, lng: -76.95, pcode: 'JM0807', status: 'active', area: 'Spanish Town › Saint Catherine' }],
      selected: '1',
      onSelect: () => undefined,
    }));
    expect(kindLabel('town_centre')).toBe('Town centre');
    expect(html).toContain('Town centre');
    expect(html).not.toContain('>active<');
    expect(html).toContain('Active');
  });

  it('U7 rejects a point at 0,0 before it is saved', () => {
    expect(pointInJamaica(0, 0)).toBe(false);
    expect(pointInJamaica(17.9961, -76.9547)).toBe(true);
  });
});
