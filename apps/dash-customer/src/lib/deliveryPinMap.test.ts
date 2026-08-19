import { describe, expect, it } from 'vitest';
import { isValidLatLng, mapsPinUrl, osmEmbedUrl } from './deliveryPinMap';

describe('isValidLatLng', () => {
  it('accepts Kingston coordinates', () => {
    expect(isValidLatLng(18.0179, -76.8099)).toBe(true);
  });

  it('rejects missing or zero pins', () => {
    expect(isValidLatLng(undefined, -76.8)).toBe(false);
    expect(isValidLatLng(0, 0)).toBe(false);
  });
});

describe('map urls', () => {
  it('builds an OSM embed around the pin', () => {
    const url = osmEmbedUrl(18.02, -76.81);
    expect(url).toContain('openstreetmap.org/export/embed.html');
    expect(url).toContain('marker=18.02%2C-76.81');
  });

  it('builds a Google Maps pin link', () => {
    expect(mapsPinUrl(18.02, -76.81)).toBe('https://www.google.com/maps?q=18.02,-76.81');
  });
});
