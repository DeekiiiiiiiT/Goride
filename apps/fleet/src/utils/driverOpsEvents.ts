/**
 * Lightweight driver-ops telemetry (Phase E).
 * DEV: console.info. PROD: CustomEvent on window for optional listeners; no network.
 */
export type DriverOpsEventProps = Record<string, string | number | boolean | null | undefined>;

export function trackDriverOpsEvent(name: string, props?: DriverOpsEventProps): void {
  const payload = { name, props: props || {}, at: new Date().toISOString() };
  if (import.meta.env.DEV) {
    console.info('[driverOps]', payload);
    return;
  }
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('goride:driver-ops', { detail: payload }));
    } catch {
      /* no-op */
    }
  }
}
