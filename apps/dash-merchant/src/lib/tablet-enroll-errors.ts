export class TabletEnrollError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'TabletEnrollError';
    this.code = code;
  }
}

const STATION_NOT_ENABLED_MESSAGE =
  "This station isn't enabled for your store. Ask your manager to turn it on in Operations settings.";

export function formatTabletEnrollError(error: unknown): string {
  if (error instanceof TabletEnrollError) {
    if (error.code === 'STATION_NOT_ENABLED') return STATION_NOT_ENABLED_MESSAGE;
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return 'Could not connect tablet';
}
