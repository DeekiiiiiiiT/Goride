/**
 * Demo/mock fixture data is allowed only in local/dev builds, or when explicitly opted in.
 * Production must never silently show FIXTURE_* enterprise inventory as real data.
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
