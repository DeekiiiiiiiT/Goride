/** No-op PWA host when Fleet settings pull in vite-plugin-pwa. */
export function PwaProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function usePwaUpdate() {
  return { needRefresh: false, updateServiceWorker: async () => {} };
}
