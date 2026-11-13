/** Toll v2 command API failure — keeps business `code` from 4xx JSON bodies. */
export class TollV2CommandError extends Error {
  readonly status: number;
  readonly code: string;
  readonly currentState: Record<string, unknown>;

  constructor(
    message: string,
    status: number,
    code: string,
    currentState: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'TollV2CommandError';
    this.status = status;
    this.code = code;
    this.currentState = currentState;
  }
}

export function tollV2UserMessage(error: unknown, fallback: string): string {
  if (error instanceof TollV2CommandError) {
    if (error.code === 'VERSION_CHANGED') {
      return 'Someone else changed this toll. The list was refreshed.';
    }
    if (error.code === 'WRONG_STATE' || error.code === 'NOT_FOUND') {
      return 'That toll changed. The list was refreshed.';
    }
    if (error.code === 'WEEK_SEALED') {
      return 'This week is already sealed.';
    }
    if (error.code === 'REOPEN_INSTEAD') {
      return 'Paid weeks can\'t be reopened — late items move to the open week.';
    }
    if (error.message && !error.message.startsWith('{')) return error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
