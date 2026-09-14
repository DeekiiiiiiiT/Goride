/**
 * Non-React auth header builder for platform admin API calls.
 * PlatformSessionProvider binds the active access token; services read it here.
 */
import {
  getProductLineHeaders,
  publicAnonKey,
  supabaseAnonFunctionHeaders,
} from '@roam/api-client';

export class AuthRequiredError extends Error {
  readonly status = 401;
  readonly code = 'AUTH_REQUIRED';
  constructor(message = 'You must be signed in to perform this action.') {
    super(message);
    this.name = 'AuthRequiredError';
  }
}

type AuthHeadersFn = (contentType?: string | null) => Promise<Record<string, string>>;

let boundAccessToken: string | null = null;
let boundGetAuthHeaders: AuthHeadersFn | null = null;

/** Called by PlatformSessionProvider to keep service-layer auth in sync. */
export function bindPlatformSessionAuth(opts: {
  accessToken: string | null;
  getAuthHeaders?: AuthHeadersFn;
}): void {
  boundAccessToken = opts.accessToken;
  boundGetAuthHeaders = opts.getAuthHeaders ?? null;
}

export function buildAuthHeadersFromToken(
  accessToken: string | null,
  contentType: string | null = 'application/json',
  options?: { allowAnon?: boolean },
): Record<string, string> {
  if (!accessToken && !options?.allowAnon) {
    throw new AuthRequiredError();
  }

  const headers: Record<string, string> = {
    ...supabaseAnonFunctionHeaders({
      Authorization: `Bearer ${accessToken || publicAnonKey}`,
    }),
    ...getProductLineHeaders(),
  };

  if (contentType) {
    headers['Content-Type'] = contentType;
  }

  return headers;
}

/**
 * Strict auth headers for platform admin / mutation endpoints.
 * Uses injected getAuthHeaders when provided; otherwise builds from bound accessToken.
 */
export async function requirePlatformAuthHeaders(
  contentType: string | null = 'application/json',
): Promise<Record<string, string>> {
  if (boundGetAuthHeaders) {
    return boundGetAuthHeaders(contentType);
  }
  return buildAuthHeadersFromToken(boundAccessToken, contentType);
}
