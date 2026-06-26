/** True only on the dedicated store-tablet route — not when owner dashboard shares the origin. */
export function isStoreTabletContext(): boolean {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname;
  return path === '/tablet' || path.startsWith('/tablet/');
}
