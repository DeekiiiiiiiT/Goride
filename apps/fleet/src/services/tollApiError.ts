/** Toll API failure that keeps the HTTP status and the kernel request id. */
export class TollApiError extends Error {
  readonly status: number;
  readonly requestId: string | null;
  readonly reason: string | null;

  constructor(message: string, status: number, requestId: string | null, reason: string | null = null) {
    super(message);
    this.name = 'TollApiError';
    this.status = status;
    this.requestId = requestId;
    this.reason = reason;
  }
}

export function tollErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof TollApiError) {
    return error.requestId ? `${error.message} (ref ${error.requestId})` : error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export async function tollApiErrorFromResponse(response: Response, fallback: string): Promise<TollApiError> {
  const requestId = response.headers.get('X-Request-Id') || response.headers.get('x-request-id');
  let message = fallback;
  let reason: string | null = null;
  try {
    const raw = await response.text();
    if (raw) {
      try {
        const body = JSON.parse(raw) as { error?: unknown; reason?: unknown };
        if (typeof body.error === 'string' && body.error.trim()) message = body.error.trim();
        if (typeof body.reason === 'string') reason = body.reason;
      } catch {
        message = raw.slice(0, 300);
      }
    }
  } catch {
    /* body already consumed or empty */
  }
  return new TollApiError(message, response.status, requestId, reason);
}
