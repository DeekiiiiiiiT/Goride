import { supabase } from './partner-supabase';
import { isPartnerAuthCallbackUrl } from './partnerAuth';

export type PartnerAuthCallbackResult = {
  ok: boolean;
  /** Present when ok is false and the URL was a partner callback we attempted to finish. */
  error?: string;
};

/** Normalize custom-scheme deep links so URLSearchParams / hash parsing works. */
export function parsePartnerAuthCallbackUrl(urlString: string): URL {
  try {
    return new URL(urlString);
  } catch {
    const normalized = urlString.replace(/^[^:]+:\/\//, 'https://auth-callback/');
    return new URL(normalized);
  }
}

/** Complete Supabase auth from a deep link. */
export async function handlePartnerAuthCallbackUrl(
  urlString: string,
): Promise<PartnerAuthCallbackResult> {
  if (!isPartnerAuthCallbackUrl(urlString)) {
    return { ok: false };
  }

  const url = parsePartnerAuthCallbackUrl(urlString);
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));

  const code = url.searchParams.get('code') ?? hashParams.get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return { ok: false, error: error.message || 'Could not complete sign-in.' };
    }
    return { ok: true };
  }

  const access_token =
    hashParams.get('access_token') ?? url.searchParams.get('access_token');
  const refresh_token =
    hashParams.get('refresh_token') ?? url.searchParams.get('refresh_token');
  if (access_token && refresh_token) {
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error) {
      return { ok: false, error: error.message || 'Could not restore session.' };
    }
    return { ok: true };
  }

  const oauthError =
    url.searchParams.get('error_description') ??
    url.searchParams.get('error') ??
    hashParams.get('error_description') ??
    hashParams.get('error');
  if (oauthError) {
    return { ok: false, error: oauthError };
  }

  return { ok: false, error: 'Sign-in was cancelled or incomplete.' };
}
