import { describe, expect, it } from 'vitest';
import { signInOrder, signInProviderLabel } from './signInOrder';

const android = { userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile', platform: 'Android', maxTouchPoints: 5 };
const iphone = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5 };
const ipad = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 5 };
const mac = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0 };
const windows = { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', platform: 'Windows', maxTouchPoints: 0 };

describe('sign-in order', () => {
  it('puts the device option first and keeps the other one tap away', () => {
    expect(signInOrder(android, true)).toEqual({ primary: ['google'], more: ['apple'] });
    expect(signInOrder(iphone, true)).toEqual({ primary: ['apple'], more: ['google'] });
    expect(signInOrder(ipad, true)).toEqual({ primary: ['apple'], more: ['google'] });
    expect(signInOrder(iphone, false)).toEqual({ primary: ['google'], more: [] });
    expect(signInOrder(mac, true)).toEqual({ primary: ['apple', 'google'], more: [] });
    expect(signInOrder(windows, true)).toEqual({ primary: ['google'], more: ['apple'] });
    expect(signInProviderLabel('google')).toBe('Signed in with Google');
    expect(signInProviderLabel('email')).toBe('Signed in with email');
  });
});
