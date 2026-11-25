/** toll_v2 reads (toll_v2_weeks, toll_v2_metrics, toll_v2_week_desk) answer a permission refusal with
 *  P0001 ('FORBIDDEN' / 'NO_COMPANY') or 42501, not with a network error. The screens say why instead of
 *  "check your connection".
 *  P0001 is also used for refusals that are not about access — 'BAD_REQUEST' (a week key that is not a
 *  Monday) and the command refusals — so the message is checked too. */
export const TOLL_V2_NO_ACCESS_MESSAGE = "You don't have access to toll data for this company.";

export function isTollReadAccessRefusal(error: unknown): boolean {
  const { code, message } = (error as { code?: unknown; message?: unknown } | null) ?? {};
  if (code === '42501') return true;
  if (code !== 'P0001') return false;
  const text = String(message ?? '');
  return text.includes('FORBIDDEN') || text.includes('NO_COMPANY');
}
