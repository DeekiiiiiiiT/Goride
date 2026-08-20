export function getCommandOrigin(): string {
  const env = (import.meta as any).env?.VITE_COMMAND_ORIGIN?.trim?.();
  if (env) return env.replace(/\/$/, '');
  if (typeof window !== 'undefined' && /localhost|127\.0\.0\.1/.test(window.location.hostname)) {
    return `${window.location.protocol}//${window.location.hostname}:5176`;
  }
  return 'https://command.roamrush.app';
}

export function buildCommandTabletUrl(params: {
  code?: string;
  station?: string;
  prepStation?: string;
}): string {
  const url = new URL('/tablet', getCommandOrigin());
  if (params.code) url.searchParams.set('code', params.code);
  if (params.station) url.searchParams.set('station', params.station);
  if (params.prepStation) url.searchParams.set('prepStation', params.prepStation);
  return url.toString();
}

export function redirectPartnerTabletToCommand(): boolean {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname;
  if (path !== '/tablet' && !path.startsWith('/tablet/')) return false;
  const dest = new URL(path + window.location.search + window.location.hash, getCommandOrigin());
  window.location.replace(dest.toString());
  return true;
}
