import type { PlayStoreChecklistItemDef, PlayStoreChecklistState } from './types';

export function computePlayStoreProgress(
  catalog: PlayStoreChecklistItemDef[],
  checklist: PlayStoreChecklistState,
): { done: number; total: number; percent: number } {
  const countable = catalog.filter((item) => !item.optional);
  const total = countable.length;
  const done = countable.filter((item) => {
    const state = checklist[item.id];
    return state?.status === 'done' || state?.status === 'na';
  }).length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return { done, total, percent };
}
