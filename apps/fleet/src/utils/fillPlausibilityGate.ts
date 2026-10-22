import {
  assessFillPlausibility,
  type FillPlausibilityInput,
} from '@roam/fuel-core/fillPlausibility';

/** Hard stops refuse the save. Confirm-level issues need an explicit yes. */
export function confirmFillPlausibility(
  input: FillPlausibilityInput,
  confirm: (message: string) => boolean = (message) =>
    typeof window !== 'undefined' && window.confirm(message),
): { ok: boolean; accepted: boolean; message?: string } {
  const issues = assessFillPlausibility(input);
  const block = issues.find((issue) => issue.severity === 'block');
  if (block) return { ok: false, accepted: false, message: block.message };
  const confirms = issues.filter((issue) => issue.severity === 'confirm');
  if (!confirms.length) return { ok: true, accepted: false };
  const message = confirms.map((issue) => issue.message).join('\n');
  if (!confirm(message)) return { ok: false, accepted: false, message: 'Fill not confirmed' };
  return { ok: true, accepted: true };
}
