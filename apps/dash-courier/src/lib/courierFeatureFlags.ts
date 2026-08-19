/** Stacked multi-order delivery — off by default until fully wired and verified. */
export function isCourierStackedEnabled(): boolean {
  return (
    (import.meta as ImportMeta & { env: Record<string, string> }).env
      .VITE_COURIER_STACKED_ENABLED === 'true'
  );
}
