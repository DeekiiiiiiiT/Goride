export type SignInMethod = 'google' | 'apple';

export type SignInLayout = {
  primary: SignInMethod[];
  more: SignInMethod[];
};

export function signInOrder(input: {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
}, appleOn: boolean): SignInLayout {
  const ua = input.userAgent || '';
  const platform = input.platform || '';
  const touch = input.maxTouchPoints || 0;
  const android = platform === 'Android' || /Android/i.test(ua);
  const ios = /iPhone|iPad|iPod/i.test(ua) || ((/Macintosh/i.test(ua) || platform === 'MacIntel') && touch > 1);
  const mac = !android && !ios && (/Macintosh/i.test(ua) || platform === 'MacIntel');
  if (ios) {
    if (!appleOn) return { primary: ['google'], more: [] };
    return { primary: ['apple'], more: ['google'] };
  }
  if (mac) return { primary: appleOn ? ['apple', 'google'] : ['google'], more: [] };
  return { primary: ['google'], more: appleOn ? ['apple'] : [] };
}

export function signInProviderLabel(provider: unknown): string {
  if (provider === 'google') return 'Signed in with Google';
  if (provider === 'apple') return 'Signed in with Apple';
  return 'Signed in with email';
}

export function thisSignInDevice(): { userAgent: string; platform: string; maxTouchPoints: number } {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return {
    userAgent: navigator.userAgent,
    platform: nav.userAgentData?.platform || navigator.platform || '',
    maxTouchPoints: navigator.maxTouchPoints || 0,
  };
}

export function appleSignInEnabled(): boolean {
  return import.meta.env.VITE_PLUG_APPLE === '1';
}
