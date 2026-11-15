/** A refused or failed service save, carrying the server's { code, error, step }. */
export class MaintenanceSaveError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly step: string | null;

  constructor(status: number, body: { code?: unknown; error?: unknown; step?: unknown }, fallback: string) {
    super(typeof body.error === "string" && body.error.trim() ? body.error : fallback);
    this.name = "MaintenanceSaveError";
    this.status = status;
    this.code = typeof body.code === "string" ? body.code : null;
    this.step = typeof body.step === "string" ? body.step : null;
  }

  /** Someone else saved first (or the edit had no version): show "This service was changed". */
  get isStale(): boolean {
    return this.code === "stale_edit" || this.code === "version_required";
  }

  /** The service was saved but a completion step failed: it's now "Not finished saving". */
  get isNotFinished(): boolean {
    return this.code === "completion_failed";
  }

  get isStillFinishing(): boolean {
    return this.code === "completion_in_progress";
  }
}

export async function maintenanceSaveErrorFrom(response: Response, fallback: string): Promise<MaintenanceSaveError> {
  const body = (await response.json().catch(() => ({}))) as { code?: unknown; error?: unknown; step?: unknown };
  return new MaintenanceSaveError(response.status, body, fallback);
}

/** Plain words for a failed completion step, shown after "Couldn't finish:". */
export function finishFailureText(err: unknown): string {
  if (err instanceof MaintenanceSaveError) {
    if (err.step === "appendCanonicalMaintenance") return "the books service isn't answering. Try again later.";
    if (err.isStillFinishing) return "it's still finishing. Try again in a moment.";
    return err.message.replace(/\.$/, "") + ".";
  }
  if (err instanceof TypeError) return "couldn't reach the server. Check your connection and try again.";
  return err instanceof Error && err.message ? err.message : "something went wrong. Try again.";
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** "Still finishing": try again after 3 s, up to 5 times (plan section 3). */
export async function retryWhileFinishing<T>(run: () => Promise<T>, opts?: { delayMs?: number; tries?: number }): Promise<T> {
  const delay = opts?.delayMs ?? 3000;
  const tries = opts?.tries ?? 5;
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      if (!(err instanceof MaintenanceSaveError) || !err.isStillFinishing || attempt >= tries) throw err;
      await wait(delay);
    }
  }
}
