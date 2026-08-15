import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sessionStore = new Map<string, string>();

beforeEach(() => {
  sessionStore.clear();
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => sessionStore.get(key) ?? null,
    setItem: (key: string, value: string) => {
      sessionStore.set(key, value);
    },
    removeItem: (key: string) => {
      sessionStore.delete(key);
    },
  });
  vi.stubGlobal('window', {
    location: {
      origin: 'http://localhost:5175',
      pathname: '/',
      search: '',
      hash: '',
    },
    history: { replaceState: vi.fn() },
    Capacitor: undefined,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('partnerAuth URL helpers', () => {
  it('returns production origin fallback without window origin quirks', async () => {
    vi.stubGlobal('window', undefined);
    const {
      getPartnerAuthRedirectUrl,
      PARTNER_PRODUCTION_ORIGIN,
    } = await import('./partnerAuth');
    expect(getPartnerAuthRedirectUrl()).toBe(`${PARTNER_PRODUCTION_ORIGIN}/`);
  });

  it('uses window origin on web', async () => {
    const { getPartnerAuthRedirectUrl } = await import('./partnerAuth');
    expect(getPartnerAuthRedirectUrl()).toBe('http://localhost:5175/');
  });

  it('preserves team-invite and tablet paths', async () => {
    vi.stubGlobal('window', {
      location: {
        origin: 'http://localhost:5175',
        pathname: '/team-invite/abc',
        search: '',
        hash: '',
      },
      Capacitor: undefined,
    });
    const { getPartnerAuthRedirectUrl } = await import('./partnerAuth');
    expect(getPartnerAuthRedirectUrl()).toBe('http://localhost:5175/team-invite/abc');

    vi.resetModules();
    vi.stubGlobal('window', {
      location: {
        origin: 'http://localhost:5175',
        pathname: '/tablet',
        search: '?station=kitchen',
        hash: '',
      },
      Capacitor: undefined,
    });
    const auth = await import('./partnerAuth');
    expect(auth.getPartnerAuthRedirectUrl()).toBe(
      'http://localhost:5175/tablet?station=kitchen',
    );
  });

  it('returns native deep link when Capacitor reports native', async () => {
    vi.stubGlobal('window', {
      location: { origin: 'https://localhost', pathname: '/', search: '', hash: '' },
      Capacitor: { isNativePlatform: () => true },
    });
    const {
      getPartnerAuthRedirectUrl,
      PARTNER_NATIVE_AUTH_CALLBACK,
      isPartnerAuthCallbackUrl,
    } = await import('./partnerAuth');
    expect(getPartnerAuthRedirectUrl()).toBe(PARTNER_NATIVE_AUTH_CALLBACK);
    expect(isPartnerAuthCallbackUrl(`${PARTNER_NATIVE_AUTH_CALLBACK}?code=abc`)).toBe(true);
    expect(isPartnerAuthCallbackUrl('https://partner.roamrush.app/?code=abc')).toBe(true);
    expect(isPartnerAuthCallbackUrl('https://evil.example/?code=abc')).toBe(false);
  });

  it('stores and consumes oauth intent', async () => {
    const {
      PARTNER_OAUTH_INTENT_KEY,
      PARTNER_OAUTH_INTENT_LOGIN,
      clearPartnerOAuthIntent,
      consumePartnerOAuthIntent,
    } = await import('./partnerAuth');

    sessionStorage.setItem(PARTNER_OAUTH_INTENT_KEY, PARTNER_OAUTH_INTENT_LOGIN);
    expect(consumePartnerOAuthIntent()).toBe(PARTNER_OAUTH_INTENT_LOGIN);
    expect(sessionStorage.getItem(PARTNER_OAUTH_INTENT_KEY)).toBeNull();

    sessionStorage.setItem(PARTNER_OAUTH_INTENT_KEY, PARTNER_OAUTH_INTENT_LOGIN);
    clearPartnerOAuthIntent();
    expect(sessionStorage.getItem(PARTNER_OAUTH_INTENT_KEY)).toBeNull();
  });
});
