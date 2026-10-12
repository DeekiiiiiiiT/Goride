import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@roam/location', () => ({
  geocodeAddress: vi.fn(),
  reverseGeocode: vi.fn(),
}));

import { geocodeAddress, reverseGeocode } from '@roam/location';
import { plusCodeQuery, resolveStorePin } from './resolveStorePin';

const geocode = vi.mocked(geocodeAddress);
const reverse = vi.mocked(reverseGeocode);

beforeEach(() => {
  geocode.mockReset();
  reverse.mockReset();
});

describe('plusCodeQuery', () => {
  it('keeps a full code and a short code with its area', () => {
    expect(plusCodeQuery('7795X36X+5W')).toBe('7795X36X+5W');
    expect(plusCodeQuery('X36X+5W Portmore')).toBe('X36X+5W Portmore');
  });
});

describe('resolveStorePin', () => {
  it('fills the street from a Plus Code and keeps the decoded pin', async () => {
    reverse.mockResolvedValue({
      lat: 0,
      lng: 0,
      formattedAddress: '12 Constant Spring Rd, Kingston, Jamaica',
      streetAddress: '12 Constant Spring Rd',
      city: 'Kingston',
      postalCode: '',
    });
    const pin = await resolveStorePin('7795X36X+5W');
    expect(pin.address).toBe('12 Constant Spring Rd');
    expect(reverse).toHaveBeenCalledOnce();
    expect(geocode).not.toHaveBeenCalled();
    const [lat, lng] = reverse.mock.calls[0];
    expect(pin.lat).toBe(lat.toFixed(7));
    expect(pin.lng).toBe(lng.toFixed(7));
  });

  it('looks up a normal address', async () => {
    geocode.mockResolvedValue({
      lat: 18.0179,
      lng: -76.8099,
      formattedAddress: 'Domino\'s, Kingston, Jamaica',
      streetAddress: 'Domino\'s',
      city: 'Kingston',
      postalCode: '',
    });
    const pin = await resolveStorePin('Dominos Kingston');
    expect(geocode).toHaveBeenCalledWith('Dominos Kingston, Jamaica');
    expect(pin.lat).toBe('18.0179000');
    expect(pin.lng).toBe('-76.8099000');
    expect(pin.address).toBe('Domino\'s, Kingston, Jamaica');
  });
});
