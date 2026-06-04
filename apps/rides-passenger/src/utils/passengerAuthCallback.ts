import { supabase } from '@roam/auth-client';
import { isPassengerAuthCallbackUrl } from './passengerAuthRedirect';

function parseAuthCallbackUrl(urlString: string): URL {
  try {
    return new URL(urlString);
  } catch {
    const normalized = urlString.replace(/^[^:]+:\/\//, 'https://auth-callback/');
    return new URL(normalized);
  }
}

export async function handlePassengerAuthCallbackUrl(urlString: string): Promise<boolean> {
  if (!isPassengerAuthCallbackUrl(urlString)) return false;

  const url = parseAuthCallbackUrl(urlString);
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));

  const code = url.searchParams.get('code') ?? hashParams.get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return !error;
  }

  const access_token =
    hashParams.get('access_token') ?? url.searchParams.get('access_token');
  const refresh_token =
    hashParams.get('refresh_token') ?? url.searchParams.get('refresh_token');
  if (access_token && refresh_token) {
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    return !error;
  }

  return false;
}
