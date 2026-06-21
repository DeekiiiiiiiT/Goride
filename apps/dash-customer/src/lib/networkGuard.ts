export class OfflineError extends Error {
  constructor(message = 'You are offline. Please check your connection and try again.') {
    super(message);
    this.name = 'OfflineError';
  }
}

export function assertOnline(): void {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new OfflineError();
  }
}

export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine;
}
