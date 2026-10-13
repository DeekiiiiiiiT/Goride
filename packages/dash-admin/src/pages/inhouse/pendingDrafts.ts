export type PendingDraftRef = {
  id: string;
  resume?: boolean;
};

/** Add this restaurant, or replace only the same one if they continued it. */
export function parkDraft<T extends { id: string }>(stored: T[], draft: T): T[] {
  return [draft, ...stored.filter((item) => item.id !== draft.id)];
}

/** A saved restaurant stays in Pending. The create form opens it only after Continue. */
export function shouldResumeOpen(open: PendingDraftRef | null, pending: Array<{ id: string }>): boolean {
  if (!open) return false;
  return !(pending.some((item) => item.id === open.id) && !open.resume);
}
