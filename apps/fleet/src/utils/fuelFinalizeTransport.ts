/** WRA-68: finalize may complete on the server while the HTTP response dies. */
export function isFuelFinalizeTransportFailure(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  if (status === 546 || status === 502 || status === 504 || status === 524) return true;
  if (typeof status === 'number' && status >= 500) return true;
  if (error instanceof TypeError) return true;
  if (error instanceof Error) {
    const m = error.message.toLowerCase();
    return (
      m.includes('failed to fetch') ||
      m.includes('network') ||
      m.includes('timeout') ||
      m.includes('job not found')
    );
  }
  return false;
}