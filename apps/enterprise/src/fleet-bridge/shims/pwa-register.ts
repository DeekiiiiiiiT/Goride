export function useRegisterSW(_opts?: unknown) {
  return {
    needRefresh: [false, () => {}] as const,
    offlineReady: [false, () => {}] as const,
    updateServiceWorker: async (_reload?: boolean) => {},
  };
}
