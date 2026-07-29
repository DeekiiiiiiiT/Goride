/**
 * Demo/mock data is allowed only in local/dev builds, or when explicitly opted in.
 * Production must never silently substitute MOCK_* content on API failure.
 */
export function allowMocks(): boolean {
  try {
    const env = (import.meta as ImportMeta & { env?: Record<string, string | boolean | undefined> }).env;
    if (env?.VITE_ALLOW_MOCKS === 'true' || env?.VITE_ALLOW_MOCKS === true) return true;
    return Boolean(env?.DEV);
  } catch {
    return false;
  }
}
