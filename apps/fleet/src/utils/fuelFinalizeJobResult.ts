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

export function interpretFuelFinalizeJobResult(jobRes: FuelFinalizeJobResultLike | null | undefined): {
  incomplete: boolean;
  failures: FuelFinalizeJobFailure[];
  driversDoneCount: number;
  toastMessage: string;
} {
  const failures = Array.isArray(jobRes?.failures) ? jobRes!.failures! : [];
  const driversDoneCount = Array.isArray(jobRes?.driversDone) ? jobRes!.driversDone!.length : 0;
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

  return { incomplete, failures, driversDoneCount, toastMessage };
}
