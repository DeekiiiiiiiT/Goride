/**
 * FO-01: the open fill lives on the phone from the first photo, so a screen kill or app
 * close loses nothing. Details in localStorage, photos in the phone's file database.
 * Cancel (before Save) is the only way a draft is thrown away — after Save the waiting
 * list owns it and it is never deleted on the phone (FO-18).
 */
import { offlineBlobStore } from '../../../services/offlineBlobStore';
import { odometerBlobKey, pumpBlobKey, type FuelPhotoDraft } from './fuelPhotoFill';

const DRAFT_KEY = 'roam:driver:fuel-photo-draft';
/** A draft older than this is not offered again (photos stay until Cancel). */
const RESUME_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function loadFuelPhotoDraft(nowMs = Date.now()): FuelPhotoDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as FuelPhotoDraft;
    if (!d?.captureId || nowMs - Number(d.savedAt || 0) > RESUME_MAX_AGE_MS) return null;
    // Nothing to finish until the first photo exists (a location alone is not a fill).
    if (!d.hasOdometerPhoto) return null;
    return d;
  } catch {
    return null;
  }
}

export function saveFuelPhotoDraft(d: FuelPhotoDraft): FuelPhotoDraft {
  const next = { ...d, savedAt: Date.now() };
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
  } catch {
    /* storage full — the photos are still in the file database */
  }
  return next;
}

export async function putDraftPhoto(captureId: string, kind: 'odometer' | 'pump', file: Blob): Promise<void> {
  await offlineBlobStore.put(kind === 'odometer' ? odometerBlobKey(captureId) : pumpBlobKey(captureId), file);
}

export async function getDraftPhoto(captureId: string, kind: 'odometer' | 'pump'): Promise<Blob | null> {
  try {
    return await offlineBlobStore.get(kind === 'odometer' ? odometerBlobKey(captureId) : pumpBlobKey(captureId));
  } catch {
    return null;
  }
}

/** After Save: the waiting list now owns the photos; only the draft details go. */
export function releaseFuelPhotoDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

/** Cancel before Save: nothing was logged, so the draft and its photos go. */
export async function cancelFuelPhotoDraft(captureId: string): Promise<void> {
  releaseFuelPhotoDraft();
  await offlineBlobStore.removeMany([odometerBlobKey(captureId), pumpBlobKey(captureId)]);
}
