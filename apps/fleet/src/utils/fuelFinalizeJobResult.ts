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

export function interpretFuelFinalizeJobResult(jobRes: FuelFinalizeJobResultLike | null | undefined): {
  incomplete: boolean;
  failures: FuelFinalizeJobFailure[];
  driversDoneCount: number;
  toastMessage: string;
} {
  const failures = Array.isArray(jobRes?.failures) ? jobRes!.failures! : [];
  const driversDoneCount = Array.isArray(jobRes?.driversDone) ? jobRes!.driversDone!.length : 0;
  const incomplete =
    jobRes?.state === 'failed' || jobRes?.ok === false || failures.length > 0;

  let toastMessage = '';
  if (incomplete) {
    toastMessage = failures.length
      ? `Finalize incomplete — ${driversDoneCount} settled, ${failures.length} failed. Week stays open; retry to finish.`
      : `Finalize incomplete — ${jobRes?.error || 'server job failed'}. Week was not locked.`;
  }

  return { incomplete, failures, driversDoneCount, toastMessage };
}
