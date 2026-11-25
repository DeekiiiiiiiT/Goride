/** toll_v2 reads (toll_v2_weeks, toll_v2_metrics) answer a permission refusal with P0001 ('FORBIDDEN' /
 *  'NO_COMPANY') or 42501, not with a network error. The screens say why instead of "check your connection". */
export const TOLL_V2_NO_ACCESS_MESSAGE = "You don't have access to toll data for this company.";

export function isTollReadAccessRefusal(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 'P0001' || code === '42501';
}
