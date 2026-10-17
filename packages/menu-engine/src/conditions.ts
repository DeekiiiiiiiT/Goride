import type { OrderSelection, SelectionCondition } from './types.ts';

export function selectionMatches(condition: SelectionCondition | null | undefined, selections: OrderSelection[]): boolean {
  if (!condition) return true;
  const picked = selections.filter((s) => s.groupId === condition.groupId).map((s) => s.optionId);
  if (condition.op === 'eq') {
    return picked.length === 1 && condition.optionIds.includes(picked[0]);
  }
  return condition.optionIds.some((id) => picked.includes(id));
}

export function flattenSelections(selections: OrderSelection[]): OrderSelection[] {
  const out: OrderSelection[] = [];
  for (const sel of selections) {
    out.push(sel);
    if (sel.children?.length) out.push(...flattenSelections(sel.children));
  }
  return out;
}
