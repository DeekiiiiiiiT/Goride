import { toast } from 'sonner';
import { api } from '../services/api';

type WithRawFile = { type: string; rawFile?: File };

/** The original Uber CSVs (trip activity + payments transaction) among a set of read files. */
export function uberTollFilesFrom(files: ReadonlyArray<WithRawFile>): { paymentsTransaction?: File; tripActivity?: File } {
  return {
    paymentsTransaction: files.find((f) => f.type === 'uber_payment' && f.rawFile)?.rawFile,
    tripActivity: files.find((f) => f.type === 'uber_trip' && f.rawFile)?.rawFile,
  };
}

/**
 * Uber files → the new toll system (toll paybacks and take-backs). Every Uber upload calls this, wherever it is made.
 * The trips are already saved when it runs, so a failure is reported, never thrown. Repeating a file changes nothing.
 */
export async function readUberTollsIntoNewSystem(files: { paymentsTransaction?: File; tripActivity?: File }): Promise<void> {
  const main = files.tripActivity ?? files.paymentsTransaction;
  if (!main) return;
  try {
    await api.importTollFileV2({
      kind: 'uber',
      commandId: crypto.randomUUID(),
      file: main,
      paymentsTransaction: files.paymentsTransaction,
      tripActivity: files.tripActivity,
    });
  } catch (e) {
    toast.error(
      `Trips saved, but the Uber tolls couldn't be read: ${e instanceof Error ? e.message : String(e)}. Upload the Uber files again in Week Reconciliation step 1.`,
    );
  }
}
