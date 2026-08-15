import { describe, expect, it } from 'vitest';
import { parseFavoriteItemKey, toFavoriteItemKey } from './favoriteItemKey';
import { nativePushEndpoint, urlBase64ToUint8Array } from './rushPushCodec';

describe('toFavoriteItemKey / parseFavoriteItemKey', () => {
  it('round-trips merchant and item ids', () => {
    const key = toFavoriteItemKey('merchant-1', 'item-abc');
    expect(key).toBe('merchant-1:item-abc');
    expect(parseFavoriteItemKey(key)).toEqual({
      merchantId: 'merchant-1',
      itemId: 'item-abc',
    });
  });

  it('keeps colons inside item id after the first separator', () => {
    expect(parseFavoriteItemKey('m1:sku:extra')).toEqual({
      merchantId: 'm1',
      itemId: 'sku:extra',
    });
  });

  it('rejects malformed keys', () => {
    expect(parseFavoriteItemKey('')).toBeNull();
    expect(parseFavoriteItemKey(':only-item')).toBeNull();
    expect(parseFavoriteItemKey('only-merchant:')).toBeNull();
    expect(parseFavoriteItemKey('no-separator')).toBeNull();
  });
});

describe('nativePushEndpoint', () => {
  it('prefixes fcm and apns tokens', () => {
    expect(nativePushEndpoint('fcm', 'tok123')).toBe('fcm:tok123');
    expect(nativePushEndpoint('apns', 'tok456')).toBe('apns:tok456');
  });
});

describe('urlBase64ToUint8Array', () => {
  it('decodes URL-safe base64 without padding', () => {
    // "hi" in base64url
    const bytes = urlBase64ToUint8Array('aGk');
    expect(Array.from(bytes)).toEqual([104, 105]);
  });
});
