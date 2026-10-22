/** One timing line per engine stage: milliseconds and row counts. */
export function logReconPhase(
  stage: string,
  startedAt: number,
  extra: Record<string, unknown> = {},
): void {
  console.log(JSON.stringify({
    reconPhase: stage,
    ms: Date.now() - startedAt,
    ...extra,
  }));
}
