const KEY = 'plug-demo';

/** Demo data is a dev-build switch. A production build cannot turn it on. */
export function demoOn(): boolean {
  if (import.meta.env.PROD) return false;
  try {
    const search = new URLSearchParams(window.location.search);
    if (search.get('demo') === '1') {
      sessionStorage.setItem(KEY, '1');
      return true;
    }
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setDemo(on: boolean) {
  if (import.meta.env.PROD) return;
  if (on) sessionStorage.setItem(KEY, '1');
  else sessionStorage.removeItem(KEY);
  window.location.reload();
}
