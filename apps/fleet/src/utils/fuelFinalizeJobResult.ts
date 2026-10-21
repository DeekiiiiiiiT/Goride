/**
 * Interpret server finalize job response (NEW-7: partial settle must never look like success).
 */
export type FuelFinalizeJobFailure = { driverId?: string; error?: string };

export type FuelFinalizeJobResultLike = {
  state?: string;
  ok?: boolean;
  error?: string;
  failures?: FuelFinalizeJobFailure[];
  driversDone?: string[];
  progress_done?: number;
  cursor?: { completedDriverIds?: string[] } | null;
};

export function fuelFinalizeProgressLabel(job: {
  state?: string;
  progress_done?: number;
  progress_total?: number;
  cursor?: { step?: string } | null;
}): string {
  const step = job.cursor?.step;
  if (job.state === 'succeeded' || step === 'done') return 'Done';
  if (step === 'seal' || step === 'rebuild') return 'Sealing statement';
  if (step === 'money') {
    return `Posting driver charges ${job.progress_done || 0}/${job.progress_total || 1}`;
  }
  return 'Locking this week';
}

/** Statements the job actually posted. Prefer the driver list; fall back to progress_done. */
export function fuelFinalizePostedCount(jobRes: FuelFinalizeJobResultLike | null | undefined): number {
  if (Array.isArray(jobRes?.driversDone)) return jobRes.driversDone.length;
  const cursorIds = jobRes?.cursor?.completedDriverIds;
  if (Array.isArray(cursorIds)) return cursorIds.length;
  const progress = Number(jobRes?.progress_done);
  return Number.isFinite(progress) && progress > 0 ? progress : 0;
}

export function fuelFinalizeSuccessMessage(postedCount: number): string {
  if (postedCount > 0) {
    const label = postedCount === 1 ? 'statement' : 'statements';
    return `Week locked. ${postedCount} driver ${label} posted. This week is completed.`;
  }
  return 'Week locked. This week is completed.';
}

export function interpretFuelFinalizeJobResult(jobRes: FuelFinalizeJobResultLike | null | undefined): {
  incomplete: boolean;
  failures: FuelFinalizeJobFailure[];
  driversDoneCount: number;
  toastMessage: string;
  successMessage: string;
} {
  const failures = Array.isArray(jobRes?.failures) ? jobRes!.failures! : [];
  const driversDoneCount = fuelFinalizePostedCount(jobRes);
  const stillLocking = jobRes?.state === 'queued' || jobRes?.state === 'running';
  const incomplete =
    stillLocking ||
    jobRes?.state === 'failed' ||
    jobRes?.ok === false ||
    failures.length > 0;

  let toastMessage = '';
  if (stillLocking) {
    toastMessage = 'Still locking this week. Refresh in a moment to see Locked.';
  } else if (incomplete) {
    toastMessage = failures.length
      ? `Finalize incomplete — ${driversDoneCount} settled, ${failures.length} failed. Week stays open; retry to finish.`
      : `Finalize incomplete — ${jobRes?.error || 'server job failed'}. Week was not locked.`;
  }

  return {
    incomplete,
    failures,
    driversDoneCount,
    toastMessage,
    successMessage: fuelFinalizeSuccessMessage(driversDoneCount),
  };
}
