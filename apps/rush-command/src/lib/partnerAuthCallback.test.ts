import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const exchangeCodeForSession = vi.fn();
const setSession = vi.fn();

vi.mock('./partner-supabase', () => ({
  supabase: {
    auth: {
      exchangeCodeForSession: (...args: unknown[]) => exchangeCodeForSession(...args),
      setSession: (...args: unknown[]) => setSession(...args),
    },
  },
}));

beforeEach(() => {
  exchangeCodeForSession.mockReset();
  setSession.mockReset();
});

afterEach(() => {
  vi.resetModules();
});

describe('partnerAuthCallback parsing', () => {
  it('normalizes custom-scheme URLs for query parsing', async () => {
    const { parsePartnerAuthCallbackUrl } = await import('./partnerAuthCallback');
    const url = parsePartnerAuthCallbackUrl(
      'co.roamenterprise.partner://login?code=pkce-code-1',
    );
    expect(url.searchParams.get('code')).toBe('pkce-code-1');
  });

  it('returns ok:false for non-callback URLs without calling supabase', async () => {
    const { handlePartnerAuthCallbackUrl } = await import('./partnerAuthCallback');
    const result = await handlePartnerAuthCallbackUrl('https://evil.example/login?code=x');
    expect(result).toEqual({ ok: false });
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('exchanges code from query string', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const { handlePartnerAuthCallbackUrl } = await import('./partnerAuthCallback');
    const result = await handlePartnerAuthCallbackUrl(
      'co.roamenterprise.partner://login?code=abc123',
    );
    expect(result).toEqual({ ok: true });
    expect(exchangeCodeForSession).toHaveBeenCalledWith('abc123');
  });

  it('surfaces exchange errors', async () => {
    exchangeCodeForSession.mockResolvedValue({
      error: { message: 'Invalid PKCE code verifier' },
    });
    const { handlePartnerAuthCallbackUrl } = await import('./partnerAuthCallback');
    const result = await handlePartnerAuthCallbackUrl(
      'co.roamenterprise.partner://login?code=bad',
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Invalid PKCE');
  });

  it('sets session from hash tokens', async () => {
    setSession.mockResolvedValue({ error: null });
    const { handlePartnerAuthCallbackUrl } = await import('./partnerAuthCallback');
    const result = await handlePartnerAuthCallbackUrl(
      'co.roamenterprise.partner://login#access_token=at&refresh_token=rt',
    );
    expect(result).toEqual({ ok: true });
    expect(setSession).toHaveBeenCalledWith({
      access_token: 'at',
      refresh_token: 'rt',
    });
  });

  it('surfaces oauth error query params', async () => {
    const { handlePartnerAuthCallbackUrl } = await import('./partnerAuthCallback');
    const result = await handlePartnerAuthCallbackUrl(
      'co.roamenterprise.partner://login?error=access_denied&error_description=User+cancelled',
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain('cancelled');
  });

  it('returns incomplete message when no code or tokens', async () => {
    const { handlePartnerAuthCallbackUrl } = await import('./partnerAuthCallback');
    const result = await handlePartnerAuthCallbackUrl(
      'co.roamenterprise.partner://login',
    );
    expect(result).toEqual({
      ok: false,
      error: 'Sign-in was cancelled or incomplete.',
    });
  });
});
